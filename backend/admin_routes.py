"""
Admin Panel API Routes
Serves Admin GUI configuration only - no business logic
All changes persist to database and take effect immediately
"""
from fastapi import APIRouter, HTTPException, Depends, Header
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import logging

from admin_models import (
    Role, RoleCreate, RoleUpdate,
    Permission, PermissionBulkUpdate,
    EntityConfig, EntityConfigUpdate,
    PermissionMatrixRow, RoleWithPermissions,
    PermissionAction, PermissionScope,
    UserRole, UserTeam,
    VisibilityRule, VisibilityRuleCreate, VisibilityRuleBulkUpdate, VisibilityLevel,
    AuditLogFilter
)
from db_utils import insert_and_return_clean, clean_document_for_response
from audit_utils import (
    AuditAction, EntityType, ACTION_LABELS, ENTITY_TYPE_LABELS,
    log_user_action, log_team_action, log_role_action, 
    log_permission_change, log_visibility_change, create_audit_log
)
from session_settings import get_session_settings, update_session_settings, init_session_settings_db

# Will be set from server.py to avoid circular import
db = None

def init_admin_db(database):
    """Initialize database connection"""
    global db
    db = database
    init_session_settings_db(database)

logger = logging.getLogger(__name__)

admin_router = APIRouter(prefix="/api/admin", tags=["admin"])


# ============================================
# AUTHENTICATION DEPENDENCY
# ============================================

async def get_current_user(authorization: Optional[str] = Header(None)):
    """Cached user auth - delegates to shared cached_auth module"""
    from cached_auth import get_current_user_cached
    return await get_current_user_cached(authorization)


# ============================================
# ADMIN ACCESS CONTROL
# ============================================

async def require_admin(current_user: dict = Depends(get_current_user)):
    """
    Verify user has admin access.
    Fast path: check role field directly (avoids extra DB query).
    """
    # Fast path: check the role field directly
    if current_user.get("role", "").lower() == "admin":
        return current_user
    
    # Slow path: check user_roles collection (only if role field doesn't say admin)
    user_role = await db.user_roles.find_one({
        "user_id": current_user["id"]
    })
    
    if not user_role:
        raise HTTPException(status_code=403, detail="Admin access required")
    
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
    
    # Use utility to avoid ObjectId serialization issue
    role_dict = role.dict()
    clean_role = await insert_and_return_clean(db.roles, role_dict)
    
    logger.info(f"Role created: {role.name}")
    return clean_document_for_response(clean_role)


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
        # Handle both 'entity' and 'entity_name' fields for backward compatibility
        entity = perm.get("entity") or perm.get("entity_name")
        if not entity:
            continue
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
    
    # Invalidate permission cache so changes take effect immediately
    from permission_engine import get_permission_engine
    pe = get_permission_engine(db)
    pe.invalidate_cache()
    
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
    
    # Use utility to insert and get clean document (no _id)
    clean_user = await insert_and_return_clean(db.crm_users, new_user)
    
    logger.info(f"User {clean_user['username']} created by admin {current_user['username']}")
    
    # Log audit event
    await log_user_action(
        action=AuditAction.USER_CREATED,
        actor_id=current_user["id"],
        actor_name=current_user["username"],
        target_user_id=user_id,
        target_user_name=clean_user["username"],
        details={"role": clean_user["role"], "team_ids": clean_user.get("team_ids", [])}
    )
    
    # Return clean response without password
    response = clean_document_for_response(clean_user)
    del response["password"]  # Never return password
    return response


@admin_router.put("/users/{user_id}", dependencies=[Depends(require_admin)])
async def update_user_admin(user_id: str, user_data: dict, current_user: dict = Depends(get_current_user)):
    """Update user via Admin GUI"""
    from datetime import datetime, timezone, timedelta
    
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
    if "sip_extension" in user_data:
        update_fields["sip_extension"] = user_data["sip_extension"]
    
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
    from datetime import datetime, timezone, timedelta
    
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
    from datetime import datetime, timezone, timedelta
    
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
    
    # Log audit event
    await log_user_action(
        action=AuditAction.USER_DELETED,
        actor_id=current_user["id"],
        actor_name=current_user["username"],
        target_user_id=user_id,
        target_user_name=user.get("username", user_id)
    )
    
    return {"success": True}


