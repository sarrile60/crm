from fastapi import APIRouter, HTTPException, Header, Depends
from typing import Optional, List
from datetime import datetime, timezone
import os
import uuid
import logging
import time
import json
from crm_models import (
    User, UserCreate, UserLogin, UserUpdate,
    Team, TeamCreate,
    CustomStatus, CustomStatusCreate,
    LeadEnhanced, LeadUpdate, LeadAssignment,
    ActivityLog, ActivityLogCreate,
    LeadNote, LeadNoteCreate,
    CallbackReminder, CallbackReminderCreate,
    MassUpdateData, MassDeleteData
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

# ============================================
# API GUARDRAILS - Prevent server overload
# ============================================
MAX_LIMIT = 200  # Maximum records per page for list endpoints
MAX_IDS_PER_REQUEST = 500  # Maximum IDs for bulk operations
MAX_QUERY_TIME_MS = 10000  # 10 second query timeout warning
MAX_RESPONSE_ITEMS = 200  # Maximum items in any list response
ALLOWED_SORT_FIELDS = ["created_at", "fullName", "status", "priority", "email", "phone", "amountLost", "team_id", "assigned_to"]

# List projection fields - only return what's needed for list views
LIST_PROJECTION = {
    "_id": 0,
    "id": 1,
    "fullName": 1,
    "email": 1,
    "phone": 1,
    "status": 1,
    "priority": 1,
    "assigned_to": 1,
    "team_id": 1,
    "created_at": 1,
    "amountLost": 1,
    "callback_date": 1,
    "callback_notes": 1
}

def clamp_limit(limit: int, max_limit: int = MAX_LIMIT) -> int:
    """Clamp limit to safe range [1, max_limit]"""
    if limit < 1:
        return 50  # default
    return min(limit, max_limit)

def clamp_offset(offset: int) -> int:
    """Ensure offset is non-negative"""
    return max(0, offset)

def validate_sort_field(sort: str) -> str:
    """Validate sort field against allowlist"""
    return sort if sort in ALLOWED_SORT_FIELDS else "created_at"

def check_query_time(start_time: float, endpoint: str) -> None:
    """Log warning if query takes too long"""
    duration_ms = (time.time() - start_time) * 1000
    if duration_ms > MAX_QUERY_TIME_MS:
        logger.warning(f"[SLOW QUERY] {endpoint}: {duration_ms:.0f}ms (threshold: {MAX_QUERY_TIME_MS}ms)")

def init_crm_db(database):
    global db, permission_engine
    init_session_settings_db(database)  # Initialize session settings
    db = database
    permission_engine = get_permission_engine(database)

# ============================================
# USER CACHE - Eliminates 1 DB query per request
# ============================================
_user_cache = {}  # user_id -> (timestamp, user_doc)
_USER_CACHE_TTL = 30  # seconds

def _get_cached_user(user_id: str):
    """Get user from cache if not expired"""
    if user_id in _user_cache:
        ts, user = _user_cache[user_id]
        if time.time() - ts < _USER_CACHE_TTL:
            return user
    return None

def _set_cached_user(user_id: str, user_doc: dict):
    """Cache user document"""
    _user_cache[user_id] = (time.time(), user_doc)

def invalidate_user_cache(user_id: str = None):
    """Invalidate user cache - call when user is updated"""
    if user_id:
        _user_cache.pop(user_id, None)
    else:
        _user_cache.clear()

# Dependency to get current user from token (CACHED)
async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization header")
    
    try:
        token = authorization.replace('Bearer ', '')
        user_data = get_user_from_token(token)
        user_id = user_data["user_id"]
        
        # Check cache first
        cached = _get_cached_user(user_id)
        if cached:
            return cached
        
        # Cache miss - query DB
        user = await db.crm_users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        _set_cached_user(user_id, user)
        return user
    except HTTPException:
        raise
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
            "full_name": user.get("full_name", user.get("username", "")),
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
        "full_name": current_user.get("full_name", current_user.get("username", "")),
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
    
    # Invalidate caches for this user
    invalidate_user_cache(user_id)
    permission_engine.cache.invalidate_all()
    
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
    """Get all teams (including archived for admins to manage)"""
    # Return all teams (both active and archived) so admin can manage them
    teams = await db.teams.find({}, {"_id": 0}).to_list(1000)
    return teams

@crm_router.get("/teams/{team_id}")
async def get_team(team_id: str, current_user: dict = Depends(get_current_user)):
    """Get specific team"""
    team = await db.teams.find_one({"id": team_id})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team

@crm_router.put("/teams/{team_id}/archive", dependencies=[Depends(require_role(["admin"]))])
async def archive_team(team_id: str, current_user: dict = Depends(get_current_user)):
    """Archive a team (soft delete)"""
    team = await db.teams.find_one({"id": team_id})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if team.get("archived"):
        raise HTTPException(status_code=400, detail="Team is already archived")
    
    # Check if team has active members
    active_members = await db.crm_users.count_documents({"team_id": team_id, "is_active": True})
    if active_members > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot archive team with {active_members} active member(s). Please reassign or deactivate members first."
        )
    
    await db.teams.update_one(
        {"id": team_id},
        {"$set": {"archived": True, "archived_at": datetime.now(timezone.utc), "is_active": False}}
    )
    
    return {"success": True, "message": "Team archived successfully"}

