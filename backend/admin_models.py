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
    scope: str  # "none", "own", "team", "all" for read/edit/delete OR "yes"/"no" for create/assign/export
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


# ============================================
# DATA VISIBILITY RULES
# ============================================

class VisibilityLevel(str, Enum):
    """Visibility levels for field masking - configurable via GUI"""
    FULL = "full"      # Show complete data
    MASKED = "masked"  # Show partial data (e.g., last 4 digits)
    HIDDEN = "hidden"  # Hide completely


class VisibilityRule(BaseModel):
    """
    Data visibility rule - configured via Admin GUI
    Controls how sensitive fields are displayed based on role/team
    Backend enforces these rules - frontend never handles masking logic
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    scope_type: str  # "role" or "team"
    scope_id: str    # role_id or team_id
    field_name: str  # "phone", "email", "address"
    visibility: VisibilityLevel = VisibilityLevel.MASKED
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VisibilityRuleCreate(BaseModel):
    """Create visibility rule via Admin GUI"""
    scope_type: str  # "role" or "team"
    scope_id: str
    field_name: str
    visibility: str  # "full", "masked", "hidden"


class VisibilityRuleBulkUpdate(BaseModel):
    """Bulk update visibility rules from Admin GUI"""
    rules: List[Dict[str, Any]]  # [{scope_type, scope_id, field_name, visibility}, ...]


class VisibilityMatrixRow(BaseModel):
    """Single row in Visibility Matrix UI - one role or team"""
    scope_type: str
    scope_id: str
    scope_name: str  # Role name or Team name for display
    phone: str       # "full", "masked", "hidden"
    email: str
    address: str



# ============================================
# AUDIT LOG MODELS
# ============================================

class AuditLog(BaseModel):
    """
    Audit log entry - immutable, read-only record of system actions
    Cannot be modified or deleted after creation
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    action: str  # Action type (e.g., "user_created", "login_success")
    entity_type: str  # Entity category (e.g., "user", "team", "auth")
    user_id: Optional[str] = None  # Who performed the action
    user_name: str = "System"  # Username for display
    entity_id: Optional[str] = None  # Affected entity ID
    entity_name: Optional[str] = None  # Affected entity name/description
    details: Dict[str, Any] = Field(default_factory=dict)  # Additional context
    ip_address: Optional[str] = None  # Client IP


class AuditLogFilter(BaseModel):
    """Filter parameters for audit log queries"""
    user_id: Optional[str] = None
    action: Optional[str] = None
    entity_type: Optional[str] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    search: Optional[str] = None
    limit: int = 100
    offset: int = 0