@admin_router.post("/users/{user_id}/restore", dependencies=[Depends(require_admin)])
async def restore_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Restore a soft-deleted user from archive"""
    from datetime import datetime, timezone, timedelta
    
    user = await db.crm_users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user is actually deleted
    if not user.get("deleted_at"):
        raise HTTPException(status_code=400, detail="User is not archived")
    
    # Restore user
    await db.crm_users.update_one(
        {"id": user_id},
        {
            "$set": {"is_active": True},
            "$unset": {"deleted_at": ""}
        }
    )
    
    logger.info(f"User {user_id} restored by admin {current_user['username']}")
    
    # Log audit event
    await create_audit_log(
        action="user_restored",
        entity_type="user",
        user_id=current_user["id"],
        user_name=current_user["username"],
        entity_id=user_id,
        entity_name=user.get("username", user_id),
        details={"restored_by": current_user["username"]}
    )
    
    return {"success": True, "message": f"User {user.get('username')} restored successfully"}


@admin_router.delete("/users/{user_id}/permanent", dependencies=[Depends(require_admin)])
async def permanently_delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Permanently delete a user from the archive (cannot be recovered)"""
    from datetime import datetime, timezone, timedelta
    
    user = await db.crm_users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Only allow permanent deletion of archived users
    if not user.get("deleted_at"):
        raise HTTPException(status_code=400, detail="User must be archived first before permanent deletion")
    
    # Cannot permanently delete yourself
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    # Store user info for audit before deletion
    username = user.get("username", user_id)
    
    # Permanently delete the user
    await db.crm_users.delete_one({"id": user_id})
    
    # Also clean up related data
    await db.user_roles.delete_many({"user_id": user_id})
    await db.login_requests.delete_many({"user_id": user_id})
    
    logger.info(f"User {user_id} permanently deleted by admin {current_user['username']}")
    
    # Log audit event
    await create_audit_log(
        action="user_permanently_deleted",
        entity_type="user",
        user_id=current_user["id"],
        user_name=current_user["username"],
        entity_id=user_id,
        entity_name=username,
        details={"permanently_deleted_by": current_user["username"]}
    )
    
    return {"success": True, "message": f"User {username} permanently deleted"}


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
    # Use utility to avoid ObjectId serialization issue
    await insert_and_return_clean(db.user_roles, user_role.dict())
    
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
    
    # Use utility to insert and get clean document (no _id)
    clean_team = await insert_and_return_clean(db.teams, new_team)
    
    logger.info(f"Team {team_data['name']} created by admin {current_user['username']}")
    
    # Log audit event
    await log_team_action(
        action=AuditAction.TEAM_CREATED,
        actor_id=current_user["id"],
        actor_name=current_user["username"],
        team_id=team_id,
        team_name=team_data["name"],
        details={"supervisor_id": supervisor_id}
    )
    
    return clean_document_for_response(clean_team)


@admin_router.put("/teams/{team_id}", dependencies=[Depends(require_admin)])
async def update_team_admin(team_id: str, team_data: dict, current_user: dict = Depends(get_current_user)):
    """Update team via Admin GUI"""
    from datetime import datetime, timezone, timedelta
    
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
    from datetime import datetime, timezone, timedelta
    
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


@admin_router.get("/teams/{team_id}/members")
async def get_team_members(team_id: str, current_user: dict = Depends(get_current_user)):
    """Get members of a team - accessible by admins and team supervisors"""
    team = await db.teams.find_one({"id": team_id}, {"_id": 0})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    # Check permission: admin can see all, supervisor can see their team
    role = current_user.get("role", "").lower()
    if role == "supervisor" and team.get("supervisor_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only view your own team members")
    elif role not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Only admins and supervisors can view team members")
    
    # Get all users in this team
    members = await db.crm_users.find(
        {
            "team_id": team_id,
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        },
        {"_id": 0, "password": 0}
    ).to_list(100)
    
    return {"members": members, "team": team}


