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
    
    # Build user document
    new_user = {
        "id": str(uuid4()),
        "username": user_data["username"],
        "full_name": user_data["full_name"],
        "password": hash_password(user_data["password"]),
        "role": user_data.get("role", "agent"),
        "team_id": user_data.get("team_ids", [None])[0] if user_data.get("team_ids") else user_data.get("default_team_id"),
        "team_ids": user_data.get("team_ids", []),
        "default_team_id": user_data.get("default_team_id"),
        "is_active": True,
        "is_system_user": user_data.get("is_system_user", False),
        "deleted_at": None,
        "created_at": datetime.now(timezone.utc),
        "created_by": current_user["id"],
        "last_login": None
    }
    
    await db.crm_users.insert_one(new_user)
    
    # Remove password and _id from response to avoid serialization issues
    response_user = {k: v for k, v in new_user.items() if k not in ["password", "_id"]}
    logger.info(f"User {new_user['username']} created by admin {current_user['username']}")
    return response_user


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
