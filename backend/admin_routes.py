"""
Admin Panel API Routes
Serves Admin GUI configuration only - no business logic
All changes persist to database and take effect immediately
"""
from fastapi import APIRouter, HTTPException, Depends, Header
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import logging

from admin_models import (
    Role, RoleCreate, RoleUpdate,
    Permission, PermissionBulkUpdate,
    EntityConfig, EntityConfigUpdate,
    PermissionMatrixRow, RoleWithPermissions,
    PermissionAction, PermissionScope,
    UserRole, UserTeam
)

# Will be set from server.py to avoid circular import
db = None

def init_admin_db(database):
    """Initialize database connection"""
    global db
    db = database

logger = logging.getLogger(__name__)

admin_router = APIRouter(prefix="/api/admin", tags=["admin"])


# ============================================
# AUTHENTICATION DEPENDENCY
# ============================================

async def get_current_user(authorization: Optional[str] = Header(None)):
    """
    Get current user from JWT token
    Copied from crm_routes to avoid circular dependency
    """
    from auth_utils import decode_token
    
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authentication format")
    
    token = authorization.replace("Bearer ", "")
    
    try:
        payload = decode_token(token)
        user_id = payload.get("user_id")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Get user from database
        user = await db.crm_users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        return user
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


# ============================================
# ADMIN ACCESS CONTROL
# ============================================

async def require_admin(current_user: dict = Depends(get_current_user)):
    """
    Verify user has admin access
    NOTE: This checks user_roles collection, not hard-coded role field
    """
    # Check if user has admin role in user_roles collection
    user_role = await db.user_roles.find_one({
        "user_id": current_user["id"]
    })
    
    if not user_role:
        # Fallback: check old role field during migration
        if current_user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
    else:
        # Check if user has a role named "admin"
        role = await db.roles.find_one({"id": user_role["role_id"]})
        if not role or role["name"].lower() != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
    
    return current_user


# ============================================
# ROLES MANAGEMENT
# ============================================

@admin_router.get("/roles", dependencies=[Depends(require_admin)])
async def get_roles():
    """Get all roles - for Role Management UI"""
    roles = await db.roles.find({}, {"_id": 0}).to_list(1000)
    return roles


@admin_router.post("/roles", dependencies=[Depends(require_admin)])
async def create_role(role_data: RoleCreate):
    """Create new role via Admin GUI"""
    role = Role(
        name=role_data.name,
        description=role_data.description,
        is_system=False
    )
    
    await db.roles.insert_one(role.dict())
    
    logger.info(f"Role created: {role.name}")
    return role


@admin_router.put("/roles/{role_id}", dependencies=[Depends(require_admin)])
async def update_role(role_id: str, role_data: RoleUpdate):
    """Update role via Admin GUI - even system roles are editable"""
    role = await db.roles.find_one({"id": role_id})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    update_dict = {k: v for k, v in role_data.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc)
    
    await db.roles.update_one({"id": role_id}, {"$set": update_dict})
    
    logger.info(f"Role updated: {role_id}")
    return {"success": True}


@admin_router.delete("/roles/{role_id}", dependencies=[Depends(require_admin)])
async def delete_role(role_id: str):
    """Delete role via Admin GUI - with confirmation for system roles"""
    role = await db.roles.find_one({"id": role_id})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Check if role is in use
    users_with_role = await db.user_roles.count_documents({"role_id": role_id})
    if users_with_role > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete role: {users_with_role} user(s) still have this role"
        )
    
    # Delete role and its permissions
    await db.roles.delete_one({"id": role_id})
    await db.permissions.delete_many({"role_id": role_id})
    
    logger.info(f"Role deleted: {role_id}")
    return {"success": True}


# ============================================
# PERMISSION MATRIX
# ============================================

