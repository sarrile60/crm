"""
Deposit Management Routes
- Supervisors create deposits and assign to agents
- Agents view their deposits and add details
- Admin approves/rejects deposits with live notifications
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header
from fastapi.responses import FileResponse
from typing import Optional, List
from datetime import datetime, timezone
from uuid import uuid4
import os
import shutil
from pydantic import BaseModel
import jwt
import mimetypes

deposit_router = APIRouter(prefix="/deposits", tags=["Deposits"])

# Ensure upload directory exists
UPLOAD_DIR = "/app/backend/uploads/deposits"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Initialize db reference (will be set from server.py)
db = None
JWT_SECRET = os.environ.get("JWT_SECRET", "your-secret-key-here")

def init_deposit_routes(database):
    global db
    db = database


async def get_current_user(authorization: Optional[str] = Header(None)):
    """Cached user auth - delegates to shared cached_auth module"""
    from cached_auth import get_current_user_cached
    return await get_current_user_cached(authorization)


# ==================== MODELS ====================

class DepositCreate(BaseModel):
    lead_id: str
    agent_id: str
    payment_type: str  # "IBAN" or "Crypto"
    amount: float
    currency: Optional[str] = "EUR"
    # For IBAN
    iban: Optional[str] = None
    bank_name: Optional[str] = None
    # For Crypto
    crypto_type: Optional[str] = None  # BTC, ETH, USDT, etc.
    wallet_address: Optional[str] = None
    notes: Optional[str] = None


class DepositUpdate(BaseModel):
    amount: Optional[float] = None
    currency: Optional[str] = None
    iban: Optional[str] = None
    bank_name: Optional[str] = None
    crypto_type: Optional[str] = None
    wallet_address: Optional[str] = None
    notes: Optional[str] = None


class DepositApproval(BaseModel):
    admin_notes: Optional[str] = None


# ==================== HELPER FUNCTIONS ====================

async def get_user_team_ids(user_id: str) -> List[str]:
    """Get all team IDs a supervisor manages"""
    teams = await db.teams.find({"supervisor_id": user_id}).to_list(100)
    return [t["id"] for t in teams]


async def get_team_member_ids(team_ids: List[str]) -> List[str]:
    """Get all user IDs in the given teams"""
    members = await db.crm_users.find({"team_id": {"$in": team_ids}}).to_list(1000)
    return [m["id"] for m in members]


async def notify_admin_new_deposit(deposit: dict, lead: dict, agent: dict):
    """Create notification for admin about new deposit"""
    # Create a deposit notification record
    notification = {
        "id": str(uuid4()),
        "type": "deposit_pending",
        "deposit_id": deposit["id"],
        "lead_name": lead.get("fullName", "Unknown"),
        "agent_name": agent.get("full_name", "Unknown"),
        "amount": deposit["amount"],
        "payment_type": deposit["payment_type"],
        "created_at": datetime.now(timezone.utc),
        "read": False
    }
    await db.deposit_notifications.insert_one(notification)


# ==================== ROUTES ====================

@deposit_router.post("")
async def create_deposit(
    deposit_data: DepositCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new deposit - Supervisor only"""
    role = current_user.get("role", "").lower()
    
    if role not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Only supervisors and admins can create deposits")
    
    # Validate lead exists
    lead = await db.leads.find_one({"id": deposit_data.lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Validate agent exists
    agent = await db.crm_users.find_one({"id": deposit_data.agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Get agent's team
    team_id = agent.get("team_id")
    
    # Validate payment details
    if deposit_data.payment_type == "IBAN":
        if not deposit_data.iban:
            raise HTTPException(status_code=400, detail="IBAN is required for bank transfers")
    elif deposit_data.payment_type == "Crypto":
        if not deposit_data.crypto_type:
            raise HTTPException(status_code=400, detail="Crypto type is required for crypto deposits")
        if not deposit_data.wallet_address:
            raise HTTPException(status_code=400, detail="Wallet address is required for crypto deposits")
    else:
        raise HTTPException(status_code=400, detail="Payment type must be 'IBAN' or 'Crypto'")
    
    # Create deposit record
    deposit = {
        "id": str(uuid4()),
        "lead_id": deposit_data.lead_id,
        "lead_name": lead.get("fullName", "Unknown"),
        "agent_id": deposit_data.agent_id,
        "agent_name": agent.get("full_name", "Unknown"),
        "team_id": team_id,
        "supervisor_id": current_user["id"],
        "supervisor_name": current_user.get("full_name", "Unknown"),
        
        # Payment details
        "payment_type": deposit_data.payment_type,
        "amount": deposit_data.amount,
        "currency": deposit_data.currency or "EUR",
        
        # IBAN details
        "iban": deposit_data.iban,
        "bank_name": deposit_data.bank_name,
        
        # Crypto details
        "crypto_type": deposit_data.crypto_type,
        "wallet_address": deposit_data.wallet_address,
        
        # Attachments (for IBAN only)
        "attachments": {
            "id_front": None,
            "id_back": None,
            "proof_of_residence": None,
            "selfie_with_id": None
        },
        
        # Status
        "status": "pending",
        
        # Notes
        "notes": deposit_data.notes,
        "admin_notes": None,
        
        # Timestamps
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
        "approved_at": None,
        "approved_by": None
    }
    
    await db.deposits.insert_one(deposit)
    
    # Notify admin
    await notify_admin_new_deposit(deposit, lead, agent)
    
    # Remove _id for response
    deposit.pop("_id", None)
    
    return {"message": "Deposit created successfully", "deposit": deposit}


@deposit_router.get("")
async def get_deposits(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get deposits based on user role"""
    role = current_user.get("role", "").lower()
    
    query = {}
    
    if role == "admin":
        # Admin sees all deposits
        pass
    elif role == "supervisor":
        # Supervisor sees deposits from their teams
        team_ids = await get_user_team_ids(current_user["id"])
        if team_ids:
            query["team_id"] = {"$in": team_ids}
        else:
            return []
    else:
        # Agent sees only their assigned deposits
        query["agent_id"] = current_user["id"]
    
    # Filter by status if provided
    if status:
        query["status"] = status
    
    deposits = await db.deposits.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    return deposits


@deposit_router.get("/pending-count")
async def get_pending_deposits_count(
    current_user: dict = Depends(get_current_user)
):
    """Get count of pending deposits - for admin notifications"""
    role = current_user.get("role", "").lower()
    
    if role != "admin":
        return {"count": 0}
    
    count = await db.deposits.count_documents({"status": "pending"})
    return {"count": count}


@deposit_router.get("/notifications")
async def get_deposit_notifications(
    current_user: dict = Depends(get_current_user)
):
    """Get unread deposit notifications - for admin bell"""
    role = current_user.get("role", "").lower()
    
    if role != "admin":
        return {"notifications": [], "unread_count": 0}
    
    notifications = await db.deposit_notifications.find(
        {"read": False},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return {
        "notifications": notifications,
        "unread_count": len(notifications)
    }


@deposit_router.put("/notifications/mark-read")
async def mark_deposit_notifications_read(
    current_user: dict = Depends(get_current_user)
):
    """Mark all deposit notifications as read"""
    role = current_user.get("role", "").lower()
    
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can manage notifications")
    
    await db.deposit_notifications.update_many(
        {"read": False},
        {"$set": {"read": True}}
    )
    
    return {"message": "Notifications marked as read"}


@deposit_router.get("/{deposit_id}")
async def get_deposit(
    deposit_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single deposit"""
    deposit = await db.deposits.find_one({"id": deposit_id}, {"_id": 0})
    
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    
    role = current_user.get("role", "").lower()
    
    # Check access
    if role == "admin":
        pass  # Admin can see all
    elif role == "supervisor":
        team_ids = await get_user_team_ids(current_user["id"])
        if deposit["team_id"] not in team_ids:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if deposit["agent_id"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
    
    return deposit


@deposit_router.put("/{deposit_id}")
async def update_deposit(
    deposit_id: str,
    update_data: DepositUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update deposit details - Agent can add details, Supervisor can edit"""
    deposit = await db.deposits.find_one({"id": deposit_id})
    
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    
    role = current_user.get("role", "").lower()
    
    # Check access
    if role == "admin":
        pass
    elif role == "supervisor":
        team_ids = await get_user_team_ids(current_user["id"])
        if deposit["team_id"] not in team_ids:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if deposit["agent_id"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Can't update approved/rejected deposits
    if deposit["status"] != "pending":
        raise HTTPException(status_code=400, detail="Cannot update non-pending deposits")
    
    # Build update
    update = {"updated_at": datetime.now(timezone.utc)}
    
    if update_data.amount is not None:
        update["amount"] = update_data.amount
    if update_data.currency is not None:
        update["currency"] = update_data.currency
    if update_data.iban is not None:
        update["iban"] = update_data.iban
    if update_data.bank_name is not None:
        update["bank_name"] = update_data.bank_name
    if update_data.crypto_type is not None:
        update["crypto_type"] = update_data.crypto_type
    if update_data.wallet_address is not None:
        update["wallet_address"] = update_data.wallet_address
    if update_data.notes is not None:
        update["notes"] = update_data.notes
    
    await db.deposits.update_one({"id": deposit_id}, {"$set": update})
    
    updated = await db.deposits.find_one({"id": deposit_id}, {"_id": 0})
    return updated


@deposit_router.post("/{deposit_id}/attachments/{attachment_type}")
async def upload_attachment(
    deposit_id: str,
    attachment_type: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload attachment for deposit - Only for IBAN deposits"""
    valid_types = ["id_front", "id_back", "proof_of_residence", "selfie_with_id"]
    
    if attachment_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid attachment type. Must be one of: {valid_types}")
    
    deposit = await db.deposits.find_one({"id": deposit_id})
    
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    
    if deposit["payment_type"] != "IBAN":
        raise HTTPException(status_code=400, detail="Attachments are only required for IBAN deposits")
    
    role = current_user.get("role", "").lower()
    
    # Check access - agent assigned or supervisor/admin
    if role not in ["admin", "supervisor"]:
        if deposit["agent_id"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Can't update approved/rejected deposits
    if deposit["status"] != "pending":
        raise HTTPException(status_code=400, detail="Cannot update non-pending deposits")
    
    # Save file
    upload_dir = f"/app/backend/uploads/deposits/{deposit_id}"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_ext = os.path.splitext(file.filename)[1]
    filename = f"{attachment_type}{file_ext}"
    file_path = os.path.join(upload_dir, filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Update deposit with attachment info
    await db.deposits.update_one(
        {"id": deposit_id},
        {
            "$set": {
                f"attachments.{attachment_type}": {
                    "filename": file.filename,
                    "path": file_path,
                    "uploaded_at": datetime.now(timezone.utc).isoformat(),
                    "uploaded_by": current_user["id"]
                },
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    return {"message": f"{attachment_type} uploaded successfully", "filename": filename}


@deposit_router.put("/{deposit_id}/approve")
async def approve_deposit(
    deposit_id: str,
    approval: DepositApproval,
    current_user: dict = Depends(get_current_user)
):
    """Approve a deposit - Admin only"""
    role = current_user.get("role", "").lower()
    
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can approve deposits")
    
    deposit = await db.deposits.find_one({"id": deposit_id})
    
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    
    if deposit["status"] != "pending":
        raise HTTPException(status_code=400, detail="Can only approve pending deposits")
    
    # Update deposit
    await db.deposits.update_one(
        {"id": deposit_id},
        {
            "$set": {
                "status": "approved",
                "admin_notes": approval.admin_notes,
                "approved_at": datetime.now(timezone.utc),
                "approved_by": current_user["id"],
                "approved_by_name": current_user.get("full_name", "Admin"),
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    # Remove notification
    await db.deposit_notifications.delete_many({"deposit_id": deposit_id})
    
    return {"message": "Deposit approved successfully"}


@deposit_router.put("/{deposit_id}/reject")
async def reject_deposit(
    deposit_id: str,
    approval: DepositApproval,
    current_user: dict = Depends(get_current_user)
):
    """Reject a deposit - Admin only"""
    role = current_user.get("role", "").lower()
    
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can reject deposits")
    
    deposit = await db.deposits.find_one({"id": deposit_id})
    
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    
    if deposit["status"] != "pending":
        raise HTTPException(status_code=400, detail="Can only reject pending deposits")
    
    # Update deposit
    await db.deposits.update_one(
        {"id": deposit_id},
        {
            "$set": {
                "status": "rejected",
                "admin_notes": approval.admin_notes,
                "approved_at": datetime.now(timezone.utc),  # Using same field for rejection time
                "approved_by": current_user["id"],
                "approved_by_name": current_user.get("full_name", "Admin"),
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    # Remove notification
    await db.deposit_notifications.delete_many({"deposit_id": deposit_id})
    
    return {"message": "Deposit rejected"}


@deposit_router.get("/{deposit_id}/attachments/{attachment_type}")
async def get_attachment(
    deposit_id: str,
    attachment_type: str,
    current_user: dict = Depends(get_current_user)
):
    """Get attachment file metadata"""
    deposit = await db.deposits.find_one({"id": deposit_id})
    
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    
    role = current_user.get("role", "").lower()
    
    # Check access
    if role == "admin":
        pass
    elif role == "supervisor":
        team_ids = await get_user_team_ids(current_user["id"])
        if deposit["team_id"] not in team_ids:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if deposit["agent_id"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
    
    attachment = deposit.get("attachments", {}).get(attachment_type)
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    return attachment


@deposit_router.get("/{deposit_id}/attachments/{attachment_type}/download")
async def download_attachment(
    deposit_id: str,
    attachment_type: str,
    current_user: dict = Depends(get_current_user)
):
    """Download attachment file as FileResponse"""
    valid_types = ["id_front", "id_back", "proof_of_residence", "selfie_with_id"]
    
    if attachment_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid attachment type")
    
    deposit = await db.deposits.find_one({"id": deposit_id})
    
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    
    role = current_user.get("role", "").lower()
    
    # Check access
    if role == "admin":
        pass
    elif role == "supervisor":
        team_ids = await get_user_team_ids(current_user["id"])
        if deposit.get("team_id") and deposit["team_id"] not in team_ids:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if deposit["agent_id"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
    
    attachment = deposit.get("attachments", {}).get(attachment_type)
    
    if not attachment or not attachment.get("path"):
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    file_path = attachment["path"]
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")
    
    # Determine media type
    media_type, _ = mimetypes.guess_type(file_path)
    if not media_type:
        media_type = "application/octet-stream"
    
    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=attachment.get("filename", f"{attachment_type}.file")
    )


# ==================== REVENUE STATISTICS ====================

@deposit_router.get("/stats/revenue")
async def get_revenue_statistics(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    team_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    payment_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get revenue statistics from APPROVED deposits only.
    Grouped by team, agent, and payment type.
    
    Filters:
    - date_from: Start date (ISO format)
    - date_to: End date (ISO format)
    - team_id: Filter by specific team
    - agent_id: Filter by specific agent
    - payment_type: Filter by IBAN or Crypto
    """
    role = current_user.get("role", "").lower()
    
    if role not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Only admins and supervisors can view revenue statistics")
    
    # Build query - only approved deposits
    query = {"status": "approved"}
    
    # Date filters
    if date_from:
        try:
            from_date = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            query["approved_at"] = {"$gte": from_date}
        except:
            pass
    
    if date_to:
        try:
            to_date = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            if "approved_at" in query:
                query["approved_at"]["$lte"] = to_date
            else:
                query["approved_at"] = {"$lte": to_date}
        except:
            pass
    
    # Team filter
    if team_id:
        query["team_id"] = team_id
    elif role == "supervisor":
        # Supervisor can only see their teams' revenue
        team_ids = await get_user_team_ids(current_user["id"])
        if team_ids:
            query["team_id"] = {"$in": team_ids}
        else:
            return {
                "total_revenue": 0,
                "total_deposits": 0,
                "by_team": [],
                "by_agent": [],
                "by_payment_type": [],
                "by_status": []
            }
    
    # Agent filter
    if agent_id:
        query["agent_id"] = agent_id
    
    # Payment type filter
    if payment_type:
        query["payment_type"] = payment_type
    
    # Get all matching deposits
    deposits = await db.deposits.find(query, {"_id": 0}).to_list(10000)
    
    # Calculate totals
    total_revenue = sum(d.get("amount", 0) for d in deposits)
    total_deposits = len(deposits)
    
    # Group by team
    team_revenue = {}
    for d in deposits:
        tid = d.get("team_id", "unknown")
        if tid not in team_revenue:
            team_revenue[tid] = {"team_id": tid, "team_name": "", "revenue": 0, "count": 0}
        team_revenue[tid]["revenue"] += d.get("amount", 0)
        team_revenue[tid]["count"] += 1
    
    # Get team names
    if team_revenue:
        team_ids_to_fetch = [tid for tid in team_revenue.keys() if tid != "unknown"]
        if team_ids_to_fetch:
            teams = await db.teams.find({"id": {"$in": team_ids_to_fetch}}, {"_id": 0}).to_list(100)
            team_names = {t["id"]: t.get("name", "Unknown Team") for t in teams}
            for tid in team_revenue:
                team_revenue[tid]["team_name"] = team_names.get(tid, "Unknown Team")
    
    by_team = sorted(team_revenue.values(), key=lambda x: x["revenue"], reverse=True)
    
    # Group by agent
    agent_revenue = {}
    for d in deposits:
        aid = d.get("agent_id", "unknown")
        if aid not in agent_revenue:
            agent_revenue[aid] = {
                "agent_id": aid, 
                "agent_name": d.get("agent_name", "Unknown"),
                "team_id": d.get("team_id"),
                "revenue": 0, 
                "count": 0
            }
        agent_revenue[aid]["revenue"] += d.get("amount", 0)
        agent_revenue[aid]["count"] += 1
    
    by_agent = sorted(agent_revenue.values(), key=lambda x: x["revenue"], reverse=True)
    
    # Group by payment type
    payment_type_revenue = {}
    for d in deposits:
        pt = d.get("payment_type", "Unknown")
        if pt not in payment_type_revenue:
            payment_type_revenue[pt] = {"payment_type": pt, "revenue": 0, "count": 0}
        payment_type_revenue[pt]["revenue"] += d.get("amount", 0)
        payment_type_revenue[pt]["count"] += 1
    
    by_payment_type = list(payment_type_revenue.values())
    
    # Get status breakdown (for context - all deposits, not just approved)
    status_query = {k: v for k, v in query.items() if k != "status"}
    all_deposits = await db.deposits.find(status_query, {"_id": 0, "status": 1, "amount": 1}).to_list(10000)
    
    status_breakdown = {}
    for d in all_deposits:
        status = d.get("status", "unknown")
        if status not in status_breakdown:
            status_breakdown[status] = {"status": status, "revenue": 0, "count": 0}
        status_breakdown[status]["revenue"] += d.get("amount", 0)
        status_breakdown[status]["count"] += 1
    
    by_status = list(status_breakdown.values())
    
    # Get available teams and agents for filters
    available_teams = []
    available_agents = []
    
    if role == "admin":
        # Admin can filter by all teams
        all_teams = await db.teams.find(
            {"$or": [{"archived_at": None}, {"archived_at": {"$exists": False}}]},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(100)
        available_teams = [{"id": t["id"], "name": t["name"]} for t in all_teams]
        
        # All agents
        all_agents = await db.crm_users.find(
            {"role": {"$in": ["agent", "supervisor"]}, "deleted_at": None},
            {"_id": 0, "id": 1, "full_name": 1, "team_id": 1}
        ).to_list(500)
        available_agents = [{"id": a["id"], "name": a["full_name"], "team_id": a.get("team_id")} for a in all_agents]
    else:
        # Supervisor sees only their teams
        team_ids = await get_user_team_ids(current_user["id"])
        if team_ids:
            sup_teams = await db.teams.find({"id": {"$in": team_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
            available_teams = [{"id": t["id"], "name": t["name"]} for t in sup_teams]
            
            # Agents in those teams
            team_agents = await db.crm_users.find(
                {"team_id": {"$in": team_ids}, "deleted_at": None},
                {"_id": 0, "id": 1, "full_name": 1, "team_id": 1}
            ).to_list(500)
            available_agents = [{"id": a["id"], "name": a["full_name"], "team_id": a.get("team_id")} for a in team_agents]
    
    return {
        "total_revenue": total_revenue,
        "total_deposits": total_deposits,
        "currency": "EUR",
        "by_team": by_team,
        "by_agent": by_agent,
        "by_payment_type": by_payment_type,
        "by_status": by_status,
        "filters": {
            "teams": available_teams,
            "agents": available_agents,
            "payment_types": ["IBAN", "Crypto"]
        }
    }
