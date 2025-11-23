"""
Admin API Routes
Requires admin authentication
"""
from fastapi import APIRouter, Security, HTTPException
from internal.security import get_current_user_secured, require_role_secured, SecurityManager
from internal.config import settings
from internal.database import get_database
from pydantic import BaseModel

router = APIRouter()

class AdminLogin(BaseModel):
    username: str
    password: str

@router.post("/login")
async def admin_login(credentials: AdminLogin):
    """
    Admin login with hardened security
    """
    # Check rate limit
    if not SecurityManager.check_login_attempts(credentials.username):
        raise HTTPException(
            status_code=429,
            detail="Account temporarily locked due to multiple failed attempts"
        )
    
    # Verify credentials from environment
    if (
        credentials.username != settings.admin_username or
        credentials.password != settings.admin_password
    ):
        SecurityManager.record_failed_login(credentials.username)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Reset login attempts on success
    SecurityManager.reset_login_attempts(credentials.username)
    
    # Create token
    token_data = {
        "id": "admin",
        "email": settings.admin_username,
        "role": "admin",
        "full_name": "System Administrator"
    }
    
    token = SecurityManager.create_access_token(token_data)
    
    return {
        "token": token,
        "user": token_data
    }

@router.get("/analytics")
async def get_analytics(
    current_user: dict = Security(require_role_secured(["admin"]))
):
    """Get analytics data - admin only"""
    db = get_database()
    
    total_leads = await db.leads.count_documents({})
    
    return {
        "totalLeads": total_leads,
        "totalUsers": await db.crm_users.count_documents({}),
        "totalTeams": await db.teams.count_documents({})
    }

@router.get("/leads")
async def get_admin_leads(
    current_user: dict = Security(require_role_secured(["admin"]))
):
    """Get all leads - admin only"""
    db = get_database()
    
    leads = await db.leads.find().sort("createdAt", -1).limit(100).to_list(100)
    
    return leads