@admin_router.get("/roles/{role_id}/permissions", dependencies=[Depends(require_admin)])
async def get_role_permissions(role_id: str):
    """
    Get permission matrix for role - for Permission Matrix UI
    Returns grid data for all entities
    """
    role = await db.roles.find_one({"id": role_id}, {"_id": 0})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Get all enabled entities
    entities = await db.entity_configs.find({"enabled": True}, {"_id": 0}).sort("order", 1).to_list(100)
    
    # Get all permissions for this role
    permissions = await db.permissions.find({"role_id": role_id}, {"_id": 0}).to_list(1000)
    
    # Build permission map
    perm_map = {}
    for perm in permissions:
        entity = perm["entity"]
        action = perm["action"]
        scope = perm["scope"]
        
        if entity not in perm_map:
            perm_map[entity] = {}
        perm_map[entity][action] = scope
    
    # Build matrix rows
    matrix_rows = []
    for entity in entities:
        entity_name = entity["entity_name"]
        matrix_rows.append({
            "entity": entity_name,
            "display_name": entity["display_name"],
            "read": perm_map.get(entity_name, {}).get("read", "none"),
            "create": perm_map.get(entity_name, {}).get("create", "no"),
            "edit": perm_map.get(entity_name, {}).get("edit", "none"),
            "delete": perm_map.get(entity_name, {}).get("delete", "none"),
            "assign": perm_map.get(entity_name, {}).get("assign", "no"),
            "export": perm_map.get(entity_name, {}).get("export", "no")
        })
    
    return {
        "role": role,
        "permissions": matrix_rows
    }


@admin_router.put("/roles/{role_id}/permissions", dependencies=[Depends(require_admin)])
async def update_role_permissions(role_id: str, bulk_update: PermissionBulkUpdate):
    """
    Bulk update permissions from Permission Matrix UI
    Replaces all permissions for role with new configuration
    """
    role = await db.roles.find_one({"id": role_id})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Delete existing permissions for this role
    await db.permissions.delete_many({"role_id": role_id})
    
    # Insert new permissions
    new_permissions = []
    for perm_data in bulk_update.permissions:
        perm = Permission(
            role_id=role_id,
            entity=perm_data["entity"],
            action=PermissionAction(perm_data["action"]),
            scope=perm_data["scope"]
        )
        new_permissions.append(perm.dict())
    
    if new_permissions:
        await db.permissions.insert_many(new_permissions)
    
    logger.info(f"Permissions updated for role: {role_id}, count: {len(new_permissions)}")
    return {"success": True, "count": len(new_permissions)}


# ============================================
# ENTITY CONFIGURATION
# ============================================

@admin_router.get("/entities", dependencies=[Depends(require_admin)])
async def get_entities():
    """Get all entity configurations - for Entity Config UI"""
    entities = await db.entity_configs.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    return entities


@admin_router.put("/entities/{entity_name}", dependencies=[Depends(require_admin)])
async def update_entity(entity_name: str, entity_data: EntityConfigUpdate):
    """Update entity configuration via Admin GUI"""
    entity = await db.entity_configs.find_one({"entity_name": entity_name})
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    
    update_dict = {k: v for k, v in entity_data.dict().items() if v is not None}
    
    await db.entity_configs.update_one(
        {"entity_name": entity_name},
        {"$set": update_dict}
    )
    
    logger.info(f"Entity updated: {entity_name}")
    return {"success": True}


# ============================================
# USERS MANAGEMENT (Full CRUD via Admin GUI)
# ============================================

@admin_router.get("/users", dependencies=[Depends(require_admin)])
async def get_all_users():
    """Get all users for admin management - includes deleted users"""
    users = await db.crm_users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    return users


