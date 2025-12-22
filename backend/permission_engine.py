"""
Permission Engine - 100% Database-Driven
NO hard-coded role logic. All rules come from Admin GUI configuration.
"""
from typing import Optional, Dict, List
from motor.motor_asyncio import AsyncIOMotorDatabase
from admin_models import PermissionScope, PermissionAction, PermissionResult
import logging
import re

logger = logging.getLogger(__name__)


class PermissionEngine:
    """
    Generic permission evaluator - knows nothing about specific roles
    All behavior is defined by database configuration from Admin GUI
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def check_permission(
        self,
        user_id: str,
        entity: str,
        action: PermissionAction,
        resource_owner_id: Optional[str] = None,
        resource_team_id: Optional[str] = None
    ) -> PermissionResult:
        """
        Check if user has permission to perform action on entity
        
        Args:
            user_id: User performing action
            entity: Entity type (e.g., "leads", "contacts")
            action: Action to perform (read, create, edit, delete, etc.)
            resource_owner_id: Owner of the resource (for own/team scope checking)
            resource_team_id: Team of the resource (for team scope checking)
        
        Returns:
            PermissionResult with allowed flag and scope
        """
        try:
            # Get user to find their role
            user = await self.db.crm_users.find_one({"id": user_id})
            if not user:
                return PermissionResult(allowed=False, scope=PermissionScope.NONE, reason="User not found")
            
            user_role_name = user.get("role")
            user_team_id = user.get("team_id")
            
            # Find the role document (case-insensitive match)
            role = await self.db.roles.find_one({
                "name": re.compile(f"^{user_role_name}$", re.IGNORECASE)
            })
            if not role:
                return PermissionResult(allowed=False, scope=PermissionScope.NONE, reason="Role not found in system")
            
            role_ids = [role["id"]]
            
            # Get permissions for these roles and this entity/action
            permissions = await self.db.permissions.find({
                "role_id": {"$in": role_ids},
                "entity": entity,
                "action": action.value
            }).to_list(100)
            
            if not permissions:
                return PermissionResult(allowed=False, scope=PermissionScope.NONE, reason="No permission rules found")
            
            # Find the most permissive scope across all roles
            # Priority: all > team > own > none
            scope_priority = {
                PermissionScope.ALL: 4,
                PermissionScope.TEAM: 3,
                PermissionScope.OWN: 2,
                PermissionScope.NONE: 1,
                "yes": 4,  # For create/assign/export
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
            
            # For create/assign/export actions, convert yes/no to allowed/denied
            if action in [PermissionAction.CREATE, PermissionAction.ASSIGN, PermissionAction.EXPORT]:
                allowed = best_scope != PermissionScope.NONE
                return PermissionResult(allowed=allowed, scope=best_scope, reason=f"Permission: {best_scope}")
            
            # For read/edit/delete, check if scope allows access to resource
            if best_scope == PermissionScope.NONE:
                return PermissionResult(allowed=False, scope=best_scope, reason="Permission denied")
            
            if best_scope == PermissionScope.ALL:
                return PermissionResult(allowed=True, scope=best_scope, reason="Full access")
            
            # Check OWN scope
            if best_scope == PermissionScope.OWN:
                if resource_owner_id and resource_owner_id == user_id:
                    return PermissionResult(allowed=True, scope=best_scope, reason="Own resource")
                return PermissionResult(allowed=False, scope=best_scope, reason="Not own resource")
            
            # Check TEAM scope
            if best_scope == PermissionScope.TEAM:
                if resource_team_id and user_team_id:
                    # Check if user is in the same team
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
        """
        Get the effective scope a user has for an entity/action without checking against a specific resource.
        This is used for listing/filtering operations.
        """
        try:
            # Get user to find their role
            user = await self.db.crm_users.find_one({"id": user_id})
            if not user:
                return PermissionScope.NONE
            
            user_role_name = user.get("role")
            
            # Find the role document (case-insensitive match)
            role = await self.db.roles.find_one({
                "name": re.compile(f"^{user_role_name}$", re.IGNORECASE)
            })
            if not role:
                return PermissionScope.NONE
            
            # Get permissions for this role and entity/action
            permissions = await self.db.permissions.find({
                "role_id": role["id"],
                "entity": entity,
                "action": action.value
            }).to_list(100)
            
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
        Get MongoDB filter for data scoping based on user permissions
        Returns filter that should be applied to queries
        
        This is used when listing records to enforce data visibility
        """
        # Get user's scope for this entity
        scope = await self.get_user_scope_for_entity(user_id, entity, PermissionAction.READ)
        
        if scope == PermissionScope.NONE:
            # No read access - return filter that matches nothing
            return {"_id": {"$exists": False}}
        
        if scope == PermissionScope.ALL:
            # Full access - no filter needed
            return {}
        
        if scope == PermissionScope.OWN:
            # Only own records
            return {"assigned_to": user_id}
        
        if scope == PermissionScope.TEAM:
            # Team records - for entities with assigned_to (like leads), 
            # we need to find all team members and filter by their IDs
            user = await self.db.crm_users.find_one({"id": user_id})
            user_team_id = user.get("team_id") if user else None
            
            # For supervisors, also check teams they supervise
            supervised_teams = await self.db.teams.find({"supervisor_id": user_id}).to_list(100)
            supervised_team_ids = [t["id"] for t in supervised_teams]
            
            all_team_ids = set()
            if user_team_id:
                all_team_ids.add(user_team_id)
            all_team_ids.update(supervised_team_ids)
            
            if all_team_ids:
                # For leads (which use assigned_to), find all users in these teams
                if entity == "leads":
                    team_members = await self.db.crm_users.find(
                        {"team_id": {"$in": list(all_team_ids)}},
                        {"id": 1}
                    ).to_list(1000)
                    member_ids = [m["id"] for m in team_members]
                    if member_ids:
                        return {"assigned_to": {"$in": member_ids}}
                    else:
                        return {"_id": {"$exists": False}}
                else:
                    # For other entities, use team_id filter
                    return {"team_id": {"$in": list(all_team_ids)}}
            else:
                # User has no team - return nothing
                return {"_id": {"$exists": False}}
        
        # Default: no access
        return {"_id": {"$exists": False}}
    
    async def get_user_effective_permissions(self, user_id: str) -> Dict[str, Dict[str, str]]:
        """
        Get all effective permissions for a user (for UI display)
        Returns: {entity: {action: scope, ...}, ...}
        """
        try:
            # Get user's roles
            user_roles = await self.db.user_roles.find({"user_id": user_id}).to_list(100)
            if not user_roles:
                return {}
            
            role_ids = [ur["role_id"] for ur in user_roles]
            
            # Get all permissions for these roles
            permissions = await self.db.permissions.find({
                "role_id": {"$in": role_ids}
            }).to_list(1000)
            
            # Build permission map
            perm_map = {}
            
            for perm in permissions:
                entity = perm["entity"]
                action = perm["action"]
                scope = perm["scope"]
                
                if entity not in perm_map:
                    perm_map[entity] = {}
                
                # Keep most permissive
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