@crm_router.put("/teams/{team_id}/restore", dependencies=[Depends(require_role(["admin"]))])
async def restore_team(team_id: str, current_user: dict = Depends(get_current_user)):
    """Restore an archived team"""
    team = await db.teams.find_one({"id": team_id})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    # Check both archived flag and archived_at timestamp
    is_archived = team.get("archived") or team.get("archived_at") is not None
    if not is_archived:
        raise HTTPException(status_code=400, detail="Team is not archived")
    
    await db.teams.update_one(
        {"id": team_id},
        {"$set": {"archived": False, "is_active": True}, "$unset": {"archived_at": ""}}
    )
    
    return {"success": True, "message": "Team restored successfully"}

@crm_router.delete("/teams/{team_id}", dependencies=[Depends(require_role(["admin"]))])
async def delete_team(team_id: str, current_user: dict = Depends(get_current_user)):
    """Permanently delete an archived team"""
    team = await db.teams.find_one({"id": team_id})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    # Only allow deleting archived teams (check both archived flag and archived_at timestamp)
    is_archived = team.get("archived") or team.get("archived_at") is not None
    if not is_archived:
        raise HTTPException(
            status_code=400, 
            detail="Team must be archived before it can be deleted. Archive the team first."
        )
    
    # Check if team has any members (even inactive)
    members_count = await db.crm_users.count_documents({"team_id": team_id})
    if members_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete team with {members_count} member(s). Please remove all members first."
        )
    
    # Delete the team
    await db.teams.delete_one({"id": team_id})
    
    return {"success": True, "message": "Team permanently deleted"}

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
    sort: Optional[str] = "created_at",
    order: Optional[str] = "desc",
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user)
):
    """Get leads with filters and pagination - uses permission engine for data scoping"""
    # Start performance monitoring
    start_time = time.time()
    
    # GUARDRAIL: Enforce safe pagination limits
    limit = clamp_limit(limit)
    offset = clamp_offset(offset)
    sort = validate_sort_field(sort)
    
    # Get data scope filter from permission engine (CACHED - typically 0 DB queries)
    scope_filter = await permission_engine.get_data_scope_filter(
        user_id=current_user["id"],
        entity="leads"
    )
    query = {**scope_filter}
    
    # Apply additional filters
    if status:
        query["status"] = status
    
    # Check if user has permission to filter by assigned_to (CACHED)
    read_perm = await permission_engine.check_permission(
        user_id=current_user["id"],
        entity="leads",
        action=PermissionAction.READ
    )
    
    if assigned_to and read_perm.scope in [PermissionScope.TEAM, PermissionScope.ALL]:
        if ',' in assigned_to:
            assigned_to_list = [a.strip() for a in assigned_to.split(',') if a.strip()]
            query["assigned_to"] = {"$in": assigned_to_list}
        else:
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
            {"phone": {"$regex": search, "$options": "i"}},
            {"scammerCompany": {"$regex": search, "$options": "i"}}
        ]
    
    # Sort direction
    sort_direction = -1 if order == "desc" else 1
    sort_field = sort
    
    # PERFORMANCE: Run count and fetch in parallel using asyncio.gather
    import asyncio
    
    count_task = db.leads.count_documents(query)
    fetch_task = db.leads.find(
        query, 
        LIST_PROJECTION
    ).sort(sort_field, sort_direction).skip(offset).limit(limit).to_list(limit)
    
    total, leads = await asyncio.gather(count_task, fetch_task)
    
    query_time = (time.time() - start_time) * 1000
    logger.info(f"[DB QUERY] leads (count+fetch parallel): {query_time:.2f}ms | {len(leads)}/{total} results")
    
    # Get visibility rules for current user (CACHED in db_utils)
    user_team_ids = current_user.get("team_ids", []) or []
    if current_user.get("team_id") and current_user["team_id"] not in user_team_ids:
        user_team_ids.append(current_user["team_id"])
    
    visibility_rules = await get_user_visibility_rules(
        db, 
        current_user["id"],
        current_user.get("role", "agent"),
        user_team_ids
    )
    
    # Apply visibility rules to each lead (in-memory, fast)
    processed_leads = []
    for lead in leads:
        processed_lead = apply_visibility_to_lead(lead, visibility_rules)
        processed_leads.append(processed_lead)
    
    total_time = (time.time() - start_time) * 1000
    logger.info(f"[API] GET /crm/leads: {total_time:.2f}ms | {len(processed_leads)} leads")
    
    return {
        "data": processed_leads,
        "total": total,
        "limit": limit,
        "offset": offset
    }