@admin_router.post("/users", dependencies=[Depends(require_admin)])
async def create_user_admin(user_data: dict, current_user: dict = Depends(get_current_user)):
    """Create new user via Admin GUI"""
    from auth_utils import hash_password
    from uuid import uuid4
    from datetime import datetime, timezone
    
    # Validate required fields
    if not user_data.get("username") or not user_data.get("full_name") or not user_data.get("password"):
        raise HTTPException(status_code=400, detail="Username, full_name, and password are required")
    
    # Check if username already exists
    existing = await db.crm_users.find_one({"username": user_data["username"]})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Handle team_ids - filter out empty strings and 'none' values
    team_ids = user_data.get("team_ids", [])
    if isinstance(team_ids, list):
        team_ids = [t for t in team_ids if t and t != 'none']
    else:
        team_ids = []
    
    default_team = user_data.get("default_team_id")
    if default_team == 'none' or default_team == '':
        default_team = None
    
    # Build user document
    user_id = str(uuid4())
    new_user = {
        "id": user_id,
        "username": user_data["username"],
        "full_name": user_data["full_name"],
        "password": hash_password(user_data["password"]),
        "role": user_data.get("role", "agent"),
        "team_id": team_ids[0] if team_ids else default_team,
        "team_ids": team_ids,
        "default_team_id": default_team,
        "is_active": True,
        "is_system_user": user_data.get("is_system_user", False),
        "deleted_at": None,
        "created_at": datetime.now(timezone.utc),
        "created_by": current_user["id"],
        "last_login": None
    }
    
    await db.crm_users.insert_one(new_user)
    
    # Build clean response without password and _id
    logger.info(f"User {new_user['username']} created by admin {current_user['username']}")
    return {
        "id": user_id,
        "username": new_user["username"],
        "full_name": new_user["full_name"],
        "role": new_user["role"],
        "team_id": new_user["team_id"],
        "team_ids": new_user["team_ids"],
        "default_team_id": new_user["default_team_id"],
        "is_active": new_user["is_active"],
        "is_system_user": new_user["is_system_user"],
        "deleted_at": None,
        "created_at": new_user["created_at"].isoformat(),
        "last_login": None
    }


@admin_router.put("/users/{user_id}", dependencies=[Depends(require_admin)])
async def update_user_admin(user_id: str, user_data: dict, current_user: dict = Depends(get_current_user)):
    """Update user via Admin GUI"""
    from datetime import datetime, timezone
    
    user = await db.crm_users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Build update document
    update_fields = {}
    
    if "full_name" in user_data:
        update_fields["full_name"] = user_data["full_name"]
    if "username" in user_data and user_data["username"] != user["username"]:
        # Check if new username is available
        existing = await db.crm_users.find_one({"username": user_data["username"], "id": {"$ne": user_id}})
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists")
        update_fields["username"] = user_data["username"]
    if "role" in user_data:
        update_fields["role"] = user_data["role"]
    if "team_ids" in user_data:
        update_fields["team_ids"] = user_data["team_ids"]
        # Set team_id to first team for backward compatibility
        update_fields["team_id"] = user_data["team_ids"][0] if user_data["team_ids"] else None
    if "default_team_id" in user_data:
        update_fields["default_team_id"] = user_data["default_team_id"]
    if "is_system_user" in user_data:
        update_fields["is_system_user"] = user_data["is_system_user"]
    
    update_fields["updated_at"] = datetime.now(timezone.utc)
    
    await db.crm_users.update_one({"id": user_id}, {"$set": update_fields})
    
    logger.info(f"User {user_id} updated by admin {current_user['username']}")
    return {"success": True}


@admin_router.put("/users/{user_id}/password", dependencies=[Depends(require_admin)])
async def reset_user_password(user_id: str, password_data: dict, current_user: dict = Depends(get_current_user)):
    """Reset user password via Admin GUI - requires admin password verification"""
    from auth_utils import hash_password, verify_password
    
    # Verify admin's password first
    admin_password = password_data.get("admin_password")
    if not admin_password:
        raise HTTPException(status_code=400, detail="Admin password is required for verification")
    
    # Get admin user with password to verify
    admin_user = await db.crm_users.find_one({"id": current_user["id"]})
    if not admin_user:
        raise HTTPException(status_code=404, detail="Admin user not found")
    
    if not verify_password(admin_password, admin_user.get("password", "")):
        raise HTTPException(status_code=401, detail="Password amministratore non valida")
    
    # Now proceed with the password reset
    user = await db.crm_users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    new_password = password_data.get("new_password")
    if not new_password or len(new_password) < 4:
        raise HTTPException(status_code=400, detail="La nuova password deve essere di almeno 4 caratteri")
    
    await db.crm_users.update_one(
        {"id": user_id},
        {"$set": {"password": hash_password(new_password)}}
    )
    
    logger.info(f"Password reset for user {user_id} by admin {current_user['username']} (verified)")
    return {"success": True}


