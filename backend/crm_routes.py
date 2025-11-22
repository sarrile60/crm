from fastapi import APIRouter, HTTPException, Header, Depends
from typing import Optional, List
from datetime import datetime, timezone
import os
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

# Create router
crm_router = APIRouter(prefix="/api/crm")

# Database will be injected
db = None

def init_crm_db(database):
    global db
    db = database

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
def mask_phone_number(phone: str, user_role: str) -> str:
    """Mask phone number based on user role - only admin sees full number"""
    if user_role == "admin":
        return phone
    
    # For other roles, show only last 4 digits
    if len(phone) > 4:
        return "xxxxxxxx" + phone[-4:]
    return phone

# ==================== AUTHENTICATION ROUTES ====================

@crm_router.post("/auth/login")
async def login(credentials: UserLogin):
    """CRM user login"""
    user = await db.crm_users.find_one({"email": credentials.email})
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Account is inactive")
    
    if not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Update last login
    await db.crm_users.update_one(
        {"id": user["id"]},
        {"$set": {"last_login": datetime.now(timezone.utc)}}
    )
    
    # Create token
    token = create_access_token({
        "user_id": user["id"],
        "email": user["email"],
        "role": user["role"]
    })
    
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "team_id": user.get("team_id")
        }
    }

@crm_router.get("/auth/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Get current user information"""
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "full_name": current_user["full_name"],
        "role": current_user["role"],
        "team_id": current_user.get("team_id")
    }

# ==================== USER MANAGEMENT ROUTES ====================

@crm_router.post("/users", dependencies=[Depends(require_role(["admin"]))])
async def create_user(user_data: UserCreate, current_user: dict = Depends(get_current_user)):
    """Create new CRM user (Admin only)"""
    # Check if email already exists
    existing = await db.crm_users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    hashed_pw = hash_password(user_data.password)
    user = User(
        email=user_data.email,
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
async def get_users(current_user: dict = Depends(require_role(["admin", "manager", "supervisor"]))):
    """Get all users"""
    users = await db.crm_users.find({}, {"password": 0, "_id": 0}).to_list(1000)
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
    
    # If email is being updated, check it doesn't exist
    if "email" in update_dict:
        existing = await db.crm_users.find_one({"email": update_dict["email"], "id": {"$ne": user_id}})
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use by another user")
    
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
    """Delete user (Admin only)"""
    result = await db.crm_users.delete_one({"id": user_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"success": True}

# ==================== TEAM MANAGEMENT ROUTES ====================

@crm_router.post("/teams", dependencies=[Depends(require_role(["admin", "manager"]))])
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
    """Get leads with filters"""
    query = {}
    
    # Apply filters based on user role
    if current_user["role"] == "agent":
        query["assigned_to"] = current_user["id"]
    elif current_user["role"] in ["supervisor", "manager"] and current_user.get("team_id"):
        query["team_id"] = current_user.get("team_id")
    
    # Apply additional filters
    if status:
        query["status"] = status
    if assigned_to and current_user["role"] in ["admin", "manager", "supervisor"]:
        query["assigned_to"] = assigned_to
    if team_id and current_user["role"] in ["admin", "manager"]:
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
    
    # Mask phone numbers based on user role
    for lead in leads:
        if "phone" in lead:
            lead["phone"] = mask_phone_number(lead["phone"], current_user["role"])
    
    return leads

@crm_router.get("/leads/{lead_id}")
async def get_lead_detail(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get lead details"""
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Check permissions
    if current_user["role"] == "agent" and lead.get("assigned_to") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Mask phone number based on user role
    if "phone" in lead:
        lead["phone"] = mask_phone_number(lead["phone"], current_user["role"])
    
    return lead

@crm_router.put("/leads/{lead_id}")
async def update_lead(lead_id: str, update_data: LeadUpdate, current_user: dict = Depends(get_current_user)):
    """Update lead"""
    lead = await db.leads.find_one({"id": lead_id})
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Check permissions
    if current_user["role"] == "agent" and lead.get("assigned_to") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
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

@crm_router.post("/leads/{lead_id}/assign")
async def assign_lead(assignment: LeadAssignment, current_user: dict = Depends(require_role(["admin", "manager", "supervisor"]))):
    """Assign lead to agent"""
    # Verify agent exists
    agent = await db.crm_users.find_one({"id": assignment.assigned_to})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Update lead
    result = await db.leads.update_one(
        {"id": assignment.lead_id},
        {"$set": {
            "assigned_to": assignment.assigned_to,
            "assigned_by": assignment.assigned_by,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    
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

@crm_router.post("/leads/mass-update", dependencies=[Depends(require_role(["admin", "manager", "supervisor"]))])
async def mass_update_leads(update_data: MassUpdateData, current_user: dict = Depends(get_current_user)):
    """Mass update multiple leads"""
    if not update_data.lead_ids:
        raise HTTPException(status_code=400, detail="No leads selected")
    
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

# ==================== DASHBOARD STATS ====================

@crm_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """Get dashboard statistics"""
    query = {}
    
    if current_user["role"] == "agent":
        query["assigned_to"] = current_user["id"]
    elif current_user["role"] == "supervisor":
        query["team_id"] = current_user.get("team_id")
    
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