@crm_router.post("/leads/select-all")
async def select_all_leads(
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    team_id: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Server-side 'Select All' - returns IDs of all leads matching current filters
    GUARDRAIL: Capped at MAX_IDS_PER_REQUEST to prevent server overload
    """
    # Build same query as list endpoint
    scope_filter = await permission_engine.get_data_scope_filter(
        user_id=current_user["id"],
        entity="leads"
    )
    query = {**scope_filter}
    
    if status:
        query["status"] = status
    
    read_perm = await permission_engine.check_permission(
        user_id=current_user["id"],
        entity="leads",
        action=PermissionAction.READ
    )
    
    if assigned_to and read_perm.scope in [PermissionScope.TEAM, PermissionScope.ALL]:
        # Support multiple assigned_to IDs (comma-separated)
        if ',' in assigned_to:
            assigned_to_list = [a.strip() for a in assigned_to.split(',') if a.strip()]
            query["assigned_to"] = {"$in": assigned_to_list}
        else:
            query["assigned_to"] = assigned_to
    if team_id and read_perm.scope == PermissionScope.ALL:
        query["team_id"] = team_id
    if priority:
        query["priority"] = priority
    
    if search:
        query["$or"] = [
            {"fullName": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"scammerCompany": {"$regex": search, "$options": "i"}}
        ]
    
    # Get total count first
    total_count = await db.leads.count_documents(query)
    
    # GUARDRAIL: Cap IDs returned to prevent overload
    capped_limit = min(total_count, MAX_IDS_PER_REQUEST)
    
    # Fetch only IDs (minimal payload)
    lead_ids = await db.leads.find(query, {"_id": 0, "id": 1}).to_list(capped_limit)
    ids = [lead["id"] for lead in lead_ids]
    
    logger.info(f"[API] SELECT ALL: {len(ids)} lead IDs returned (total: {total_count}, capped: {capped_limit})")
    
    return {
        "lead_ids": ids,
        "count": len(ids),
        "total": total_count,
        "capped": total_count > MAX_IDS_PER_REQUEST
    }

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
    
    # Only admins can edit client details (fullName, email, phone, etc.)
    admin_only_fields = ['fullName', 'email', 'phone', 'scammerCompany', 'amountLost', 'caseDetails']
    if current_user.get("role", "").lower() != "admin":
        for field in admin_only_fields:
            if field in update_dict:
                del update_dict[field]
    
    update_dict["updated_at"] = datetime.now(timezone.utc)
    
    # Log status change
    old_status = lead.get("status")
    new_status = update_dict.get("status")
    
    if "status" in update_dict and new_status != old_status:
        activity = ActivityLog(
            lead_id=lead_id,
            user_id=current_user["id"],
            user_name=current_user["full_name"],
            action="status_changed",
            details=f"Status changed from {old_status} to {new_status}"
        )
        await db.activity_logs.insert_one(activity.dict())
        
        # Notify supervisor when agent changes status to Deposit
        deposit_statuses = ['Deposit 1', 'Deposit 2', 'Deposit 3', 'Deposit 4', 'Deposit 5']
        if new_status in deposit_statuses and current_user.get("role", "").lower() == "agent":
            # Find the agent's team and supervisor
            agent = await db.crm_users.find_one({"id": current_user["id"]})
            if agent and agent.get("team_id"):
                team = await db.teams.find_one({"id": agent["team_id"]})
                if team and team.get("supervisor_id"):
                    # Create notification for supervisor
                    deposit_notification = {
                        "id": str(uuid.uuid4()),
                        "type": "lead_deposit_status",
                        "lead_id": lead_id,
                        "lead_name": lead.get("fullName", "Unknown"),
                        "lead_phone": lead.get("phone", ""),
                        "agent_id": current_user["id"],
                        "agent_name": current_user.get("full_name", "Unknown"),
                        "supervisor_id": team["supervisor_id"],
                        "team_id": agent["team_id"],
                        "deposit_status": new_status,
                        "created_at": datetime.now(timezone.utc),
                        "read": False,
                        "processed": False  # Supervisor hasn't created deposit yet
                    }
                    await db.supervisor_deposit_notifications.insert_one(deposit_notification)
    
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


@crm_router.post("/leads/{lead_id}/clear-callback")
async def clear_lead_callback(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Clear callback date and notes from a lead - used when agent completes or removes callback"""
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Clear the callback fields
    result = await db.leads.update_one(
        {"id": lead_id},
        {"$set": {
            "callback_date": None,
            "callback_notes": None,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    # Also remove any pending callback reminders for this lead
    await db.callback_reminders.delete_many({"lead_id": lead_id})
    
    # Log the activity
    activity = ActivityLog(
        lead_id=lead_id,
        user_id=current_user["id"],
        user_name=current_user["full_name"],
        action="callback_cleared",
        details=f"Callback reminder cleared by {current_user['full_name']}"
    )
    await db.activity_logs.insert_one(activity.dict())
    
    logger.info(f"[CALLBACK CLEARED] Lead {lead_id} callback cleared by {current_user['full_name']}")
    
    return {"success": True, "message": "Callback cleared"}


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


@crm_router.post("/leads/mass-delete")
async def mass_delete_leads(delete_data: MassDeleteData, current_user: dict = Depends(get_current_user)):
    """Mass delete multiple leads - uses permission engine for access control"""
    if not delete_data.lead_ids:
        raise HTTPException(status_code=400, detail="No leads selected")
    
    # Check delete permission for leads entity
    permission_result = await permission_engine.check_permission(
        user_id=current_user["id"],
        entity="leads",
        action=PermissionAction.DELETE
    )
    
    # Only users with team or all scope can do mass deletes
    if permission_result.scope not in [PermissionScope.TEAM, PermissionScope.ALL]:
        raise HTTPException(status_code=403, detail="Permission denied: Mass deletes require team or full access")
    
    # Get lead names for logging before deletion
    leads_to_delete = await db.leads.find(
        {"id": {"$in": delete_data.lead_ids}},
        {"_id": 0, "id": 1, "fullName": 1}
    ).to_list(len(delete_data.lead_ids))
    
    lead_names = [lead.get("fullName", "Unknown") for lead in leads_to_delete]
    
    # Delete leads
    result = await db.leads.delete_many(
        {"id": {"$in": delete_data.lead_ids}}
    )
    
    # Log activity
    activity = ActivityLog(
        lead_id="mass_delete",
        user_id=current_user["id"],
        user_name=current_user["full_name"],
        action="mass_delete",
        details=f"Mass deleted {result.deleted_count} leads: {', '.join(lead_names[:5])}{'...' if len(lead_names) > 5 else ''}"
    )
    await db.activity_logs.insert_one(activity.dict())
    
    logger.info(f"[MASS DELETE] User {current_user['full_name']} deleted {result.deleted_count} leads")
    
    return {"success": True, "deleted_count": result.deleted_count}


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
        
        # Notify supervisor if lead is created with Deposit status by an agent
        new_status = lead.get("status", "")
        deposit_statuses = ['Deposit 1', 'Deposit 2', 'Deposit 3', 'Deposit']
        
        if new_status in deposit_statuses and current_user.get("role", "").lower() == "agent":
            # Find the agent's team and supervisor
            agent = await db.crm_users.find_one({"id": current_user["id"]})
            if agent and agent.get("team_id"):
                team = await db.teams.find_one({"id": agent["team_id"]})
                if team and team.get("supervisor_id"):
                    # Create notification for supervisor
                    deposit_notification = {
                        "id": str(uuid.uuid4()),
                        "type": "lead_deposit_status",
                        "lead_id": lead_id,
                        "lead_name": lead.get("fullName", "Unknown"),
                        "lead_phone": lead.get("phone", ""),
                        "agent_id": current_user["id"],
                        "agent_name": current_user.get("full_name", "Unknown"),
                        "supervisor_id": team["supervisor_id"],
                        "team_id": agent["team_id"],
                        "deposit_status": new_status,
                        "created_at": datetime.now(timezone.utc),
                        "read": False,
                        "processed": False
                    }
                    await db.supervisor_deposit_notifications.insert_one(deposit_notification)
        
        return {"success": True, "lead_id": lead_id, "message": "Lead created successfully"}
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is (e.g., duplicate email error)
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== CALLBACK SNOOZE ALERTS ====================

@crm_router.get("/user-stats/{user_id}")
async def get_user_stats(user_id: str, current_user: dict = Depends(get_current_user)):
    """Get statistics for a user - for team member display"""
    from datetime import datetime, timezone, timedelta
    
    # Get today's date range
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    
    # Count total leads assigned to user
    total_leads = await db.leads.count_documents({
        "assigned_to": user_id,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    
    # Count leads completed today (status changed to completed statuses)
    completed_statuses = ["Won", "Sold", "Converted", "Completed", "Closed Won"]
    completed_today = await db.leads.count_documents({
        "assigned_to": user_id,
        "status": {"$in": completed_statuses},
        "updated_at": {"$gte": today_start, "$lt": today_end}
    })
    
    # Count callbacks made today
    callbacks_today = await db.activity_logs.count_documents({
        "user_id": user_id,
        "action": {"$in": ["callback_completed", "call_made"]},
        "timestamp": {"$gte": today_start.isoformat(), "$lt": today_end.isoformat()}
    })
    
    return {
        "total_leads": total_leads,
        "completed_today": completed_today,
        "callbacks_today": callbacks_today
    }


@crm_router.post("/callback-snooze-alert")
async def notify_supervisor_callback_ignored(
    lead_id: str,
    agent_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Notify supervisor when agent ignores callback 3 times - sends chat message"""
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
        
        # Create notification/alert for supervisor (database record)
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
        
        # Send chat message to supervisor
        # First, find or create a conversation between system and supervisor
        system_user_id = "system_notifications"
        
        # Check if conversation exists
        conversation = await db.conversations.find_one({
            "participant_ids": {"$all": [system_user_id, supervisor_id]},
            "is_system_chat": True
        }, {"_id": 0})
        
        if not conversation:
            # Create system notification conversation
            conversation = {
                "id": str(uuid.uuid4()),
                "participant_ids": [system_user_id, supervisor_id],
                "is_group": False,
                "is_system_chat": True,
                "name": "System Notifications",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "last_message": None,
                "last_message_at": None,
                "typing_users": []
            }
            await db.conversations.insert_one(conversation)
        
        # Format callback date nicely
        callback_date_str = lead.get("callback_date", "N/A")
        if callback_date_str and callback_date_str != "N/A":
            try:
                callback_dt = datetime.fromisoformat(callback_date_str.replace('Z', '+00:00'))
                callback_date_str = callback_dt.strftime("%d/%m/%Y %H:%M")
            except:
                pass
        
        # Create the chat message
        now = datetime.now(timezone.utc)
        message_content = f"""⚠️ CALLBACK ALERT ⚠️

Agent: {agent.get('full_name', 'Unknown')}
Lead: {lead.get('fullName', 'Unknown')} ({lead.get('phone', 'N/A')})
Scheduled callback: {callback_date_str}
Time: {now.strftime("%d/%m/%Y %H:%M")}

The agent has postponed this callback 3 times."""

        message = {
            "id": str(uuid.uuid4()),
            "conversation_id": conversation["id"],
            "sender_id": system_user_id,
            "content": message_content,
            "message_type": "system_alert",
            "created_at": now.isoformat(),
            "read_by": [system_user_id],
            "delivered_to": [system_user_id]
        }
        
        await db.messages.insert_one(message)
        
        # Update conversation with last message
        await db.conversations.update_one(
            {"id": conversation["id"]},
            {
                "$set": {
                    "last_message": "⚠️ Callback Alert",
                    "last_message_at": now.isoformat()
                }
            }
        )
        
        return {
            "success": True, 
            "message": "Supervisor notified via chat",
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

# ==================== HEARTBEAT / ACTIVITY TRACKING ====================

@crm_router.post("/heartbeat")
async def update_heartbeat(current_user: dict = Depends(get_current_user)):
    """Update user's last_active timestamp and status - called periodically by frontend"""
    now = datetime.now(timezone.utc)
    
    await db.crm_users.update_one(
        {"id": current_user["id"]},
        {"$set": {
            "last_active": now,
            "status": "active"
        }}
    )
    
    return {"success": True, "last_active": now.isoformat()}


# ==================== SUPERVISOR DEPOSIT NOTIFICATIONS ====================

@crm_router.get("/supervisor/deposit-notifications")
async def get_supervisor_deposit_notifications(current_user: dict = Depends(get_current_user)):
    """Get deposit notifications for supervisor - when agent marks lead as Deposit"""
    role = current_user.get("role", "").lower()
    
    if role not in ["supervisor", "admin"]:
        return {"notifications": [], "unread_count": 0}
    
    # For supervisor, get notifications where they are the supervisor
    # For admin, get all unprocessed notifications
    if role == "admin":
        query = {"processed": False}
    else:
        query = {"supervisor_id": current_user["id"], "processed": False}
    
    notifications = await db.supervisor_deposit_notifications.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    unread_count = len([n for n in notifications if not n.get("read")])
    
    return {
        "notifications": notifications,
        "unread_count": unread_count
    }


@crm_router.put("/supervisor/deposit-notifications/{notification_id}/read")
async def mark_supervisor_deposit_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a supervisor deposit notification as read"""
    await db.supervisor_deposit_notifications.update_one(
        {"id": notification_id},
        {"$set": {"read": True}}
    )
    return {"success": True}


@crm_router.put("/supervisor/deposit-notifications/{notification_id}/processed")
async def mark_supervisor_deposit_notification_processed(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark notification as processed (supervisor created the deposit)"""
    await db.supervisor_deposit_notifications.update_one(
        {"id": notification_id},
        {"$set": {"processed": True, "processed_at": datetime.now(timezone.utc)}}
    )
    return {"success": True}


@crm_router.get("/team-members-status")
async def get_team_members_status(current_user: dict = Depends(get_current_user)):
    """Get real-time status of team members - for supervisors/admins to monitor agent activity"""
    role = current_user.get("role", "").lower()
    
    if role not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Only admins and supervisors can view team status")
    
    now = datetime.now(timezone.utc)
    
    # Get teams this supervisor manages (or all teams for admin)
    if role == "admin":
        teams = await db.teams.find(
            {"$or": [{"archived_at": None}, {"archived_at": {"$exists": False}}]},
            {"_id": 0}
        ).to_list(100)
        team_ids = [t["id"] for t in teams]
    else:
        # Supervisor sees teams they supervise OR teams they are assigned to
        user_team_id = current_user.get("team_id")
        
        # Build query: teams they supervise OR their assigned team
        team_conditions = [{"supervisor_id": current_user["id"]}]
        if user_team_id:
            team_conditions.append({"id": user_team_id})
        
        teams = await db.teams.find(
            {
                "$or": team_conditions,
                "$and": [{"$or": [{"archived_at": None}, {"archived_at": {"$exists": False}}]}]
            },
            {"_id": 0}
        ).to_list(100)
        team_ids = [t["id"] for t in teams]
    
    if not team_ids:
        return {"members": [], "teams": []}
    
    # Get all members in these teams
    members = await db.crm_users.find(
        {
            "team_id": {"$in": team_ids},
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        },
        {"_id": 0, "password": 0}
    ).to_list(200)
    
    # Calculate real-time status based on last_active
    # If last_active is within 2 minutes, user is "active", otherwise "inactive"
    for member in members:
        last_active = member.get("last_active")
        if last_active:
            if isinstance(last_active, str):
                last_active = datetime.fromisoformat(last_active.replace('Z', '+00:00'))
            
            # Make sure last_active is timezone-aware for comparison
            if last_active.tzinfo is None:
                last_active = last_active.replace(tzinfo=timezone.utc)
            
            time_diff = (now - last_active).total_seconds()
            # Active if last seen within 2 minutes
            if time_diff < 120:
                member["status"] = "active"
            else:
                member["status"] = "inactive"
            
            # Convert last_active to ISO string for JSON serialization
            member["last_active"] = last_active.isoformat()
        else:
            member["status"] = "inactive"
    
    # Add member count to each team for consistency with /chat/teams endpoint
    for team in teams:
        member_count = await db.crm_users.count_documents({
            "team_id": team["id"],
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}],
            "is_active": {"$ne": False}
        })
        team["member_count"] = member_count
    
    return {"members": members, "teams": teams}


# ==================== DASHBOARD STATS ====================

@crm_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """Get dashboard statistics - uses permission engine for data scoping"""
    import asyncio
    
    # Get data scope filter from permission engine (CACHED)
    scope_filter = await permission_engine.get_data_scope_filter(
        user_id=current_user["id"],
        entity="leads"
    )
    query = {**scope_filter}
    
    # PERFORMANCE: Run all counts in parallel
    total_task = db.leads.count_documents(query)
    new_task = db.leads.count_documents({**query, "status": "new"})
    in_progress_task = db.leads.count_documents({**query, "status": "in_progress"})
    won_task = db.leads.count_documents({**query, "status": "won"})
    callbacks_task = db.callback_reminders.count_documents({
        "assigned_to": current_user["id"],
        "is_completed": False,
        "callback_date": {"$lte": datetime.now(timezone.utc)}
    })
    
    total_leads, new_leads, in_progress, won, pending_callbacks = await asyncio.gather(
        total_task, new_task, in_progress_task, won_task, callbacks_task
    )
    
    return {
        "total_leads": total_leads,
        "new_leads": new_leads,
        "in_progress": in_progress,
        "won": won,
        "pending_callbacks": pending_callbacks
    }



# ==================== CLICK-TO-CALL (FreePBX AMI Integration) ====================

from pydantic import BaseModel as PydanticBaseModel

class MakeCallRequest(PydanticBaseModel):
    lead_id: str

# Public AMI test endpoint (no auth required) - for deployment verification
@crm_router.get("/ami-check")
async def ami_check_public():
    """Public endpoint to verify AMI config is hardcoded correctly"""
    import socket
    import urllib.request
    
    # Get this server's external IP
    try:
        external_ip = urllib.request.urlopen('https://api.ipify.org', timeout=5).read().decode('utf8')
    except:
        external_ip = "UNKNOWN"
    
    # AMI credentials - hardcoded directly (no env vars)
    ami_host = '194.32.79.101'
    ami_port = 5038
    ami_user = 'crm_dialer'
    ami_pass = 'yo123mama'
    
    result = {
        "THIS_SERVER_IP": external_ip,
        "WHITELIST_THIS_IP_IN_FREEPBX": external_ip,
        "code_version": "HARDCODED_V3",
        "ami_host": ami_host,
        "ami_port": ami_port,
        "ami_user": ami_user,
        "ami_pass_length": len(ami_pass),
        "ami_pass_first3": ami_pass[:3],
        "connection_test": "pending",
        "auth_test": "pending"
    }
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((ami_host, ami_port))
        result["connection_test"] = "SUCCESS"
        
        banner = sock.recv(1024).decode()
        result["ami_banner"] = banner.strip()
        
        login_cmd = f"Action: Login\r\nUsername: {ami_user}\r\nSecret: {ami_pass}\r\n\r\n"
        sock.send(login_cmd.encode())
        
        import time
        time.sleep(1)
        response = sock.recv(4096).decode()
        
        if "Success" in response:
            result["auth_test"] = "SUCCESS"
        else:
            result["auth_test"] = "FAILED"
            result["response_preview"] = response[:200]
        
        sock.close()
    except Exception as e:
        result["error"] = str(e)
    
    return result

# Debug endpoint to check AMI configuration (admin only)
@crm_router.get("/ami-debug")
async def ami_debug(current_user: dict = Depends(get_current_user)):
    """Debug endpoint to verify AMI configuration - Admin only"""
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # AMI credentials - hardcoded directly (no env vars)
    ami_host = '194.32.79.101'
    ami_port = '5038'
    ami_user = 'crm_dialer'
    ami_pass = 'yo123mama'
    
    return {
        "ami_host": ami_host,
        "ami_port": ami_port,
        "ami_user": ami_user,
        "ami_pass_preview": f"{ami_pass[:3]}***{ami_pass[-3:]}" if len(ami_pass) > 6 else "***",
        "ami_pass_length": len(ami_pass),
        "env_source": "HARDCODED IN CODE"
    }

# Test AMI connection endpoint (admin only)
@crm_router.get("/ami-test")
async def ami_test(current_user: dict = Depends(get_current_user)):
    """Test AMI connection - Admin only"""
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    import socket
    
    # AMI credentials - hardcoded directly (no env vars)
    ami_host = '194.32.79.101'
    ami_port = 5038
    ami_user = 'crm_dialer'
    ami_pass = 'yo123mama'
    
    result = {
        "ami_host": ami_host,
        "ami_port": ami_port,
        "ami_user": ami_user,
        "ami_pass_length": len(ami_pass),
        "connection_test": "pending",
        "auth_test": "pending"
    }
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((ami_host, ami_port))
        result["connection_test"] = "SUCCESS"
        
        # Read banner
        banner = sock.recv(1024).decode()
        result["ami_banner"] = banner.strip()
        
        # Test auth
        login_cmd = f"Action: Login\r\nUsername: {ami_user}\r\nSecret: {ami_pass}\r\n\r\n"
        sock.send(login_cmd.encode())
        
        import time
        time.sleep(1)
        response = sock.recv(4096).decode()
        
        if "Success" in response:
            result["auth_test"] = "SUCCESS"
        elif "Authentication failed" in response:
            result["auth_test"] = "FAILED - Wrong username or password"
            result["ami_pass_preview"] = f"{ami_pass[:3]}***" if len(ami_pass) > 3 else "***"
        else:
            result["auth_test"] = f"UNKNOWN: {response[:100]}"
        
        sock.close()
        
    except socket.timeout:
        result["connection_test"] = "FAILED - Timeout (firewall?)"
    except ConnectionRefusedError:
        result["connection_test"] = "FAILED - Connection refused"
    except Exception as e:
        result["connection_test"] = f"FAILED - {str(e)}"
    
    return result

@crm_router.post("/make-call")
async def make_call(request: MakeCallRequest, current_user: dict = Depends(get_current_user)):
    """
    Initiate a click-to-call via FreePBX AMI.
    Security: Agent never sees the phone number - it's retrieved server-side.
    """
    print(f"")
    print(f"========== CLICK-TO-CALL REQUEST ==========")
    print(f"Logged in User: {current_user.get('username')}")
    print(f"User ID: {current_user.get('id')}")
    print(f"User Full Name: {current_user.get('full_name')}")
    print(f"Lead ID requested: {request.lead_id}")
    print(f"============================================")
    
    # Get agent's SIP extension from their profile
    agent = await db.crm_users.find_one({"id": current_user["id"]}, {"_id": 0})
    if not agent:
        print(f"ERROR: Agent not found for user ID: {current_user['id']}")
        raise HTTPException(status_code=404, detail="Agent not found")
    
    agent_extension = agent.get("sip_extension")
    print(f"Agent SIP Extension from DB: {agent_extension}")
    
    if not agent_extension:
        print(f"ERROR: No SIP extension configured for user: {current_user.get('username')}")
        raise HTTPException(status_code=400, detail="SIP extension not configured. Please contact your administrator.")
    
    # Get lead's phone number (server-side only - never exposed to frontend)
    lead = await db.leads.find_one({"id": request.lead_id}, {"_id": 0})
    if not lead:
        print(f"ERROR: Lead not found: {request.lead_id}")
        raise HTTPException(status_code=404, detail="Lead not found")
    
    client_number = lead.get("phone")
    if not client_number:
        print(f"ERROR: Lead has no phone number: {request.lead_id}")
        raise HTTPException(status_code=400, detail="Lead has no phone number")
    
    # Clean the phone number (remove spaces, dashes, etc.)
    clean_number = ''.join(filter(str.isdigit, client_number))
    
    # Add Italy country code if not present
    if not clean_number.startswith('39') and len(clean_number) <= 10:
        clean_number = '39' + clean_number
    
    print(f"Client Number (original): {client_number}")
    print(f"Client Number (cleaned): {clean_number}")
    
    # AMI credentials - hardcoded directly (no env vars)
    ami_host = '194.32.79.101'
    ami_port = 5038
    ami_user = 'crm_dialer'
    ami_pass = 'yo123mama'
    
    # Log credentials for debugging (mask password)
    logging.info(f"AMI Connection: {ami_host}:{ami_port} as {ami_user}")
    logging.info(f"AMI Password (first 3 chars): {ami_pass[:3]}***")
    logging.info(f">>> SENDING TO FREEPBX: Extension={agent_extension}, Number={clean_number}")
    
    try:
        # Connect to FreePBX AMI
        result = await initiate_ami_call(
            ami_host=ami_host,
            ami_port=ami_port,
            ami_user=ami_user,
            ami_pass=ami_pass,
            agent_extension=agent_extension,
            client_number=clean_number
        )
        
        if result["success"]:
            # Log the call initiation (without exposing phone number)
            activity = ActivityLog(
                lead_id=request.lead_id,
                user_id=current_user["id"],
                user_name=current_user.get("full_name", "Unknown"),
                action="call_initiated",
                details=f"Call initiated to lead from extension {agent_extension}"
            )
            await db.activity_logs.insert_one(activity.dict())
            
            return {"success": True, "message": "Call initiated. Your phone will ring shortly."}
        else:
            logging.error(f"AMI call failed: {result.get('error')}")
            raise HTTPException(status_code=500, detail=f"Failed to initiate call: {result.get('error')}")
            
    except Exception as e:
        logging.error(f"Click-to-call error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Call system error: {str(e)}")


async def initiate_ami_call(ami_host: str, ami_port: int, ami_user: str, ami_pass: str, 
                            agent_extension: str, client_number: str) -> dict:
    """
    Connect to FreePBX AMI and initiate an outbound call.
    The call flow: Agent's phone rings first, then connects to client.
    """
    import asyncio
    
    try:
        # Create socket connection
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(ami_host, ami_port),
            timeout=10.0
        )
        
        # Read initial banner
        banner = await asyncio.wait_for(reader.readline(), timeout=5.0)
        logging.info(f"AMI Banner: {banner.decode().strip()}")
        
        # Send Login command
        login_cmd = f"Action: Login\r\nUsername: {ami_user}\r\nSecret: {ami_pass}\r\n\r\n"
        writer.write(login_cmd.encode())
        await writer.drain()
        
        # Read login response
        login_response = ""
        while True:
            line = await asyncio.wait_for(reader.readline(), timeout=5.0)
            login_response += line.decode()
            if line == b"\r\n":
                break
        
        if "Authentication accepted" not in login_response and "Success" not in login_response:
            writer.close()
            await writer.wait_closed()
            return {"success": False, "error": "AMI authentication failed"}
        
        logging.info("AMI authentication successful")
        
        # Send Originate command to initiate the call
        # This calls the agent's phone directly, then dials client when agent answers
        originate_cmd = (
            f"Action: Originate\r\n"
            f"Channel: PJSIP/{agent_extension}\r\n"
            f"Context: from-internal\r\n"
            f"Exten: {client_number}\r\n"
            f"Priority: 1\r\n"
            f"CallerID: CRM Call <9999>\r\n"
            f"Async: true\r\n"
            f"\r\n"
        )
        
        # Log the EXACT command being sent
        print(f"========== AMI ORIGINATE COMMAND ==========")
        print(f"Agent Extension: {agent_extension}")
        print(f"Client Number: {client_number}")
        print(f"Channel: PJSIP/{agent_extension}")
        print(f"Context: from-internal")
        print(f"Exten: {client_number}")
        print(f"============================================")
        
        writer.write(originate_cmd.encode())
        await writer.drain()
        
        # Read originate response
        originate_response = ""
        while True:
            line = await asyncio.wait_for(reader.readline(), timeout=5.0)
            originate_response += line.decode()
            if line == b"\r\n":
                break
        
        logging.info(f"AMI Originate response: {originate_response}")
        
        # Send Logoff command
        logoff_cmd = "Action: Logoff\r\n\r\n"
        writer.write(logoff_cmd.encode())
        await writer.drain()
        
        # Close connection
        writer.close()
        await writer.wait_closed()
        
        if "Error" in originate_response:
            return {"success": False, "error": originate_response}
        
        return {"success": True}
        
    except asyncio.TimeoutError:
        return {"success": False, "error": "Connection to phone system timed out"}
    except ConnectionRefusedError:
        return {"success": False, "error": "Phone system connection refused"}
    except Exception as e:
        logging.error(f"AMI connection error: {str(e)}")
        return {"success": False, "error": str(e)}


# ==================== BULK IMPORT LEADS ====================

from pydantic import BaseModel as PydanticBaseModel

class BulkLeadImport(PydanticBaseModel):
    leads: List[dict]

@crm_router.post("/leads/bulk-import")
async def bulk_import_leads(data: BulkLeadImport, current_user: dict = Depends(get_current_user)):
    """Bulk import leads from CSV - admin/supervisor only"""
    if current_user.get("role") not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Only admins and supervisors can bulk import leads")
    
    imported = 0
    failed = 0
    errors = []
    
    for lead_data in data.leads:
        try:
            # Check for required fields
            if not lead_data.get("fullName") or not lead_data.get("email") or not lead_data.get("phone"):
                failed += 1
                errors.append(f"Missing required fields for: {lead_data.get('fullName', 'Unknown')}")
                continue
            
            # Check for duplicate
            existing = await db.leads.find_one({
                "$or": [
                    {"email": lead_data.get("email")},
                    {"phone": lead_data.get("phone")}
                ]
            })
            
            if existing:
                failed += 1
                errors.append(f"Duplicate: {lead_data.get('email')}")
                continue
            
            # Create lead
            lead = {
                "id": str(uuid.uuid4()),
                "fullName": lead_data.get("fullName"),
                "email": lead_data.get("email"),
                "phone": lead_data.get("phone"),
                "scammerCompany": lead_data.get("scammerCompany", "Unknown"),
                "amountLost": lead_data.get("amountLost", "Unknown"),
                "caseDetails": lead_data.get("caseDetails", "Imported from CSV"),
                "status": "New",
                "priority": "medium",
                "created_at": datetime.now(timezone.utc),
                "createdAt": datetime.now(timezone.utc),
                "assigned_to": None,
                "assigned_to_name": None,
                "team_id": current_user.get("team_id")
            }
            
            await db.leads.insert_one(lead)
            imported += 1
            
        except Exception as e:
            failed += 1
            errors.append(str(e))
    
    return {
        "success": True,
        "imported": imported,
        "failed": failed,
        "errors": errors[:10]  # Return first 10 errors only
    }
