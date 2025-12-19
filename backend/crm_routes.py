from fastapi import APIRouter, HTTPException, Header, Depends
from typing import Optional, List
from datetime import datetime, timezone
import os
import uuid
import logging
from crm_models import (
    User, UserCreate, UserLogin, UserUpdate,
    Team, TeamCreate,
    CustomStatus, CustomStatusCreate,
    LeadEnhanced, LeadUpdate, LeadAssignment,
    ActivityLog, ActivityLogCreate,
    LeadNote, LeadNoteCreate,
    CallbackReminder, CallbackReminderCreate,
    MassUpdateData
)
from auth_utils import hash_password, verify_password, create_access_token, get_user_from_token
from permission_engine import get_permission_engine, PermissionEngine
from admin_models import PermissionAction, PermissionScope
from db_utils import (
    insert_and_return_clean, 
    clean_document_for_response,
    get_user_visibility_rules,
    apply_visibility_to_lead
)
from audit_utils import log_auth_event, log_lead_action, AuditAction
from session_utils import get_session_expiry, get_session_info, is_session_valid, get_berlin_time
from session_settings import (
    get_session_settings, is_within_work_hours, 
    get_session_expiry_from_settings, init_session_settings_db
)

# Create router
crm_router = APIRouter(prefix="/api/crm")

# Database will be injected
db = None
permission_engine: PermissionEngine = None

# Logger
logger = logging.getLogger(__name__)

def init_crm_db(database):
    global db, permission_engine
    init_session_settings_db(database)  # Initialize session settings
    db = database
    permission_engine = get_permission_engine(database)

# Dependency to get current user from token
async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization header")
    
    try:
        token = authorization.replace('Bearer ', '')
        user_data = get_user_from_token(token)
        user = await db.crm_users.find_one({"id": user_data["user_id"]})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

# Check if user has required role
def require_role(required_roles: List[str]):
    async def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in required_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return role_checker

# Phone masking utility
def mask_phone_for_display(phone: str, user_role: str) -> str:
    """
    Mask phone number for visual display in CRM
    - Admins see FULL phone numbers
    - Agents/Supervisors see masked numbers (for security)
    Returns masked version like: +39 xxx xxx x445
    """
    # Admins see full phone numbers
    if user_role == 'admin':
        return phone
    
    if not phone or len(phone) <= 4:
        return phone
    
    # Show country code and last 4 digits for non-admins
    # Example: +39 335453156464445 -> +39 xxx xxx x445
    if phone.startswith('+'):
        country_code = phone[:3]  # +39
        last_4 = phone[-4:]       # last 4 digits
        masked_middle = ' xxx xxx x'
        return f"{country_code}{masked_middle}{last_4}"
    else:
        # No country code, just mask middle
        last_4 = phone[-4:]
        return f"xxx xxx x{last_4}"

# ==================== AUTHENTICATION ROUTES ====================

