"""
Public API Routes - Landing Page
No authentication required
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone
import uuid
from internal.database import get_database

router = APIRouter()

class LeadSubmission(BaseModel):
    fullName: str
    email: EmailStr
    phone: str
    scammerCompany: str
    amountLost: str
    caseDetails: str

@router.post("/leads/submit")
async def submit_lead(lead: LeadSubmission):
    """
    Public lead submission from landing page
    Rate limited by middleware
    """
    try:
        db = get_database()
        
        lead_data = {
            "id": str(uuid.uuid4()),
            **lead.dict(),
            "status": "New",
            "source": "Landing Page",
            "priority": "medium",
            "createdAt": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        
        await db.leads.insert_one(lead_data)
        
        return {
            "success": True,
            "message": "Richiesta inviata con successo. Ti contatteremo presto."
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail="Errore nell'invio")

@router.post("/analytics/pageview")
async def track_pageview(data: dict):
    """Track pageview analytics"""
    # Implement analytics tracking
    return {"success": True}
