"""
Permission Engine - 100% Database-Driven with In-Memory Caching
NO hard-coded role logic. All rules come from Admin GUI configuration.

Performance optimization: Caches users, roles, permissions, and team data
in memory with configurable TTL to eliminate redundant DB queries.
Each API request was making 8-12 DB round-trips for auth/permissions alone.
With caching, most requests make 0 DB queries for permission checks.
"""
from typing import Optional, Dict, List
from motor.motor_asyncio import AsyncIOMotorDatabase
from admin_models import PermissionScope, PermissionAction, PermissionResult
import logging
import re
import time

logger = logging.getLogger(__name__)

# ============================================
# IN-MEMORY CACHE (eliminates ~10 DB queries per request)
# ============================================
CACHE_TTL = 30  # seconds - short enough to pick up admin changes quickly

class PermissionCache:
    """Thread-safe in-memory cache for permission data"""
    
    def __init__(self, ttl: int = CACHE_TTL):
        self.ttl = ttl
        self._users = {}        # user_id -> user_doc
        self._roles = {}        # role_name (lowercase) -> role_doc
        self._permissions = {}  # (role_id, entity, action) -> [permission_docs]
        self._team_members = {} # team_id -> [user_ids]
        self._supervised_teams = {}  # user_id -> [team_ids]
        self._timestamps = {}   # cache_key -> last_refresh_time
    
    def _is_expired(self, key: str) -> bool:
        ts = self._timestamps.get(key, 0)
        return (time.time() - ts) > self.ttl
    
    def get_user(self, user_id: str):
        key = f"user:{user_id}"
        if self._is_expired(key):
            return None
        return self._users.get(user_id)
    
    def set_user(self, user_id: str, user_doc: dict):
        self._users[user_id] = user_doc
        self._timestamps[f"user:{user_id}"] = time.time()
    
    def get_role(self, role_name: str):
        key = f"role:{role_name.lower()}"
        if self._is_expired(key):
            return None
        return self._roles.get(role_name.lower())
    
    def set_role(self, role_name: str, role_doc: dict):
        self._roles[role_name.lower()] = role_doc
        self._timestamps[f"role:{role_name.lower()}"] = time.time()
    
    def get_permissions(self, role_id: str, entity: str, action: str):
        key = f"perm:{role_id}:{entity}:{action}"
        if self._is_expired(key):
            return None
        return self._permissions.get(key)
    
    def set_permissions(self, role_id: str, entity: str, action: str, perms: list):
        key = f"perm:{role_id}:{entity}:{action}"
        self._permissions[key] = perms
        self._timestamps[key] = time.time()
    
    def get_team_members(self, team_ids: tuple):
        key = f"members:{','.join(sorted(team_ids))}"
        if self._is_expired(key):
            return None
        return self._team_members.get(key)
    
    def set_team_members(self, team_ids: tuple, member_ids: list):
        key = f"members:{','.join(sorted(team_ids))}"
        self._team_members[key] = member_ids
        self._timestamps[key] = time.time()
    
    def get_supervised_teams(self, user_id: str):
        key = f"supervised:{user_id}"
        if self._is_expired(key):
            return None
        return self._supervised_teams.get(user_id)
    
    def set_supervised_teams(self, user_id: str, team_ids: list):
        self._supervised_teams[user_id] = team_ids
        self._timestamps[f"supervised:{user_id}"] = time.time()
    
    def invalidate_all(self):
        """Clear all caches - call when admin changes permissions"""
        self._users.clear()
        self._roles.clear()
        self._permissions.clear()
        self._team_members.clear()
        self._supervised_teams.clear()
        self._timestamps.clear()
        logger.info("[CACHE] All permission caches invalidated")