@crm_router.post("/auth/login")
async def login(credentials: UserLogin):
    """CRM user login"""
    user = await db.crm_users.find_one({"username": credentials.username})
    
    if not user:
        # Log failed login attempt
        await log_auth_event(
            action=AuditAction.LOGIN_FAILED,
            username=credentials.username,
            success=False,
            details={"reason": "User not found"}
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user.get("is_active", True):
        # Log failed login due to inactive account
        await log_auth_event(
            action=AuditAction.LOGIN_FAILED,
            username=credentials.username,
            user_id=user["id"],
            success=False,
            details={"reason": "Account inactive"}
        )
        raise HTTPException(status_code=401, detail="Account is inactive")
    
    if not verify_password(credentials.password, user["password"]):
        # Log failed login due to wrong password
        await log_auth_event(
            action=AuditAction.LOGIN_FAILED,
            username=credentials.username,
            user_id=user["id"],
            success=False,
            details={"reason": "Invalid password"}
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Check if non-admin user is trying to login after work hours
    user_role = user.get("role", "").lower()
    if user_role != "admin":
        settings = await get_session_settings()
        is_work_hours, reason = await is_within_work_hours(settings)
        
        if not is_work_hours and settings.get("require_approval_after_hours", True):
            # Clean up expired approved requests first
            await db.login_requests.delete_many({
                "user_id": user["id"],
                "status": "approved",
                "expires_at": {"$lt": datetime.now(timezone.utc)}
            })
            
            # Check if user has a valid approved login request
            approved_request = await db.login_requests.find_one({
                "user_id": user["id"],
                "status": "approved",
                "expires_at": {"$gt": datetime.now(timezone.utc)}
            })
            
            if approved_request:
                # User has valid approval - allow login and consume the approval
                logger.info(f"User {user['username']} has valid approval, allowing after-hours login")
            else:
                # Check if there's already a pending request for this user (prevent duplicates)
                existing_pending = await db.login_requests.find_one({
                    "user_id": user["id"],
                    "status": "pending"
                })
                
                if not existing_pending:
                    # Create a new pending login request only if none exists
                    from uuid import uuid4
                    request_id = str(uuid4())
                    await db.login_requests.insert_one({
                        "id": request_id,
                        "user_id": user["id"],
                        "username": user["username"],
                        "full_name": user["full_name"],
                        "role": user["role"],
                        "status": "pending",
                        "reason": reason,
                        "requested_at": datetime.now(timezone.utc),
                        "expires_at": None
                    })
                    
                    # Log the attempt
                    await log_auth_event(
                        action=AuditAction.LOGIN_FAILED,
                        username=credentials.username,
                        user_id=user["id"],
                        success=False,
                        details={"reason": "After hours - pending admin approval", "request_id": request_id}
                    )
                
                # Return error with reason code (not hardcoded message - frontend will translate)
                raise HTTPException(
                    status_code=403, 
                    detail=f"after_hours_approval_required:{reason}"
                )
    
    # Update last login
    await db.crm_users.update_one(
        {"id": user["id"]},
        {"$set": {"last_login": datetime.now(timezone.utc)}}
    )
    
    # Note: Don't delete the approved request immediately - let it stay valid
    # for its entire duration so user can re-login if needed. The cleanup
    # at the start of this function will remove expired approvals.
    
    # Calculate session expiry from settings
    session_expiry = await get_session_expiry_from_settings()
    
    # Log successful login
    await log_auth_event(
        action=AuditAction.LOGIN_SUCCESS,
        username=user["username"],
        user_id=user["id"],
        success=True,
        details={"session_expiry": session_expiry.isoformat()}
    )
    
    # Create token with session expiry
    token = create_access_token({
        "user_id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "session_expiry": session_expiry.isoformat()
    })
    
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"],
            "team_id": user.get("team_id")
        },
        "session": {
            "expiry": session_expiry.isoformat(),
            "info": await get_session_info()
        }
    }

