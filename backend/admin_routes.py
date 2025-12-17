"""
Admin Panel API Routes
Serves Admin GUI configuration only - no business logic
All changes persist to database and take effect immediately
"""
from fastapi import APIRouter, HTTPException, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Dict, Any
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

admin_router = APIRouter(prefix="/admin", tags=["admin"])


# ============================================
# AUTHENTICATION DEPENDENCY
# ============================================

async def get_current_user(authorization: str = Depends(lambda: None)):
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
    role = await db.roles.find_one({"id": role_id})
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