class PermissionEngine:
    """
    Generic permission evaluator - knows nothing about specific roles
    All behavior is defined by database configuration from Admin GUI.
    
    Optimized with in-memory caching to reduce DB queries from ~10 to ~0 per request.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.cache = PermissionCache()
    
    def invalidate_cache(self):
        """Call this when admin changes roles/permissions/teams"""
        self.cache.invalidate_all()
    
    async def _get_user(self, user_id: str) -> Optional[dict]:
        """Get user with caching"""
        cached = self.cache.get_user(user_id)
        if cached is not None:
            return cached
        user = await self.db.crm_users.find_one({"id": user_id})
        if user:
            self.cache.set_user(user_id, user)
        return user
    
    async def _get_role(self, role_name: str) -> Optional[dict]:
        """Get role with caching"""
        cached = self.cache.get_role(role_name)
        if cached is not None:
            return cached
        role = await self.db.roles.find_one({
            "name": re.compile(f"^{role_name}$", re.IGNORECASE)
        })
        if role:
            self.cache.set_role(role_name, role)
        return role
    
    async def _get_permissions(self, role_id: str, entity: str, action: str) -> list:
        """Get permissions with caching"""
        cached = self.cache.get_permissions(role_id, entity, action)
        if cached is not None:
            return cached
        perms = await self.db.permissions.find({
            "role_id": role_id,
            "entity": entity,
            "action": action
        }).to_list(100)
        self.cache.set_permissions(role_id, entity, action, perms)
        return perms
    
    def _resolve_best_scope(self, permissions: list) -> PermissionScope:
        """Find the most permissive scope from a list of permission docs"""
        scope_priority = {
            PermissionScope.ALL: 4,
            PermissionScope.TEAM: 3,
            PermissionScope.OWN: 2,
            PermissionScope.NONE: 1,
            "yes": 4,
            "no": 1
        }
        
        best_scope = PermissionScope.NONE
        best_priority = 0
        
        for perm in permissions:
            scope_value = perm.get("scope", "none")
            priority = scope_priority.get(scope_value, 0)
            
            if priority > best_priority:
                best_priority = priority
                if scope_value in ["yes", "no"]:
                    best_scope = PermissionScope.ALL if scope_value == "yes" else PermissionScope.NONE
                else:
                    best_scope = PermissionScope(scope_value)
        
        return best_scope

    async def check_permission(
        self,
        user_id: str,
        entity: str,
        action: PermissionAction,
        resource_owner_id: Optional[str] = None,
        resource_team_id: Optional[str] = None
    ) -> PermissionResult:
        """
        Check if user has permission to perform action on entity.
        Cached: typically 0 DB queries after first call.
        """
        try:
            user = await self._get_user(user_id)
            if not user:
                return PermissionResult(allowed=False, scope=PermissionScope.NONE, reason="User not found")
            
            user_role_name = user.get("role")
            user_team_id = user.get("team_id")
            
            role = await self._get_role(user_role_name)
            if not role:
                return PermissionResult(allowed=False, scope=PermissionScope.NONE, reason="Role not found in system")
            
            permissions = await self._get_permissions(role["id"], entity, action.value)
            
            if not permissions:
                return PermissionResult(allowed=False, scope=PermissionScope.NONE, reason="No permission rules found")
            
            best_scope = self._resolve_best_scope(permissions)
            
            # For create/assign/export actions
            if action in [PermissionAction.CREATE, PermissionAction.ASSIGN, PermissionAction.EXPORT]:
                allowed = best_scope != PermissionScope.NONE
                return PermissionResult(allowed=allowed, scope=best_scope, reason=f"Permission: {best_scope}")
            
            # For read/edit/delete
            if best_scope == PermissionScope.NONE:
                return PermissionResult(allowed=False, scope=best_scope, reason="Permission denied")
            
            if best_scope == PermissionScope.ALL:
                return PermissionResult(allowed=True, scope=best_scope, reason="Full access")
            
            if best_scope == PermissionScope.OWN:
                if resource_owner_id and resource_owner_id == user_id:
                    return PermissionResult(allowed=True, scope=best_scope, reason="Own resource")
                return PermissionResult(allowed=False, scope=best_scope, reason="Not own resource")
            
            if best_scope == PermissionScope.TEAM:
                if resource_team_id and user_team_id:
                    if resource_team_id == user_team_id:
                        return PermissionResult(allowed=True, scope=best_scope, reason="Same team")
                return PermissionResult(allowed=False, scope=best_scope, reason="Different team")
            
            return PermissionResult(allowed=False, scope=best_scope, reason="Unknown scope")
            
        except Exception as e:
            logger.error(f"Permission check error: {e}")
            return PermissionResult(allowed=False, scope=PermissionScope.NONE, reason=f"Error: {str(e)}")
    
    async def get_user_scope_for_entity(
        self,
        user_id: str,
        entity: str,
        action: PermissionAction = PermissionAction.READ
    ) -> PermissionScope:
        """Get the effective scope a user has for an entity/action. Cached."""
        try:
            user = await self._get_user(user_id)
            if not user:
                return PermissionScope.NONE
            
            user_role_name = user.get("role")
            
            role = await self._get_role(user_role_name)
            if not role:
                return PermissionScope.NONE
            
            permissions = await self._get_permissions(role["id"], entity, action.value)
            
            if not permissions:
                return PermissionScope.NONE
            
            # Find the most permissive scope
            scope_priority = {
                PermissionScope.ALL: 4,
                PermissionScope.TEAM: 3,
                PermissionScope.OWN: 2,
                PermissionScope.NONE: 1,
            }
            
            best_scope = PermissionScope.NONE
            for perm in permissions:
                scope_value = perm.get("scope", "none")
                if scope_value in ["yes", "all"]:
                    scope = PermissionScope.ALL
                elif scope_value == "team":
                    scope = PermissionScope.TEAM
                elif scope_value == "own":
                    scope = PermissionScope.OWN
                elif scope_value in ["no", "none"]:
                    scope = PermissionScope.NONE
                else:
                    scope = PermissionScope.NONE
                    
                if scope_priority.get(scope, 0) > scope_priority.get(best_scope, 0):
                    best_scope = scope
            
            return best_scope
            
        except Exception as e:
            logger.error(f"Error getting user scope: {e}")
            return PermissionScope.NONE
    
    async def get_data_scope_filter(
        self,
        user_id: str,
        entity: str
    ) -> Dict:
        """
        Get MongoDB filter for data scoping based on user permissions.
        Cached: team member lookups are cached to avoid repeated queries.
        """
        scope = await self.get_user_scope_for_entity(user_id, entity, PermissionAction.READ)
        
        if scope == PermissionScope.NONE:
            return {"_id": {"$exists": False}}
        
        if scope == PermissionScope.ALL:
            return {}
        
        if scope == PermissionScope.OWN:
            return {"assigned_to": user_id}
        
        if scope == PermissionScope.TEAM:
            user = await self._get_user(user_id)
            user_team_id = user.get("team_id") if user else None
            
            # Get supervised teams (cached)
            supervised_team_ids = self.cache.get_supervised_teams(user_id)
            if supervised_team_ids is None:
                supervised_teams = await self.db.teams.find({"supervisor_id": user_id}).to_list(100)
                supervised_team_ids = [t["id"] for t in supervised_teams]
                self.cache.set_supervised_teams(user_id, supervised_team_ids)
            
            all_team_ids = set()
            if user_team_id:
                all_team_ids.add(user_team_id)
            all_team_ids.update(supervised_team_ids)
            
            if all_team_ids:
                if entity == "leads":
                    # Get team member IDs (cached)
                    team_ids_tuple = tuple(sorted(all_team_ids))
                    member_ids = self.cache.get_team_members(team_ids_tuple)
                    if member_ids is None:
                        team_members = await self.db.crm_users.find(
                            {"team_id": {"$in": list(all_team_ids)}},
                            {"id": 1}
                        ).to_list(1000)
                        member_ids = [m["id"] for m in team_members]
                        self.cache.set_team_members(team_ids_tuple, member_ids)
                    
                    if member_ids:
                        return {"assigned_to": {"$in": member_ids}}
                    else:
                        return {"_id": {"$exists": False}}
                else:
                    return {"team_id": {"$in": list(all_team_ids)}}
            else:
                return {"_id": {"$exists": False}}
        
        return {"_id": {"$exists": False}}
    
    async def get_user_effective_permissions(self, user_id: str) -> Dict[str, Dict[str, str]]:
        """Get all effective permissions for a user (for UI display)"""
        try:
            user_roles = await self.db.user_roles.find({"user_id": user_id}).to_list(100)
            if not user_roles:
                return {}
            
            role_ids = [ur["role_id"] for ur in user_roles]
            
            permissions = await self.db.permissions.find({
                "role_id": {"$in": role_ids}
            }).to_list(1000)
            
            perm_map = {}
            
            for perm in permissions:
                entity = perm["entity"]
                action = perm["action"]
                scope = perm["scope"]
                
                if entity not in perm_map:
                    perm_map[entity] = {}
                
                current = perm_map[entity].get(action, "none")
                scope_priority = {"all": 4, "team": 3, "own": 2, "none": 1, "yes": 4, "no": 1}
                
                if scope_priority.get(scope, 0) > scope_priority.get(current, 0):
                    perm_map[entity][action] = scope
            
            return perm_map
            
        except Exception as e:
            logger.error(f"Error getting effective permissions: {e}")
            return {}


# Singleton instance
_permission_engine = None

def get_permission_engine(db: AsyncIOMotorDatabase) -> PermissionEngine:
    """Get or create permission engine instance"""
    global _permission_engine
    if _permission_engine is None:
        _permission_engine = PermissionEngine(db)
    return _permission_engine