@admin_router.post("/teams/{team_id}/members", dependencies=[Depends(require_admin)])
async def add_members_to_team(team_id: str, member_data: dict, current_user: dict = Depends(get_current_user)):
    """Add members to team via Admin GUI"""
    from datetime import datetime, timezone, timedelta
    
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
    from datetime import datetime, timezone, timedelta
    
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


# ============================================
# DATA VISIBILITY RULES (GUI Configuration)
# ============================================

@admin_router.get("/visibility-rules", dependencies=[Depends(require_admin)])
async def get_visibility_rules():
    """
    Get all visibility rules - for Data Visibility UI
    Returns a matrix of roles/teams with their field visibility settings
    """
    # Get all active roles
    roles = await db.roles.find({}, {"_id": 0}).to_list(100)
    
    # Get all active teams
    teams = await db.teams.find({"archived_at": None}, {"_id": 0}).to_list(100)
    
    # Get all visibility rules
    rules = await db.visibility_rules.find({}, {"_id": 0}).to_list(1000)
    
    # Build rules map for quick lookup
    rules_map = {}
    for rule in rules:
        key = f"{rule['scope_type']}:{rule['scope_id']}:{rule['field_name']}"
        rules_map[key] = rule["visibility"]
    
    # Build matrix rows for roles
    matrix = []
    for role in roles:
        matrix.append({
            "scope_type": "role",
            "scope_id": role["id"],
            "scope_name": role["name"],
            "phone": rules_map.get(f"role:{role['id']}:phone", "masked"),
            "email": rules_map.get(f"role:{role['id']}:email", "masked"),
            "address": rules_map.get(f"role:{role['id']}:address", "masked")
        })
    
    # Build matrix rows for teams
    for team in teams:
        matrix.append({
            "scope_type": "team",
            "scope_id": team["id"],
            "scope_name": team["name"],
            "phone": rules_map.get(f"team:{team['id']}:phone", "masked"),
            "email": rules_map.get(f"team:{team['id']}:email", "masked"),
            "address": rules_map.get(f"team:{team['id']}:address", "masked")
        })
    
    return {
        "matrix": matrix,
        "fields": ["phone", "email", "address"],
        "visibility_options": ["full", "masked", "hidden"]
    }


@admin_router.put("/visibility-rules", dependencies=[Depends(require_admin)])
async def update_visibility_rules(bulk_update: VisibilityRuleBulkUpdate, current_user: dict = Depends(get_current_user)):
    """
    Bulk update visibility rules from Admin GUI
    Replaces all visibility rules with new configuration
    """
    # Delete all existing rules
    await db.visibility_rules.delete_many({})
    
    # Insert new rules
    new_rules = []
    for rule_data in bulk_update.rules:
        # Only store non-default rules (not "masked")
        if rule_data.get("visibility", "masked") != "masked":
            rule = VisibilityRule(
                scope_type=rule_data["scope_type"],
                scope_id=rule_data["scope_id"],
                field_name=rule_data["field_name"],
                visibility=VisibilityLevel(rule_data["visibility"])
            )
            new_rules.append(rule.dict())
    
    if new_rules:
        # Use insert_many but we don't need to return anything
        for rule in new_rules:
            await insert_and_return_clean(db.visibility_rules, rule)
    
    logger.info(f"Visibility rules updated by admin {current_user['username']}, {len(new_rules)} rules saved")
    
    # Log audit event
    await log_visibility_change(
        actor_id=current_user["id"],
        actor_name=current_user["username"],
        rules_count=len(new_rules)
    )
    
    return {"success": True, "count": len(new_rules)}


