"""
Audit Logging Utilities
Provides functions for creating immutable audit log entries.
All audit logs are read-only and cannot be modified or deleted.
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any
from uuid import uuid4


# Action types for audit logging
class AuditAction:
    """Predefined audit action types"""
    # Authentication
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILED = "login_failed"
    LOGOUT = "logout"
    
    # Users
    USER_CREATED = "user_created"
    USER_UPDATED = "user_updated"
    USER_DELETED = "user_deleted"
    USER_STATUS_CHANGED = "user_status_changed"
    PASSWORD_RESET = "password_reset"
    
    # Teams
    TEAM_CREATED = "team_created"
    TEAM_UPDATED = "team_updated"
    TEAM_ARCHIVED = "team_archived"
    MEMBER_ADDED = "member_added"
    MEMBER_REMOVED = "member_removed"
    
    # Roles
    ROLE_CREATED = "role_created"
    ROLE_UPDATED = "role_updated"
    ROLE_DELETED = "role_deleted"
    
    # Permissions
    PERMISSIONS_UPDATED = "permissions_updated"
    ROLE_ASSIGNED = "role_assigned"
    ROLE_UNASSIGNED = "role_unassigned"
    
    # Visibility Rules
    VISIBILITY_RULES_UPDATED = "visibility_rules_updated"
    
    # Leads
    LEAD_CREATED = "lead_created"
    LEAD_UPDATED = "lead_updated"
    LEAD_DELETED = "lead_deleted"
    LEAD_ASSIGNED = "lead_assigned"
    LEAD_EXPORTED = "lead_exported"


# Entity types for categorization
class EntityType:
    """Entity types for filtering"""
    USER = "user"
    TEAM = "team"
    ROLE = "role"
    PERMISSION = "permission"
    VISIBILITY_RULE = "visibility_rule"
    LEAD = "lead"
    AUTH = "auth"


# Database reference - will be set from server.py
db = None


def init_audit_db(database):
    """Initialize database connection for audit logging"""
    global db
    db = database


async def create_audit_log(
    action: str,
    entity_type: str,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
    entity_id: Optional[str] = None,
    entity_name: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None
) -> str:
    """
    Create an immutable audit log entry.
    
    Args:
        action: The action performed (use AuditAction constants)
        entity_type: Type of entity affected (use EntityType constants)
        user_id: ID of user who performed the action
        user_name: Username for display
        entity_id: ID of the affected entity
        entity_name: Name/description of the affected entity
        details: Additional context as JSON
        ip_address: Client IP address
        
    Returns:
        The ID of the created audit log entry
    """
    if db is None:
        raise RuntimeError("Audit database not initialized")
    
    log_id = str(uuid4())
    
    audit_entry = {
        "id": log_id,
        "timestamp": datetime.now(timezone.utc),
        "action": action,
        "entity_type": entity_type,
        "user_id": user_id,
        "user_name": user_name or "System",
        "entity_id": entity_id,
        "entity_name": entity_name,
        "details": details or {},
        "ip_address": ip_address
    }
    
    await db.audit_logs.insert_one(audit_entry)
    
    return log_id


async def log_auth_event(
    action: str,
    username: str,
    user_id: Optional[str] = None,
    success: bool = True,
    ip_address: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
):
    """Log authentication events"""
    await create_audit_log(
        action=action,
        entity_type=EntityType.AUTH,
        user_id=user_id,
        user_name=username,
        entity_name=username,
        details={
            "success": success,
            **(details or {})
        },
        ip_address=ip_address
    )


async def log_user_action(
    action: str,
    actor_id: str,
    actor_name: str,
    target_user_id: str,
    target_user_name: str,
    details: Optional[Dict[str, Any]] = None
):
    """Log user management actions"""
    await create_audit_log(
        action=action,
        entity_type=EntityType.USER,
        user_id=actor_id,
        user_name=actor_name,
        entity_id=target_user_id,
        entity_name=target_user_name,
        details=details
    )


async def log_team_action(
    action: str,
    actor_id: str,
    actor_name: str,
    team_id: str,
    team_name: str,
    details: Optional[Dict[str, Any]] = None
):
    """Log team management actions"""
    await create_audit_log(
        action=action,
        entity_type=EntityType.TEAM,
        user_id=actor_id,
        user_name=actor_name,
        entity_id=team_id,
        entity_name=team_name,
        details=details
    )


async def log_role_action(
    action: str,
    actor_id: str,
    actor_name: str,
    role_id: str,
    role_name: str,
    details: Optional[Dict[str, Any]] = None
):
    """Log role management actions"""
    await create_audit_log(
        action=action,
        entity_type=EntityType.ROLE,
        user_id=actor_id,
        user_name=actor_name,
        entity_id=role_id,
        entity_name=role_name,
        details=details
    )


async def log_permission_change(
    actor_id: str,
    actor_name: str,
    role_id: str,
    role_name: str,
    changes_count: int,
    details: Optional[Dict[str, Any]] = None
):
    """Log permission matrix changes"""
    await create_audit_log(
        action=AuditAction.PERMISSIONS_UPDATED,
        entity_type=EntityType.PERMISSION,
        user_id=actor_id,
        user_name=actor_name,
        entity_id=role_id,
        entity_name=role_name,
        details={
            "changes_count": changes_count,
            **(details or {})
        }
    )


async def log_visibility_change(
    actor_id: str,
    actor_name: str,
    rules_count: int,
    details: Optional[Dict[str, Any]] = None
):
    """Log visibility rules changes"""
    await create_audit_log(
        action=AuditAction.VISIBILITY_RULES_UPDATED,
        entity_type=EntityType.VISIBILITY_RULE,
        user_id=actor_id,
        user_name=actor_name,
        entity_name="Visibility Rules",
        details={
            "rules_count": rules_count,
            **(details or {})
        }
    )


async def log_lead_action(
    action: str,
    actor_id: str,
    actor_name: str,
    lead_id: str,
    lead_name: str,
    details: Optional[Dict[str, Any]] = None
):
    """Log lead-related actions"""
    await create_audit_log(
        action=action,
        entity_type=EntityType.LEAD,
        user_id=actor_id,
        user_name=actor_name,
        entity_id=lead_id,
        entity_name=lead_name,
        details=details
    )


# Action labels for UI display (Italian)
ACTION_LABELS = {
    AuditAction.LOGIN_SUCCESS: "Login riuscito",
    AuditAction.LOGIN_FAILED: "Login fallito",
    AuditAction.LOGOUT: "Logout",
    AuditAction.USER_CREATED: "Utente creato",
    AuditAction.USER_UPDATED: "Utente modificato",
    AuditAction.USER_DELETED: "Utente eliminato",
    AuditAction.USER_STATUS_CHANGED: "Stato utente modificato",
    AuditAction.PASSWORD_RESET: "Password reimpostata",
    AuditAction.TEAM_CREATED: "Team creato",
    AuditAction.TEAM_UPDATED: "Team modificato",
    AuditAction.TEAM_ARCHIVED: "Team archiviato",
    AuditAction.MEMBER_ADDED: "Membro aggiunto",
    AuditAction.MEMBER_REMOVED: "Membro rimosso",
    AuditAction.ROLE_CREATED: "Ruolo creato",
    AuditAction.ROLE_UPDATED: "Ruolo modificato",
    AuditAction.ROLE_DELETED: "Ruolo eliminato",
    AuditAction.PERMISSIONS_UPDATED: "Permessi aggiornati",
    AuditAction.ROLE_ASSIGNED: "Ruolo assegnato",
    AuditAction.ROLE_UNASSIGNED: "Ruolo rimosso",
    AuditAction.VISIBILITY_RULES_UPDATED: "Regole visibilità aggiornate",
    AuditAction.LEAD_CREATED: "Lead creato",
    AuditAction.LEAD_UPDATED: "Lead modificato",
    AuditAction.LEAD_DELETED: "Lead eliminato",
    AuditAction.LEAD_ASSIGNED: "Lead assegnato",
    AuditAction.LEAD_EXPORTED: "Lead esportati"
}


# Entity type labels for UI display (Italian)
ENTITY_TYPE_LABELS = {
    EntityType.USER: "Utente",
    EntityType.TEAM: "Team",
    EntityType.ROLE: "Ruolo",
    EntityType.PERMISSION: "Permessi",
    EntityType.VISIBILITY_RULE: "Visibilità",
    EntityType.LEAD: "Lead",
    EntityType.AUTH: "Autenticazione"
}