@crm_router.get("/auth/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Get current user information"""
    return {
        "id": current_user["id"],
        "username": current_user["username"],
        "full_name": current_user["full_name"],
        "role": current_user["role"],
        "team_id": current_user.get("team_id")
    }


@crm_router.post("/auth/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """Logout user and log the event to audit trail"""
    # Log logout event to audit trail
    await log_auth_event(
        action=AuditAction.LOGOUT,
        username=current_user["username"],
        user_id=current_user["id"],
        success=True
    )
    
    return {"success": True, "message": "Logout successful"}


@crm_router.get("/auth/session-check")
async def check_session(current_user: dict = Depends(get_current_user)):
    """
    Check if the current session is still valid.
    Sessions expire based on admin-configured settings.
    Frontend should call this periodically and logout if expired.
    
    IMPORTANT: Users with valid after-hours approval remain logged in
    even outside work hours until their approval expires.
    """
    # Admin users are never auto-logged out
    if current_user.get("role", "").lower() == "admin":
        settings = await get_session_settings()
        return {
            "valid": True,
            "session_info": {
                "is_admin": True,
                "session_end_time": f"{settings['session_end_hour']:02d}:{settings['session_end_minute']:02d}",
                "minutes_remaining": 999
            },
            "message": "admin_always_valid"
        }
    
    # Check if within work hours using database settings
    settings = await get_session_settings()
    is_work_hours, reason = await is_within_work_hours(settings)
    
    # Build session info for display - use configured timezone
    from session_settings import get_current_time_in_timezone
    tz_name = settings.get("timezone", "Europe/Berlin")
    current_tz_time = get_current_time_in_timezone(tz_name)
    from datetime import time as dt_time
    end_time = dt_time(settings["session_end_hour"], settings["session_end_minute"])
    
    if is_work_hours:
        end_datetime = current_tz_time.replace(
            hour=settings["session_end_hour"],
            minute=settings["session_end_minute"],
            second=0
        )
        minutes_remaining = int((end_datetime - current_tz_time).total_seconds() / 60)
    else:
        minutes_remaining = 0
    
    session_info = {
        "current_time": current_tz_time.strftime("%Y-%m-%d %H:%M:%S"),
        "timezone": tz_name,
        "day_of_week": current_tz_time.strftime("%A"),
        "is_weekday": current_tz_time.weekday() in settings.get("work_days", [0,1,2,3,4]),
        "is_work_hours": is_work_hours,
        "session_end_time": f"{settings['session_end_hour']:02d}:{settings['session_end_minute']:02d}",
        "minutes_remaining": max(0, minutes_remaining)
    }
    
    # If outside work hours, check for valid after-hours approval
    if not is_work_hours:
        # Check if user has a valid approved login request
        approved_request = await db.login_requests.find_one({
            "user_id": current_user["id"],
            "status": "approved",
            "expires_at": {"$gt": datetime.now(timezone.utc)}
        })
        
        if approved_request:
            # User has valid approval - session is still valid
            approval_expires = approved_request.get("expires_at")
            if approval_expires:
                # Ensure datetime is timezone-aware for comparison
                if approval_expires.tzinfo is None:
                    approval_expires = approval_expires.replace(tzinfo=timezone.utc)
                # Calculate minutes remaining until approval expires
                time_until_expiry = approval_expires - datetime.now(timezone.utc)
                approval_minutes_remaining = int(time_until_expiry.total_seconds() / 60)
                session_info["approval_expires_at"] = approval_expires.isoformat()
                session_info["approval_minutes_remaining"] = max(0, approval_minutes_remaining)
                session_info["has_after_hours_approval"] = True
            
            logger.info(f"User {current_user['username']} has valid after-hours approval, session valid")
            return {
                "valid": True,
                "session_info": session_info,
                "message": f"After-hours access approved. Approval expires in {session_info.get('approval_minutes_remaining', 0)} minutes."
            }
        
        # No valid approval - session expired
        end_time_str = f"{settings['session_end_hour']:02d}:{settings['session_end_minute']:02d}"
        await log_auth_event(
            action=AuditAction.LOGOUT,
            username=current_user["username"],
            user_id=current_user["id"],
            success=True,
            details={"reason": f"Session expired at {end_time_str}", "auto_logout": True}
        )
        
        return {
            "valid": False,
            "reason": reason,
            "session_info": session_info
        }
    
    return {
        "valid": True,
        "session_info": session_info,
        "message": f"Session valid. Expires in {session_info['minutes_remaining']} minutes."
    }


# ==================== USER MANAGEMENT ROUTES ====================

@crm_router.post("/users", dependencies=[Depends(require_role(["admin"]))])
async def create_user(user_data: UserCreate, current_user: dict = Depends(get_current_user)):
    """Create new CRM user (Admin only)"""
    # Check if username already exists
    existing = await db.crm_users.find_one({"username": user_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Create user
    hashed_pw = hash_password(user_data.password)
    user = User(
        username=user_data.username,
        full_name=user_data.full_name,
        role=user_data.role,
        team_id=user_data.team_id,
        created_by=current_user["id"]
    )
    
    user_dict = user.dict()
    user_dict["password"] = hashed_pw
    
    await db.crm_users.insert_one(user_dict)
    
    # Log activity
    activity = ActivityLogCreate(
        lead_id="system",
        user_id=current_user["id"],
        user_name=current_user["full_name"],
        action="user_created",
        details=f"Created user {user.full_name} with role {user.role}"
    )
    await db.activity_logs.insert_one(activity.dict())
    
    return {"success": True, "user_id": user.id}

@crm_router.get("/users")
async def get_users(current_user: dict = Depends(get_current_user)):
    """Get all users - accessible by all roles (agents need to see names in leads)"""
    # Exclude soft-deleted users (deleted_at is not null)
    users = await db.crm_users.find(
        {"deleted_at": None}, 
        {"password": 0, "_id": 0}
    ).to_list(1000)
    return users

@crm_router.get("/users/{user_id}")
async def get_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Get specific user"""
    user = await db.crm_users.find_one({"id": user_id}, {"password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@crm_router.put("/users/{user_id}", dependencies=[Depends(require_role(["admin"]))])
async def update_user(user_id: str, update_data: UserUpdate, current_user: dict = Depends(get_current_user)):
    """Update user (Admin only)"""
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    
    if not update_dict:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    # If username is being updated, check it doesn't exist
    if "username" in update_dict:
        existing = await db.crm_users.find_one({"username": update_dict["username"], "id": {"$ne": user_id}})
        if existing:
            raise HTTPException(status_code=400, detail="Username already in use by another user")
    
    # If password is being updated, hash it
    if "password" in update_dict:
        update_dict["password"] = hash_password(update_dict["password"])
    
    result = await db.crm_users.update_one(
        {"id": user_id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"success": True}

@crm_router.delete("/users/{user_id}", dependencies=[Depends(require_role(["admin"]))])
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Soft-delete user (Admin only) - marks user as deleted but keeps record"""
    # Cannot delete yourself
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    # Check if user exists and is not already deleted
    user = await db.crm_users.find_one({"id": user_id, "deleted_at": None})
    if not user:
        raise HTTPException(status_code=404, detail="User not found or already deleted")
    
    # Soft-delete: set deleted_at timestamp and deactivate
    result = await db.crm_users.update_one(
        {"id": user_id},
        {"$set": {
            "deleted_at": datetime.now(timezone.utc),
            "is_active": False
        }}
    )
    
    # Log activity
    activity = ActivityLog(
        lead_id="system",
        user_id=current_user["id"],
        user_name=current_user["full_name"],
        action="user_deleted",
        details=f"Deleted user {user.get('full_name')} ({user.get('username')})"
    )
    await db.activity_logs.insert_one(activity.dict())
    
    return {"success": True, "message": "User deleted successfully"}

# ==================== TEAM MANAGEMENT ROUTES ====================

@crm_router.post("/teams", dependencies=[Depends(require_role(["admin"]))])
async def create_team(team_data: TeamCreate, current_user: dict = Depends(get_current_user)):
    """Create new team"""
    team = Team(**team_data.dict())
    await db.teams.insert_one(team.dict())
    return {"success": True, "team_id": team.id}

@crm_router.get("/teams")
async def get_teams(current_user: dict = Depends(get_current_user)):
    """Get all teams"""
    teams = await db.teams.find({"is_active": True}, {"_id": 0}).to_list(1000)
    return teams

@crm_router.get("/teams/{team_id}")
async def get_team(team_id: str, current_user: dict = Depends(get_current_user)):
    """Get specific team"""
    team = await db.teams.find_one({"id": team_id})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team

# ==================== CUSTOM STATUS ROUTES ====================

@crm_router.post("/statuses", dependencies=[Depends(require_role(["admin"]))])
async def create_status(status_data: CustomStatusCreate, current_user: dict = Depends(get_current_user)):
    """Create custom status"""
    status = CustomStatus(**status_data.dict())
    await db.custom_statuses.insert_one(status.dict())
    return {"success": True, "status_id": status.id}

@crm_router.get("/statuses")
async def get_statuses(current_user: dict = Depends(get_current_user)):
    """Get all statuses"""
    statuses = await db.custom_statuses.find({"is_active": True}, {"_id": 0}).sort("order", 1).to_list(1000)
    return statuses

@crm_router.put("/statuses/{status_id}", dependencies=[Depends(require_role(["admin"]))])
async def update_status(status_id: str, status_data: CustomStatusCreate, current_user: dict = Depends(get_current_user)):
    """Update status"""
    result = await db.custom_statuses.update_one(
        {"id": status_id},
        {"$set": status_data.dict()}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Status not found")
    
    return {"success": True}

@crm_router.delete("/statuses/{status_id}", dependencies=[Depends(require_role(["admin"]))])
async def delete_status(status_id: str, current_user: dict = Depends(get_current_user)):
    """Delete status"""
    result = await db.custom_statuses.update_one(
        {"id": status_id},
        {"$set": {"is_active": False}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Status not found")
    
    return {"success": True}

# ==================== LEAD MANAGEMENT ROUTES ====================

@crm_router.get("/leads")
async def get_crm_leads(
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    team_id: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get leads with filters - uses permission engine for data scoping"""
    # Get data scope filter from permission engine (GUI-configured)
    scope_filter = await permission_engine.get_data_scope_filter(
        user_id=current_user["id"],
        entity="leads"
    )
    query = {**scope_filter}
    
    # Apply additional filters
    if status:
        query["status"] = status
    
    # Check if user has permission to filter by assigned_to (team or all scope)
    read_perm = await permission_engine.check_permission(
        user_id=current_user["id"],
        entity="leads",
        action=PermissionAction.READ
    )
    
    if assigned_to and read_perm.scope in [PermissionScope.TEAM, PermissionScope.ALL]:
        query["assigned_to"] = assigned_to
    if team_id and read_perm.scope == PermissionScope.ALL:
        query["team_id"] = team_id
    if priority:
        query["priority"] = priority
    
    # Search filter
    if search:
        query["$or"] = [
            {"fullName": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"scammerCompany": {"$regex": search, "$options": "i"}}
        ]
    
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Get visibility rules for current user (GUI-configured, backend-enforced)
    user_team_ids = current_user.get("team_ids", []) or []
    if current_user.get("team_id") and current_user["team_id"] not in user_team_ids:
        user_team_ids.append(current_user["team_id"])
    
    visibility_rules = await get_user_visibility_rules(
        db, 
        current_user["id"],
        current_user.get("role", "agent"),
        user_team_ids
    )
    
    # Apply visibility rules to each lead (backend-only masking)
    processed_leads = []
    for lead in leads:
        processed_lead = apply_visibility_to_lead(lead, visibility_rules)
        processed_leads.append(processed_lead)
    
    return processed_leads

@crm_router.get("/leads/{lead_id}")
async def get_lead_detail(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get lead details - uses permission engine for access control"""
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Check permission using permission engine (GUI-configured)
    permission_result = await permission_engine.check_permission(
        user_id=current_user["id"],
        entity="leads",
        action=PermissionAction.READ,
        resource_owner_id=lead.get("assigned_to"),
        resource_team_id=lead.get("team_id")
    )
    
    if not permission_result.allowed:
        raise HTTPException(status_code=403, detail=f"Access denied: {permission_result.reason}")
    
    # Get visibility rules for current user (GUI-configured, backend-enforced)
    user_team_ids = current_user.get("team_ids", []) or []
    if current_user.get("team_id") and current_user["team_id"] not in user_team_ids:
        user_team_ids.append(current_user["team_id"])
    
    visibility_rules = await get_user_visibility_rules(
        db, 
        current_user["id"],
        current_user.get("role", "agent"),
        user_team_ids
    )
    
    # Apply visibility rules (backend-only masking)
    lead = apply_visibility_to_lead(lead, visibility_rules)
    
    return lead

@crm_router.put("/leads/{lead_id}")
async def update_lead(lead_id: str, update_data: LeadUpdate, current_user: dict = Depends(get_current_user)):
    """Update lead - uses permission engine for access control"""
    lead = await db.leads.find_one({"id": lead_id})
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Check permission using permission engine (GUI-configured)
    permission_result = await permission_engine.check_permission(
        user_id=current_user["id"],
        entity="leads",
        action=PermissionAction.EDIT,
        resource_owner_id=lead.get("assigned_to"),
        resource_team_id=lead.get("team_id")
    )
    
    if not permission_result.allowed:
        raise HTTPException(status_code=403, detail=f"Access denied: {permission_result.reason}")
    
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc)
    
    # Log status change
    if "status" in update_dict and update_dict["status"] != lead.get("status"):
        activity = ActivityLog(
            lead_id=lead_id,
            user_id=current_user["id"],
            user_name=current_user["full_name"],
            action="status_changed",
            details=f"Status changed from {lead.get('status')} to {update_dict['status']}"
        )
        await db.activity_logs.insert_one(activity.dict())
    
    # Create callback reminder if status is callback
    if update_dict.get("status") == "callback" and update_dict.get("callback_date"):
        reminder = CallbackReminder(
            lead_id=lead_id,
            assigned_to=lead.get("assigned_to") or current_user["id"],
            callback_date=update_dict["callback_date"],
            notes=update_dict.get("callback_notes", "")
        )
        await db.callback_reminders.insert_one(reminder.dict())
    
    result = await db.leads.update_one(
        {"id": lead_id},
        {"$set": update_dict}
    )
    
    return {"success": True}

@crm_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Delete lead - permission controlled via Admin GUI"""
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Check permission using permission engine
    permission_result = await permission_engine.check_permission(
        user_id=current_user["id"],
        entity="leads",
        action=PermissionAction.DELETE,
        resource_owner_id=lead.get("assigned_to"),
        resource_team_id=lead.get("team_id")
    )
    
    if not permission_result.allowed:
        raise HTTPException(
            status_code=403, 
            detail=f"Permission denied: {permission_result.reason}"
        )
    
    # Delete the lead
    result = await db.leads.delete_one({"id": lead_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Log activity
    activity = ActivityLog(
        lead_id=lead_id,
        user_id=current_user["id"],
        user_name=current_user["full_name"],
        action="lead_deleted",
        details=f"Deleted lead: {lead.get('fullName')}"
    )
    await db.activity_logs.insert_one(activity.dict())
    
    return {"success": True, "message": "Lead deleted successfully"}


@crm_router.post("/leads/{lead_id}/assign")
async def assign_lead(assignment: LeadAssignment, current_user: dict = Depends(get_current_user)):
    """Assign lead to agent - uses permission engine for access control"""
    # Check permission using permission engine (GUI-configured)
    lead = await db.leads.find_one({"id": assignment.lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    permission_result = await permission_engine.check_permission(
        user_id=current_user["id"],
        entity="leads",
        action=PermissionAction.ASSIGN,
        resource_owner_id=lead.get("assigned_to"),
        resource_team_id=lead.get("team_id")
    )
    
    if not permission_result.allowed:
        raise HTTPException(status_code=403, detail=f"Permission denied: {permission_result.reason}")
    
    # Verify agent exists
    agent = await db.crm_users.find_one({"id": assignment.assigned_to})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Update lead
    await db.leads.update_one(
        {"id": assignment.lead_id},
        {"$set": {
            "assigned_to": assignment.assigned_to,
            "assigned_by": assignment.assigned_by,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    # Log activity
    activity = ActivityLog(
        lead_id=assignment.lead_id,
        user_id=current_user["id"],
        user_name=current_user["full_name"],
        action="lead_assigned",
        details=f"Lead assigned to {agent['full_name']}"
    )
    await db.activity_logs.insert_one(activity.dict())
    
    return {"success": True}

# ==================== NOTES ROUTES ====================

@crm_router.post("/leads/{lead_id}/notes")
async def add_note(lead_id: str, note_data: LeadNoteCreate, current_user: dict = Depends(get_current_user)):
    """Add note to lead"""
    note = LeadNote(
        lead_id=lead_id,
        user_id=current_user["id"],
        user_name=current_user["full_name"],
        note=note_data.note,
        is_internal=note_data.is_internal
    )
    
    await db.lead_notes.insert_one(note.dict())
    
    # Log activity
    activity = ActivityLog(
        lead_id=lead_id,
        user_id=current_user["id"],
        user_name=current_user["full_name"],
        action="note_added",
        details="Added note to lead"
    )
    await db.activity_logs.insert_one(activity.dict())
    
    return {"success": True, "note_id": note.id}

@crm_router.get("/leads/{lead_id}/notes")
async def get_lead_notes(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get all notes for a lead"""
    notes = await db.lead_notes.find({"lead_id": lead_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return notes

# ==================== ACTIVITY LOG ROUTES ====================

@crm_router.get("/leads/{lead_id}/activity")
async def get_lead_activity(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get activity log for a lead"""
    activities = await db.activity_logs.find({"lead_id": lead_id}, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    return activities

# ==================== CALLBACK REMINDERS ROUTES ====================

@crm_router.get("/reminders")
async def get_reminders(current_user: dict = Depends(get_current_user)):
    """Get pending callback reminders for current user"""
    query = {
        "assigned_to": current_user["id"],
        "is_completed": False,
        "callback_date": {"$lte": datetime.now(timezone.utc)}
    }
    
    reminders = await db.callback_reminders.find(query, {"_id": 0}).sort("callback_date", 1).to_list(1000)
    return reminders

@crm_router.put("/reminders/{reminder_id}/complete")
async def complete_reminder(reminder_id: str, current_user: dict = Depends(get_current_user)):
    """Mark reminder as completed"""
    result = await db.callback_reminders.update_one(
        {"id": reminder_id, "assigned_to": current_user["id"]},
        {"$set": {"is_completed": True, "completed_at": datetime.now(timezone.utc)}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")
    
    return {"success": True}

# ==================== MASS UPDATE ROUTES ====================

@crm_router.post("/leads/mass-update")
async def mass_update_leads(update_data: MassUpdateData, current_user: dict = Depends(get_current_user)):
    """Mass update multiple leads - uses permission engine for access control"""
    if not update_data.lead_ids:
        raise HTTPException(status_code=400, detail="No leads selected")
    
    # Check edit permission for leads entity
    permission_result = await permission_engine.check_permission(
        user_id=current_user["id"],
        entity="leads",
        action=PermissionAction.EDIT
    )
    
    # Only users with team or all scope can do mass updates
    if permission_result.scope not in [PermissionScope.TEAM, PermissionScope.ALL]:
        raise HTTPException(status_code=403, detail="Permission denied: Mass updates require team or full access")
    
    # Build update dict
    update_dict = {}
    if update_data.status:
        update_dict["status"] = update_data.status
    if update_data.team_id:
        update_dict["team_id"] = update_data.team_id
    if update_data.assigned_to:
        update_dict["assigned_to"] = update_data.assigned_to
    
    if not update_dict:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    update_dict["updated_at"] = datetime.now(timezone.utc)
    
    # Update leads
    result = await db.leads.update_many(
        {"id": {"$in": update_data.lead_ids}},
        {"$set": update_dict}
    )
    
    # Log activity
    activity = ActivityLog(
        lead_id="mass_update",
        user_id=current_user["id"],
        user_name=current_user["full_name"],
        action="mass_update",
        details=f"Mass updated {result.modified_count} leads"
    )
    await db.activity_logs.insert_one(activity.dict())
    
    return {"success": True, "updated_count": result.modified_count}


# ==================== LEAD CREATION ROUTE ====================

@crm_router.post("/leads/create")
async def create_crm_lead(lead_data: dict, current_user: dict = Depends(get_current_user)):
    """Create a new lead with auto-assignment to creator's team and user"""
    try:
        # Check for duplicate email
        email = lead_data.get("email", "").strip().lower()
        if email:
            existing_lead = await db.leads.find_one(
                {"email": {"$regex": f"^{email}$", "$options": "i"}},
                {"_id": 0, "id": 1, "fullName": 1, "email": 1}
            )
            if existing_lead:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Esiste già un lead con questa email: {existing_lead.get('fullName', 'Sconosciuto')}"
                )
        
        # Create lead with auto-assignment
        lead_id = str(uuid.uuid4())
        
        # Base lead data from input
        lead = {
            "id": lead_id,
            "fullName": lead_data.get("fullName"),
            "email": lead_data.get("email"),
            "phone": lead_data.get("phone"),
            "scammerCompany": lead_data.get("scammerCompany"),
            "amountLost": lead_data.get("amountLost"),
            "caseDetails": lead_data.get("caseDetails"),
            "status": lead_data.get("status", "New"),
            "priority": lead_data.get("priority", "medium"),
            "source": "CRM - Created by user",
            "createdAt": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        
        # Auto-assign to creator's team and user
        if current_user.get("team_id"):
            lead["team_id"] = current_user["team_id"]
        
        lead["assigned_to"] = current_user["id"]
        lead["assigned_to_name"] = current_user["full_name"]
        
        # Use utility to insert (avoids ObjectId serialization if we ever return the lead)
        await insert_and_return_clean(db.leads, lead)
        
        # Log activity (also use utility)
        activity = ActivityLog(
            lead_id=lead_id,
            user_id=current_user["id"],
            user_name=current_user["full_name"],
            action="create_lead",
            details=f"Created lead: {lead['fullName']}"
        )
        await insert_and_return_clean(db.activity_logs, activity.dict())
        
        # Log to audit trail
        await log_lead_action(
            action=AuditAction.LEAD_CREATED,
            actor_id=current_user["id"],
            actor_name=current_user.get("username", current_user["full_name"]),
            lead_id=lead_id,
            lead_name=lead["fullName"],
            details={
                "email": lead.get("email"),
                "phone": lead.get("phone"),
                "amount_lost": lead.get("amountLost"),
                "assigned_to": current_user["full_name"]
            }
        )
        
        return {"success": True, "lead_id": lead_id, "message": "Lead created successfully"}
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is (e.g., duplicate email error)
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== CALLBACK SNOOZE ALERTS ====================

@crm_router.post("/callback-snooze-alert")
async def notify_supervisor_callback_ignored(
    lead_id: str,
    agent_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Notify supervisor when agent ignores callback 3 times"""
    try:
        # Get the lead and agent info
        lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
        agent = await db.crm_users.find_one({"id": agent_id}, {"_id": 0})
        
        if not lead or not agent:
            raise HTTPException(status_code=404, detail="Lead or agent not found")
        
        # Get agent's team
        team_id = agent.get("team_id")
        if not team_id:
            # No team, no supervisor to notify
            return {"success": False, "message": "Agent has no team"}
        
        # Get team to find supervisor
        team = await db.teams.find_one({"id": team_id}, {"_id": 0})
        if not team or not team.get("supervisor_id"):
            return {"success": False, "message": "Team has no supervisor"}
        
        supervisor_id = team["supervisor_id"]
        supervisor = await db.crm_users.find_one({"id": supervisor_id}, {"_id": 0})
        
        if not supervisor:
            return {"success": False, "message": "Supervisor not found"}
        
        # Create notification/alert for supervisor
        alert = {
            "id": str(uuid.uuid4()),
            "type": "callback_ignored",
            "supervisor_id": supervisor_id,
            "agent_id": agent_id,
            "agent_name": agent.get("full_name"),
            "lead_id": lead_id,
            "lead_name": lead.get("fullName"),
            "lead_phone": lead.get("phone"),
            "callback_date": lead.get("callback_date"),
            "message": f"Agente {agent.get('full_name')} ha ignorato 3 volte il callback per {lead.get('fullName')}",
            "created_at": datetime.now(timezone.utc),
            "read": False
        }
        
        await db.supervisor_alerts.insert_one(alert)
        
        return {
            "success": True, 
            "message": "Supervisor notified",
            "supervisor": supervisor.get("full_name")
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@crm_router.get("/supervisor-alerts")
async def get_supervisor_alerts(current_user: dict = Depends(get_current_user)):
    """Get alerts for supervisor - uses permission engine for access control"""
    # Check if user has team or all scope for leads (supervisors/admins)
    permission_result = await permission_engine.check_permission(
        user_id=current_user["id"],
        entity="leads",
        action=PermissionAction.READ
    )
    
    # Only users with team or all scope can see alerts
    if permission_result.scope not in [PermissionScope.TEAM, PermissionScope.ALL]:
        return []
    
    query = {"supervisor_id": current_user["id"], "read": False}
    if permission_result.scope == PermissionScope.ALL:
        query = {"read": False}  # Full access users see all alerts
    
    alerts = await db.supervisor_alerts.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return alerts

@crm_router.put("/supervisor-alerts/{alert_id}/read")
async def mark_alert_read(alert_id: str, current_user: dict = Depends(get_current_user)):
    """Mark alert as read"""
    await db.supervisor_alerts.update_one(
        {"id": alert_id},
        {"$set": {"read": True}}
    )
    return {"success": True}

# ==================== DASHBOARD STATS ====================

@crm_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """Get dashboard statistics - uses permission engine for data scoping"""
    # Get data scope filter from permission engine (GUI-configured)
    scope_filter = await permission_engine.get_data_scope_filter(
        user_id=current_user["id"],
        entity="leads"
    )
    query = {**scope_filter}
    
    total_leads = await db.leads.count_documents(query)
    new_leads = await db.leads.count_documents({**query, "status": "new"})
    in_progress = await db.leads.count_documents({**query, "status": "in_progress"})
    won = await db.leads.count_documents({**query, "status": "won"})
    
    # Get callback reminders
    pending_callbacks = await db.callback_reminders.count_documents({
        "assigned_to": current_user["id"],
        "is_completed": False,
        "callback_date": {"$lte": datetime.now(timezone.utc)}
    })
    
    return {
        "total_leads": total_leads,
        "new_leads": new_leads,
        "in_progress": in_progress,
        "won": won,
        "pending_callbacks": pending_callbacks
    }
