"""
Admin Panel Models - Database-driven configuration
All models represent GUI-configurable data, not system logic
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from enum import Enum
import uuid


# ============================================
# PERMISSION SCOPES (GUI selectable)
# ============================================

class PermissionScope(str, Enum):
    """Permission scopes - configurable via GUI"""
    NONE = "none"
    OWN = "own"
    TEAM = "team"
    ALL = "all"


class PermissionAction(str, Enum):
    """Permission actions - configurable via GUI"""
    READ = "read"
    CREATE = "create"
    EDIT = "edit"
    DELETE = "delete"
    ASSIGN = "assign"
    EXPORT = "export"


# ============================================
# ROLE MODELS
# ============================================

class Role(BaseModel):
    """
    Role configuration - fully editable via Admin GUI
    is_system flag is for UI warnings only, not enforcement
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    is_system: bool = False  # UI warning only, still editable
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


# ============================================
# PERMISSION MODELS
# ============================================

class Permission(BaseModel):
    """
    Permission rule - configured via Permission Matrix UI
    Backend only enforces what's configured in GUI
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role_id: str
    entity: str  # e.g., "leads", "contacts", "deposits"
    action: PermissionAction
    scope: PermissionScope  # or "yes"/"no" for create/assign/export
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PermissionBulkUpdate(BaseModel):
    """Bulk permission update from Permission Matrix UI"""
    role_id: str
    permissions: List[Dict[str, Any]]  # [{entity, action, scope}, ...]


# ============================================
# ENTITY CONFIGURATION MODELS
# ============================================

class EntityConfig(BaseModel):
    """
    Entity configuration - defines available entities in system
    Admin can enable/disable entities via GUI
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    entity_name: str  # e.g., "leads", "contacts"
    display_name: str  # e.g., "Leads", "Contacts"
    icon: Optional[str] = None  # lucide-react icon name
    enabled: bool = True
    order: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EntityConfigUpdate(BaseModel):
    display_name: Optional[str] = None
    icon: Optional[str] = None
    enabled: Optional[bool] = None
    order: Optional[int] = None


# ============================================
# USER-ROLE ASSOCIATIONS
# ============================================

class UserRole(BaseModel):
    """Many-to-many: User can have multiple roles"""
    user_id: str
    role_id: str
    assigned_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserTeam(BaseModel):
    """Many-to-many: User can be in multiple teams"""
    user_id: str
    team_id: str
    is_default: bool = False
    assigned_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ============================================
# PERMISSION QUERY RESULT
# ============================================

class PermissionResult(BaseModel):
    """Result from permission engine evaluation"""
    allowed: bool
    scope: PermissionScope
    reason: Optional[str] = None  # For debugging/audit


# ============================================
# ADMIN UI MODELS
# ============================================

class PermissionMatrixRow(BaseModel):
    """Single row in Permission Matrix UI"""
    entity: str
    read: PermissionScope
    create: str  # "yes" or "no"
    edit: PermissionScope
    delete: PermissionScope
    assign: str  # "yes" or "no"
    export: str  # "yes" or "no"


class RoleWithPermissions(BaseModel):
    """Role with its full permission matrix - for UI display"""
    role: Role
    permissions: List[PermissionMatrixRow]