@admin_router.post("/visibility-rules/single", dependencies=[Depends(require_admin)])
async def create_visibility_rule(rule_data: VisibilityRuleCreate, current_user: dict = Depends(get_current_user)):
    """Create or update a single visibility rule via Admin GUI"""
    # Check if rule already exists for this scope/field combination
    existing = await db.visibility_rules.find_one({
        "scope_type": rule_data.scope_type,
        "scope_id": rule_data.scope_id,
        "field_name": rule_data.field_name
    })
    
    if existing:
        # Update existing rule
        await db.visibility_rules.update_one(
            {"id": existing["id"]},
            {"$set": {
                "visibility": rule_data.visibility,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        logger.info(f"Visibility rule updated: {rule_data.scope_type}/{rule_data.scope_id}/{rule_data.field_name} -> {rule_data.visibility}")
        return {"success": True, "action": "updated"}
    else:
        # Create new rule
        rule = VisibilityRule(
            scope_type=rule_data.scope_type,
            scope_id=rule_data.scope_id,
            field_name=rule_data.field_name,
            visibility=VisibilityLevel(rule_data.visibility)
        )
        clean_rule = await insert_and_return_clean(db.visibility_rules, rule.dict())
        
        logger.info(f"Visibility rule created: {rule_data.scope_type}/{rule_data.scope_id}/{rule_data.field_name} -> {rule_data.visibility}")
        return {"success": True, "action": "created", "rule": clean_document_for_response(clean_rule)}


@admin_router.delete("/visibility-rules/{scope_type}/{scope_id}/{field_name}", dependencies=[Depends(require_admin)])
async def delete_visibility_rule(scope_type: str, scope_id: str, field_name: str, current_user: dict = Depends(get_current_user)):
    """Delete a visibility rule (reverts to default 'masked')"""
    result = await db.visibility_rules.delete_one({
        "scope_type": scope_type,
        "scope_id": scope_id,
        "field_name": field_name
    })
    
    if result.deleted_count == 0:
        # Not an error - rule might already be at default
        return {"success": True, "message": "Rule was already at default"}
    
    logger.info(f"Visibility rule deleted: {scope_type}/{scope_id}/{field_name} by {current_user['username']}")
    return {"success": True}



# ============================================
# AUDIT LOGS (Read-Only, Admin-Only)
# ============================================

@admin_router.get("/audit-logs", dependencies=[Depends(require_admin)])
async def get_audit_logs(
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
):
    """
    Get audit logs with filters - for Audit Logs UI
    Logs are immutable and read-only
    """
    query = {}
    
    # Apply filters
    if user_id:
        query["user_id"] = user_id
    if action:
        query["action"] = action
    if entity_type:
        query["entity_type"] = entity_type
    
    # Date range filter
    if date_from or date_to:
        query["timestamp"] = {}
        if date_from:
            try:
                query["timestamp"]["$gte"] = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            except ValueError:
                pass
        if date_to:
            try:
                query["timestamp"]["$lte"] = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            except ValueError:
                pass
        if not query["timestamp"]:
            del query["timestamp"]
    
    # Search filter (searches in entity_name and user_name)
    if search:
        query["$or"] = [
            {"entity_name": {"$regex": search, "$options": "i"}},
            {"user_name": {"$regex": search, "$options": "i"}}
        ]
    
    # Get total count for pagination
    total_count = await db.audit_logs.count_documents(query)
    
    # Fetch logs with pagination
    logs = await db.audit_logs.find(query, {"_id": 0}) \
        .sort("timestamp", -1) \
        .skip(offset) \
        .limit(limit) \
        .to_list(limit)
    
    # Add display labels
    for log in logs:
        log["action_label"] = ACTION_LABELS.get(log["action"], log["action"])
        log["entity_type_label"] = ENTITY_TYPE_LABELS.get(log["entity_type"], log["entity_type"])
        # Convert timestamp to ISO string
        if isinstance(log.get("timestamp"), datetime):
            log["timestamp"] = log["timestamp"].isoformat()
    
    return {
        "logs": logs,
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "has_more": (offset + len(logs)) < total_count
    }


@admin_router.get("/audit-logs/filters", dependencies=[Depends(require_admin)])
async def get_audit_log_filters():
    """
    Get available filter options for audit logs UI
    """
    # Get distinct users who have audit entries
    users_pipeline = [
        {"$group": {"_id": {"user_id": "$user_id", "user_name": "$user_name"}}},
        {"$project": {"_id": 0, "user_id": "$_id.user_id", "user_name": "$_id.user_name"}}
    ]
    users = await db.audit_logs.aggregate(users_pipeline).to_list(100)
    
    return {
        "actions": [
            {"value": action, "label": label}
            for action, label in ACTION_LABELS.items()
        ],
        "entity_types": [
            {"value": etype, "label": label}
            for etype, label in ENTITY_TYPE_LABELS.items()
        ],
        "users": [u for u in users if u.get("user_id")]
    }


@admin_router.get("/audit-logs/export", dependencies=[Depends(require_admin)])
async def export_audit_logs(
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Export audit logs as CSV
    """
    from fastapi.responses import StreamingResponse
    import io
    import csv
    
    query = {}
    
    # Apply same filters as get_audit_logs
    if user_id:
        query["user_id"] = user_id
    if action:
        query["action"] = action
    if entity_type:
        query["entity_type"] = entity_type
    
    if date_from or date_to:
        query["timestamp"] = {}
        if date_from:
            try:
                query["timestamp"]["$gte"] = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            except ValueError:
                pass
        if date_to:
            try:
                query["timestamp"]["$lte"] = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            except ValueError:
                pass
        if not query["timestamp"]:
            del query["timestamp"]
    
    # Fetch all matching logs (limit to 10000 for safety)
    logs = await db.audit_logs.find(query, {"_id": 0}) \
        .sort("timestamp", -1) \
        .limit(10000) \
        .to_list(10000)
    
    # Log the export action
    from audit_utils import create_audit_log
    await create_audit_log(
        action="audit_logs_exported",
        entity_type="audit",
        user_id=current_user["id"],
        user_name=current_user["username"],
        entity_name="Audit Logs",
        details={"filters": {"user_id": user_id, "action": action, "entity_type": entity_type}, "count": len(logs)}
    )
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        "Data/Ora", "Utente", "Azione", "Tipo Entità", 
        "Entità", "Dettagli", "IP"
    ])
    
    # Data rows
    for log in logs:
        timestamp = log.get("timestamp")
        if isinstance(timestamp, datetime):
            timestamp = timestamp.strftime("%d/%m/%Y %H:%M:%S")
        
        writer.writerow([
            timestamp,
            log.get("user_name", ""),
            ACTION_LABELS.get(log.get("action"), log.get("action", "")),
            ENTITY_TYPE_LABELS.get(log.get("entity_type"), log.get("entity_type", "")),
            log.get("entity_name", ""),
            str(log.get("details", {})),
            log.get("ip_address", "")
        ])
    
    output.seek(0)
    
    # Return as downloadable CSV
    filename = f"audit_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@admin_router.get("/audit-logs/stats", dependencies=[Depends(require_admin)])
async def get_audit_log_stats():
    """
    Get audit log statistics for dashboard
    """
    from datetime import timedelta
    
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    
    # Count by action type (last 7 days)
    pipeline = [
        {"$match": {"timestamp": {"$gte": week_start}}},
        {"$group": {"_id": "$action", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    action_counts = await db.audit_logs.aggregate(pipeline).to_list(100)
    
    # Count by entity type (last 7 days)
    pipeline = [
        {"$match": {"timestamp": {"$gte": week_start}}},
        {"$group": {"_id": "$entity_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    entity_counts = await db.audit_logs.aggregate(pipeline).to_list(100)
    
    # Today's activity
    today_count = await db.audit_logs.count_documents({"timestamp": {"$gte": today_start}})
    
    # Total logs
    total_count = await db.audit_logs.count_documents({})
    
    return {
        "total_logs": total_count,
        "today_count": today_count,
        "by_action": [
            {"action": a["_id"], "label": ACTION_LABELS.get(a["_id"], a["_id"]), "count": a["count"]}
            for a in action_counts
        ],
        "by_entity_type": [
            {"entity_type": e["_id"], "label": ENTITY_TYPE_LABELS.get(e["_id"], e["_id"]), "count": e["count"]}
            for e in entity_counts
        ]
    }



# ============================================
# SESSION SETTINGS (Admin-Only Configuration)
# ============================================

@admin_router.get("/session-settings", dependencies=[Depends(require_admin)])
async def get_session_settings_endpoint():
    """Get current session settings for GUI configuration"""
    from session_settings import get_all_timezones_with_offset, get_current_time_in_timezone, get_gmt_offset
    
    settings = await get_session_settings()
    tz_name = settings.get("timezone", "Europe/Berlin")
    current_time = get_current_time_in_timezone(tz_name)
    current_offset = get_gmt_offset(tz_name)
    
    # Get fresh timezone data with current offsets
    all_timezones = get_all_timezones_with_offset()
    
    return {
        "session_start_hour": settings.get("session_start_hour", 8),
        "session_start_minute": settings.get("session_start_minute", 0),
        "session_end_hour": settings.get("session_end_hour", 18),
        "session_end_minute": settings.get("session_end_minute", 30),
        "work_days": settings.get("work_days", [0, 1, 2, 3, 4]),
        "timezone": tz_name,
        "timezone_offset": current_offset,
        "require_approval_after_hours": settings.get("require_approval_after_hours", True),
        "approval_duration_minutes": settings.get("approval_duration_minutes", 30),
        "current_time": current_time.strftime("%Y-%m-%d %H:%M:%S"),
        "current_day": current_time.strftime("%A"),
        "all_timezones": all_timezones,
        "day_names": {
            0: "Lunedì",
            1: "Martedì", 
            2: "Mercoledì",
            3: "Giovedì",
            4: "Venerdì",
            5: "Sabato",
            6: "Domenica"
        }
    }


@admin_router.put("/session-settings", dependencies=[Depends(require_admin)])
async def update_session_settings_endpoint(settings_data: dict, current_user: dict = Depends(get_current_user)):
    """Update session settings via Admin GUI"""
    updated = await update_session_settings(
        session_start_hour=settings_data.get("session_start_hour", 8),
        session_start_minute=settings_data.get("session_start_minute", 0),
        session_end_hour=settings_data.get("session_end_hour", 18),
        session_end_minute=settings_data.get("session_end_minute", 30),
        work_days=settings_data.get("work_days", [0, 1, 2, 3, 4]),
        require_approval_after_hours=settings_data.get("require_approval_after_hours", True),
        approval_duration_minutes=settings_data.get("approval_duration_minutes", 30),
        timezone=settings_data.get("timezone", "Europe/Berlin")
    )
    
    # Log the change
    await create_audit_log(
        action="session_settings_updated",
        entity_type="settings",
        user_id=current_user["id"],
        user_name=current_user["username"],
        entity_name="Session Settings",
        details={
            "start": f"{updated['session_start_hour']:02d}:{updated['session_start_minute']:02d}",
            "end": f"{updated['session_end_hour']:02d}:{updated['session_end_minute']:02d}",
            "work_days": updated["work_days"],
            "require_approval": updated["require_approval_after_hours"]
        }
    )
    
    logger.info(f"Session settings updated by {current_user['username']}")
    return {"success": True, "settings": updated}


# ============================================
# LOGIN APPROVAL REQUESTS (After Hours)
# ============================================

@admin_router.get("/login-requests", dependencies=[Depends(require_admin)])
async def get_login_requests():
    """Get pending login requests for admin approval"""
    requests = await db.login_requests.find(
        {"status": "pending"},
        {"_id": 0}
    ).sort("requested_at", -1).to_list(100)
    
    # Convert datetime to ISO string
    for req in requests:
        if isinstance(req.get("requested_at"), datetime):
            req["requested_at"] = req["requested_at"].isoformat()
    
    return {"requests": requests, "count": len(requests)}


@admin_router.post("/login-requests/{request_id}/approve", dependencies=[Depends(require_admin)])
async def approve_login_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Approve a login request - allows user to login for the configured duration"""
    from datetime import timedelta
    
    request = await db.login_requests.find_one({"id": request_id, "status": "pending"})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found or already processed")
    
    # Get approval duration from settings
    settings = await get_session_settings()
    approval_minutes = settings.get("approval_duration_minutes", 30)
    
    # Update request to approved with configured expiry
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=approval_minutes)
    await db.login_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "approved",
            "approved_by": current_user["id"],
            "approved_at": datetime.now(timezone.utc),
            "expires_at": expires_at
        }}
    )
    
    # Log the approval
    await create_audit_log(
        action="login_request_approved",
        entity_type="auth",
        user_id=current_user["id"],
        user_name=current_user["username"],
        entity_id=request["user_id"],
        entity_name=request["username"],
        details={"expires_at": expires_at.isoformat()}
    )
    
    logger.info(f"Login request for {request['username']} approved by {current_user['username']}")
    return {
        "success": True, 
        "message": f"Accesso approvato per {request['username']}. Valido per {approval_minutes} minuti.",
        "expires_at": expires_at.isoformat(),
        "duration_minutes": approval_minutes
    }