@admin_router.put("/users/{user_id}/status", dependencies=[Depends(require_admin)])
async def update_user_status(user_id: str, status_data: dict, current_user: dict = Depends(get_current_user)):
    """Activate/Deactivate user via Admin GUI"""
    from datetime import datetime, timezone
    
    user = await db.crm_users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Cannot change own status
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot change your own status")
    
    status = status_data.get("status")
    if status not in ["active", "inactive"]:
        raise HTTPException(status_code=400, detail="Status must be 'active' or 'inactive'")
    
    await db.crm_users.update_one(
        {"id": user_id},
        {"$set": {
            "is_active": status == "active",
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    logger.info(f"User {user_id} status changed to {status} by admin {current_user['username']}")
    return {"success": True}


@admin_router.delete("/users/{user_id}", dependencies=[Depends(require_admin)])
async def delete_user_admin(user_id: str, current_user: dict = Depends(get_current_user)):
    """Soft-delete user via Admin GUI"""
    from datetime import datetime, timezone
    
    user = await db.crm_users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Cannot delete yourself
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    # Check if already deleted
    if user.get("deleted_at"):
        raise HTTPException(status_code=400, detail="User already deleted")
    
    # Soft delete
    await db.crm_users.update_one(
        {"id": user_id},
        {"$set": {
            "deleted_at": datetime.now(timezone.utc),
            "is_active": False
        }}
    )
    
    logger.info(f"User {user_id} deleted by admin {current_user['username']}")
    return {"success": True}


# ============================================
# USER ROLES & TEAMS ASSIGNMENT
# ============================================

@admin_router.get("/users/{user_id}/roles", dependencies=[Depends(require_admin)])
async def get_user_roles(user_id: str):
    """Get roles assigned to user"""
    user_roles = await db.user_roles.find({"user_id": user_id}, {"_id": 0}).to_list(100)
    
    # Get full role details
    role_ids = [ur["role_id"] for ur in user_roles]
    roles = await db.roles.find({"id": {"$in": role_ids}}, {"_id": 0}).to_list(100)
    
    return roles


@admin_router.post("/users/{user_id}/roles/{role_id}", dependencies=[Depends(require_admin)])
async def assign_role_to_user(user_id: str, role_id: str):
    """Assign role to user via Admin GUI"""
    # Check if assignment already exists
    existing = await db.user_roles.find_one({"user_id": user_id, "role_id": role_id})
    if existing:
        return {"success": True, "message": "Role already assigned"}
    
    user_role = UserRole(user_id=user_id, role_id=role_id)
    await db.user_roles.insert_one(user_role.dict())
    
    logger.info(f"Role {role_id} assigned to user {user_id}")
    return {"success": True}


@admin_router.delete("/users/{user_id}/roles/{role_id}", dependencies=[Depends(require_admin)])
async def remove_role_from_user(user_id: str, role_id: str):
    """Remove role from user via Admin GUI"""
    result = await db.user_roles.delete_one({"user_id": user_id, "role_id": role_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Role assignment not found")
    
    logger.info(f"Role {role_id} removed from user {user_id}")
    return {"success": True}


# ============================================
# TEAMS MANAGEMENT (Full CRUD via Admin GUI)
# ============================================

@admin_router.get("/teams", dependencies=[Depends(require_admin)])
async def get_all_teams():
    """Get all teams for admin management - includes archived teams"""
    teams = await db.teams.find({}, {"_id": 0}).to_list(1000)
    return teams


@admin_router.post("/teams", dependencies=[Depends(require_admin)])
async def create_team_admin(team_data: dict, current_user: dict = Depends(get_current_user)):
    """Create new team via Admin GUI"""
    from uuid import uuid4
    from datetime import datetime, timezone
    
    # Validate required fields
    if not team_data.get("name"):
        raise HTTPException(status_code=400, detail="Team name is required")
    
    # Check if team name already exists
    existing = await db.teams.find_one({"name": team_data["name"]})
    if existing:
        raise HTTPException(status_code=400, detail="Team name already exists")
    
    # Validate supervisor if provided (must be admin or supervisor role)
    supervisor_id = team_data.get("supervisor_id")
    if supervisor_id:
        supervisor = await db.crm_users.find_one({"id": supervisor_id, "deleted_at": None})
        if not supervisor:
            raise HTTPException(status_code=400, detail="Supervisor not found")
        if supervisor.get("role", "").lower() not in ["admin", "supervisor"]:
            raise HTTPException(status_code=400, detail="Only users with Admin or Supervisor role can be team supervisors")
    
    # Build team document
    team_id = str(uuid4())
    new_team = {
        "id": team_id,
        "name": team_data["name"],
        "description": team_data.get("description", ""),
        "supervisor_id": supervisor_id or None,
        "archived_at": None,
        "created_at": datetime.now(timezone.utc),
        "created_by": current_user["id"]
    }
    
    # Store created_at before insert (MongoDB adds _id which causes serialization issues)
    created_at_str = new_team["created_at"].isoformat()
    
    await db.teams.insert_one(new_team)
    
    logger.info(f"Team {team_data['name']} created by admin {current_user['username']}")
    return {
        "id": team_id,
        "name": team_data["name"],
        "description": team_data.get("description", ""),
        "supervisor_id": supervisor_id or None,
        "archived_at": None,
        "created_at": created_at_str
    }


@admin_router.put("/teams/{team_id}", dependencies=[Depends(require_admin)])
async def update_team_admin(team_id: str, team_data: dict, current_user: dict = Depends(get_current_user)):
    """Update team via Admin GUI"""
    from datetime import datetime, timezone
    
    team = await db.teams.find_one({"id": team_id})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if team.get("archived_at"):
        raise HTTPException(status_code=400, detail="Cannot edit an archived team")
    
    # Build update document
    update_fields = {}
    
    if "name" in team_data and team_data["name"] != team["name"]:
        # Check if new name is available
        existing = await db.teams.find_one({"name": team_data["name"], "id": {"$ne": team_id}})
        if existing:
            raise HTTPException(status_code=400, detail="Team name already exists")
        update_fields["name"] = team_data["name"]
    
    if "description" in team_data:
        update_fields["description"] = team_data["description"]
    
    if "supervisor_id" in team_data:
        supervisor_id = team_data["supervisor_id"]
        if supervisor_id:
            supervisor = await db.crm_users.find_one({"id": supervisor_id, "deleted_at": None})
            if not supervisor:
                raise HTTPException(status_code=400, detail="Supervisor not found")
            if supervisor.get("role", "").lower() not in ["admin", "supervisor"]:
                raise HTTPException(status_code=400, detail="Only users with Admin or Supervisor role can be team supervisors")
        update_fields["supervisor_id"] = supervisor_id or None
    
    update_fields["updated_at"] = datetime.now(timezone.utc)
    
    await db.teams.update_one({"id": team_id}, {"$set": update_fields})
    
    logger.info(f"Team {team_id} updated by admin {current_user['username']}")
    return {"success": True}


@admin_router.delete("/teams/{team_id}", dependencies=[Depends(require_admin)])
async def archive_team_admin(team_id: str, request_data: dict = None, current_user: dict = Depends(get_current_user)):
    """Archive team via Admin GUI - requires reassignment of members"""
    from datetime import datetime, timezone
    
    team = await db.teams.find_one({"id": team_id})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if team.get("archived_at"):
        raise HTTPException(status_code=400, detail="Team already archived")
    
    # Get team members
    members = await db.crm_users.find({
        "$or": [
            {"team_id": team_id},
            {"team_ids": team_id}
        ],
        "deleted_at": None
    }).to_list(1000)
    
    # If team has members, require reassignment
    if members:
        reassign_to = request_data.get("reassign_to_team_id") if request_data else None
        if not reassign_to:
            raise HTTPException(
                status_code=400, 
                detail=f"Team has {len(members)} members. Please specify a team to reassign them to."
            )
        
        # Validate reassignment team exists and is not archived
        target_team = await db.teams.find_one({"id": reassign_to, "archived_at": None})
        if not target_team:
            raise HTTPException(status_code=400, detail="Target team not found or is archived")
        
        # Reassign all members
        for member in members:
            update_data = {}
            
            # Update team_id if it matches
            if member.get("team_id") == team_id:
                update_data["team_id"] = reassign_to
            
            # Update team_ids array
            if member.get("team_ids"):
                new_team_ids = [t for t in member["team_ids"] if t != team_id]
                if reassign_to not in new_team_ids:
                    new_team_ids.append(reassign_to)
                update_data["team_ids"] = new_team_ids
            
            # Update default_team_id if it matches
            if member.get("default_team_id") == team_id:
                update_data["default_team_id"] = reassign_to
            
            if update_data:
                await db.crm_users.update_one({"id": member["id"]}, {"$set": update_data})
        
        logger.info(f"Reassigned {len(members)} members from team {team_id} to {reassign_to}")
    
    # Archive the team
    await db.teams.update_one(
        {"id": team_id},
        {"$set": {
            "archived_at": datetime.now(timezone.utc),
            "archived_by": current_user["id"]
        }}
    )
    
    logger.info(f"Team {team_id} archived by admin {current_user['username']}")
    return {"success": True, "members_reassigned": len(members)}


@admin_router.post("/teams/{team_id}/members", dependencies=[Depends(require_admin)])
async def add_members_to_team(team_id: str, member_data: dict, current_user: dict = Depends(get_current_user)):
    """Add members to team via Admin GUI"""
    from datetime import datetime, timezone
    
    team = await db.teams.find_one({"id": team_id})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if team.get("archived_at"):
        raise HTTPException(status_code=400, detail="Cannot add members to an archived team")
    
    user_ids = member_data.get("user_ids", [])
    set_as_default = member_data.get("set_as_default", True)
    
    if not user_ids:
        raise HTTPException(status_code=400, detail="No users specified")
    
    added_count = 0
    for user_id in user_ids:
        user = await db.crm_users.find_one({"id": user_id, "deleted_at": None})
        if not user:
            continue
        
        update_data = {}
        
        # Add to team_ids if not already present
        current_team_ids = user.get("team_ids", []) or []
        if team_id not in current_team_ids:
            current_team_ids.append(team_id)
            update_data["team_ids"] = current_team_ids
        
        # Set as default team if requested or if user has no team
        if set_as_default or not user.get("team_id"):
            update_data["team_id"] = team_id
            update_data["default_team_id"] = team_id
        
        if update_data:
            update_data["updated_at"] = datetime.now(timezone.utc)
            await db.crm_users.update_one({"id": user_id}, {"$set": update_data})
            added_count += 1
    
    logger.info(f"Added {added_count} members to team {team_id} by admin {current_user['username']}")
    return {"success": True, "added_count": added_count}


@admin_router.delete("/teams/{team_id}/members/{user_id}", dependencies=[Depends(require_admin)])
async def remove_member_from_team(team_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    """Remove member from team via Admin GUI"""
    from datetime import datetime, timezone
    
    team = await db.teams.find_one({"id": team_id})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    user = await db.crm_users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = {}
    
    # Remove from team_ids
    current_team_ids = user.get("team_ids", []) or []
    if team_id in current_team_ids:
        current_team_ids.remove(team_id)
        update_data["team_ids"] = current_team_ids
    
    # If this was the default/primary team, set to first remaining team or None
    if user.get("team_id") == team_id:
        update_data["team_id"] = current_team_ids[0] if current_team_ids else None
    
    if user.get("default_team_id") == team_id:
        update_data["default_team_id"] = current_team_ids[0] if current_team_ids else None
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        await db.crm_users.update_one({"id": user_id}, {"$set": update_data})
    
    logger.info(f"Removed user {user_id} from team {team_id} by admin {current_user['username']}")
    return {"success": True}
