"""
CRM API Routes - Production Secured Version
All routes require authentication via JWT
"""
from fastapi import APIRouter, HTTPException, Security, Depends
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from internal.security import get_current_user_secured, require_role_secured, SecurityManager
from internal.database import get_database
from internal.config import settings
from .crm_models import *

router = APIRouter()

# ==================== AUTHENTICATION ====================

@router.post("/auth/login")
async def crm_login(credentials: dict):
    """
    CRM user login with security hardening
    """
    email = credentials.get("email")
    password = credentials.get("password")
    
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required")
    
    # Check login rate limit
    if not SecurityManager.check_login_attempts(email):
        raise HTTPException(
            status_code=429,
            detail=f"Account locked. Try again in {settings.lockout_duration_minutes} minutes."
        )
    
    db = get_database()
    user = await db.crm_users.find_one({"email": email})
    
    if not user or not SecurityManager.verify_password(password, user.get("password", "")):
        SecurityManager.record_failed_login(email)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Reset login attempts on success
    SecurityManager.reset_login_attempts(email)
    
    # Create JWT token
    token_data = {
        "id": user["id"],
        "email": user["email"],
        "role": user["role"],
        "full_name": user.get("full_name", ""),
        "team_id": user.get("team_id")
    }
    
    token = SecurityManager.create_access_token(token_data)
    
    return {
        "token": token,
        "user": token_data
    }


@router.get("/auth/me")
async def get_current_user_info(
    current_user: dict = Security(get_current_user_secured)
):
    """Get current user information"""
    return current_user


# ==================== USERS MANAGEMENT ====================

@router.get("/users")
async def get_users(current_user: dict = Security(get_current_user_secured)):
    """Get users based on role permissions"""
    db = get_database()
    
    if current_user["role"] == "admin":
        users = await db.crm_users.find().to_list(None)
    elif current_user["role"] == "supervisor":
        users = await db.crm_users.find({"team_id": current_user.get("team_id")}).to_list(None)
    else:
        users = [current_user]
    
    # Remove password hashes from response
    for user in users:
        user.pop("password", None)
    
    return users


@router.post("/users", dependencies=[Security(require_role_secured(["admin"]))])
async def create_user(user_data: dict, current_user: dict = Security(get_current_user_secured)):
    """Create new CRM user - Admin only"""
    db = get_database()
    
    # Check if email exists
    existing = await db.crm_users.find_one({"email": user_data["email"]})
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")
    
    # Validate password strength
    if not SecurityManager.validate_password_strength(user_data["password"]):
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {settings.password_min_length} characters with uppercase, lowercase, digit, and special character"
        )
    
    # Hash password
    user_data["password"] = SecurityManager.hash_password(user_data["password"])
    user_data["id"] = str(uuid.uuid4())
    user_data["created_at"] = datetime.now(timezone.utc)
    
    await db.crm_users.insert_one(user_data)
    
    # Remove password from response
    user_data.pop("password")
    return user_data


# ==================== LEADS MANAGEMENT ====================

@router.get("/leads")
async def get_leads(current_user: dict = Security(get_current_user_secured)):
    """Get leads with role-based filtering"""
    db = get_database()
    
    query = {}
    if current_user["role"] == "supervisor":
        query["team_id"] = current_user.get("team_id")
    elif current_user["role"] == "agent":
        query["assigned_to"] = current_user["id"]
    
    leads = await db.leads.find(query).sort("createdAt", -1).to_list(500)
    
    # Apply phone masking for non-admins
    if current_user["role"] != "admin":
        for lead in leads:
            if "phone" in lead:
                phone = lead["phone"]
                if len(phone) > 4:
                    lead["phone"] = phone[:3] + "..." + phone[-4:]
    
    return leads


@router.post("/leads/create")
async def create_lead(lead_data: dict, current_user: dict = Security(get_current_user_secured)):
    """Create lead with auto-assignment"""
    db = get_database()
    
    lead = {
        "id": str(uuid.uuid4()),
        **lead_data,
        "assigned_to": current_user["id"],
        "assigned_to_name": current_user["full_name"],
        "team_id": current_user.get("team_id"),
        "status": lead_data.get("status", "New"),
        "source": "CRM - Created by user",
        "createdAt": datetime.now(timezone.utc),
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    await db.leads.insert_one(lead)
    
    return {"success": True, "lead_id": lead["id"]}


@router.put("/leads/{lead_id}")
async def update_lead(
    lead_id: str,
    lead_data: dict,
    current_user: dict = Security(get_current_user_secured)
):
    """Update lead with permission check"""
    db = get_database()
    
    # Get existing lead
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Check permissions
    if current_user["role"] == "agent" and lead.get("assigned_to") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    elif current_user["role"] == "supervisor" and lead.get("team_id") != current_user.get("team_id"):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Update lead
    lead_data["updated_at"] = datetime.now(timezone.utc)
    await db.leads.update_one({"id": lead_id}, {"$set": lead_data})
    
    return {"success": True}


# Additional routes would continue here...
# For brevity, showing key secured patterns