@admin_router.post("/login-requests/{request_id}/deny", dependencies=[Depends(require_admin)])
async def deny_login_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Deny a login request"""
    request = await db.login_requests.find_one({"id": request_id, "status": "pending"})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found or already processed")
    
    await db.login_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "denied",
            "denied_by": current_user["id"],
            "denied_at": datetime.now(timezone.utc)
        }}
    )
    
    # Log the denial
    await create_audit_log(
        action="login_request_denied",
        entity_type="auth",
        user_id=current_user["id"],
        user_name=current_user["username"],
        entity_id=request["user_id"],
        entity_name=request["username"]
    )
    
    logger.info(f"Login request for {request['username']} denied by {current_user['username']}")
    return {"success": True, "message": f"Accesso negato per {request['username']}."}


@admin_router.delete("/login-requests/clear-expired", dependencies=[Depends(require_admin)])
async def clear_expired_requests():
    """Clear expired and old requests"""
    result = await db.login_requests.delete_many({
        "$or": [
            {"status": {"$in": ["approved", "denied"]}},
            {"requested_at": {"$lt": datetime.now(timezone.utc) - timedelta(hours=24)}}
        ]
    })
    return {"success": True, "deleted": result.deleted_count}



# ============================================
# LANGUAGE SETTINGS (System-Wide)
# ============================================

SUPPORTED_LANGUAGES = ['it', 'en', 'de', 'fr', 'es']

@admin_router.get("/language-settings", dependencies=[Depends(require_admin)])
async def get_language_settings():
    """Get system-wide language setting"""
    settings = await db.system_settings.find_one({"type": "language_config"}, {"_id": 0})
    
    if not settings:
        # Default to Italian
        return {"language": "it"}
    
    return {"language": settings.get("language", "it")}


@admin_router.put("/language-settings", dependencies=[Depends(require_admin)])
async def update_language_settings(settings_data: dict, current_user: dict = Depends(get_current_user)):
    """Update system-wide language setting"""
    language = settings_data.get("language", "it")
    
    # Validate language
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {language}")
    
    await db.system_settings.update_one(
        {"type": "language_config"},
        {"$set": {
            "type": "language_config",
            "language": language,
            "updated_at": datetime.now(timezone.utc),
            "updated_by": current_user["id"]
        }},
        upsert=True
    )
    
    # Log the change
    await create_audit_log(
        action="language_settings_updated",
        entity_type="settings",
        user_id=current_user["id"],
        user_name=current_user["username"],
        entity_name="Language Settings",
        details={"language": language}
    )
    
    logger.info(f"Language settings updated to {language} by {current_user['username']}")
    return {"success": True, "language": language}

