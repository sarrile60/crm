"""
Finance Routes - Commission calculation, salary management, and expense tracking
"""

from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File, Form
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from collections import defaultdict
import jwt
import os
import uuid
import shutil

finance_router = APIRouter(prefix="/finance", tags=["Finance"])

# Database reference
db = None
JWT_SECRET = os.environ.get("JWT_SECRET", "your-secret-key-here")

# Default Commission Tiers (used if database is empty)
DEFAULT_AGENT_COMMISSION_TIERS = [
    {"min_amount": 0, "max_amount": 19999, "rate": 10},
    {"min_amount": 20000, "max_amount": 29999, "rate": 14},
    {"min_amount": 30000, "max_amount": 49999, "rate": 15},
    {"min_amount": 50000, "max_amount": 74999, "rate": 16},
    {"min_amount": 75000, "max_amount": 99999, "rate": 17},
    {"min_amount": 100000, "max_amount": 149999, "rate": 18},
    {"min_amount": 150000, "max_amount": 249999, "rate": 19},
    {"min_amount": 250000, "max_amount": 499999, "rate": 20},
    {"min_amount": 500000, "max_amount": 749999, "rate": 22},
    {"min_amount": 750000, "max_amount": 999999, "rate": 25},
    {"min_amount": 1000000, "max_amount": None, "rate": 30},
]

DEFAULT_SUPERVISOR_COMMISSION_TIERS = [
    {"min_amount": 0, "max_amount": 29999, "rate": 1},
    {"min_amount": 30000, "max_amount": 49999, "rate": 2},
    {"min_amount": 50000, "max_amount": 79999, "rate": 3},
    {"min_amount": 80000, "max_amount": 119999, "rate": 4},
    {"min_amount": 120000, "max_amount": 159999, "rate": 5},
    {"min_amount": 160000, "max_amount": 199999, "rate": 6},
    {"min_amount": 200000, "max_amount": None, "rate": 7},
]

# Default Base Salaries
DEFAULT_AGENT_BASE_SALARY = 600
DEFAULT_SUPERVISOR_BASE_SALARY = 1200


def init_finance_routes(database):
    global db
    db = database


async def get_commission_settings():
    """Get commission settings from database, or create defaults if not exist"""
    settings = await db.commission_settings.find_one({"type": "commission_config"}, {"_id": 0})
    
    if not settings:
        # Create default settings
        settings = {
            "id": str(uuid.uuid4()),
            "type": "commission_config",
            "agent_tiers": DEFAULT_AGENT_COMMISSION_TIERS,
            "supervisor_tiers": DEFAULT_SUPERVISOR_COMMISSION_TIERS,
            "agent_base_salary": DEFAULT_AGENT_BASE_SALARY,
            "supervisor_base_salary": DEFAULT_SUPERVISOR_BASE_SALARY,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        await db.commission_settings.insert_one(settings)
        del settings["_id"] if "_id" in settings else None
    
    return settings


async def get_agent_commission_tiers():
    """Get agent commission tiers from database"""
    settings = await get_commission_settings()
    tiers = settings.get("agent_tiers", DEFAULT_AGENT_COMMISSION_TIERS)
    # Convert to tuple format for calculation
    return [(t["min_amount"], t["max_amount"] if t["max_amount"] else float('inf'), t["rate"] / 100) for t in tiers]


async def get_supervisor_commission_tiers():
    """Get supervisor commission tiers from database"""
    settings = await get_commission_settings()
    tiers = settings.get("supervisor_tiers", DEFAULT_SUPERVISOR_COMMISSION_TIERS)
    # Convert to tuple format for calculation
    return [(t["min_amount"], t["max_amount"] if t["max_amount"] else float('inf'), t["rate"] / 100) for t in tiers]


async def get_base_salaries():
    """Get base salaries from database"""
    settings = await get_commission_settings()
    return {
        "agent": settings.get("agent_base_salary", DEFAULT_AGENT_BASE_SALARY),
        "supervisor": settings.get("supervisor_base_salary", DEFAULT_SUPERVISOR_BASE_SALARY)
    }


async def get_current_user(authorization: Optional[str] = Header(None)):
    """Get current user from JWT token"""
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization header")
    
    try:
        token = authorization.replace("Bearer ", "")
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("user_id")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await db.crm_users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


async def get_commission_rate_async(total_volume: float, role: str) -> tuple:
    """Get commission rate based on volume and role (fetches from database)"""
    if role == "agent":
        tiers = await get_agent_commission_tiers()
    else:
        tiers = await get_supervisor_commission_tiers()
    
    for min_vol, max_vol, rate in tiers:
        if min_vol <= total_volume <= max_vol:
            return rate, f"{int(rate * 100)}%"
    
    # Return highest tier if above all
    return tiers[-1][2], f"{int(tiers[-1][2] * 100)}%"


def get_month_date_range(year: int = None, month: int = None):
    """Get start and end date for a specific month"""
    now = datetime.now()
    if year is None:
        year = now.year
    if month is None:
        month = now.month
    
    start_date = datetime(year, month, 1)
    
    # Get end of month
    if month == 12:
        end_date = datetime(year + 1, 1, 1) - timedelta(seconds=1)
    else:
        end_date = datetime(year, month + 1, 1) - timedelta(seconds=1)
    
    return start_date, end_date


async def get_user_team_ids(user_id: str) -> list:
    """Get team IDs for a supervisor"""
    teams = await db.teams.find(
        {"supervisor_id": user_id, "$or": [{"archived_at": None}, {"archived_at": {"$exists": False}}]},
        {"_id": 0, "id": 1}
    ).to_list(100)
    return [t["id"] for t in teams]


# ==================== AGENT FINANCIAL DASHBOARD ====================

@finance_router.get("/agent/dashboard")
async def get_agent_financial_dashboard(
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get agent's personal financial dashboard
    Shows: Base salary, commissions, total earnings, deposit history
    """
    role = current_user.get("role", "").lower()
    user_id = current_user["id"]
    
    if role not in ["agent", "admin"]:
        raise HTTPException(status_code=403, detail="Only agents can access this dashboard")
    
    start_date, end_date = get_month_date_range(year, month)
    
    # Get agent's personal approved deposits for the month
    approved_deposits = await db.deposits.find({
        "agent_id": user_id,
        "status": "approved",
        "approved_at": {"$gte": start_date, "$lte": end_date}
    }, {"_id": 0}).to_list(1000)
    
    # Get pending deposits
    pending_deposits = await db.deposits.find({
        "agent_id": user_id,
        "status": "pending"
    }, {"_id": 0}).to_list(1000)
    
    # Calculate totals
    total_approved_volume = sum(d.get("amount", 0) for d in approved_deposits)
    total_pending_volume = sum(d.get("amount", 0) for d in pending_deposits)
    
    # Get commission rate based on approved volume
    commission_rate, rate_label = get_commission_rate(total_approved_volume, "agent")
    
    # Calculate commissions
    commission_earned = total_approved_volume * commission_rate
    pending_commission = total_pending_volume * commission_rate  # Estimated
    
    # Total earnings
    base_salary = AGENT_BASE_SALARY
    total_earnings = base_salary + commission_earned
    
    # Get all deposits for history (approved, pending, rejected)
    all_deposits = await db.deposits.find({
        "agent_id": user_id,
        "created_at": {"$gte": start_date, "$lte": end_date}
    }, {"_id": 0}).to_list(1000)
    
    # Format deposit history
    deposit_history = []
    for dep in all_deposits:
        dep_commission = dep.get("amount", 0) * commission_rate if dep.get("status") == "approved" else 0
        deposit_history.append({
            "id": dep.get("id"),
            "date": dep.get("created_at"),
            "client_name": dep.get("lead_name", "Unknown"),
            "amount": dep.get("amount", 0),
            "status": dep.get("status", "pending"),
            "commission_earned": dep_commission if dep.get("status") == "approved" else None,
            "pending_commission": dep.get("amount", 0) * commission_rate if dep.get("status") == "pending" else None
        })
    
    # Sort by date descending
    deposit_history.sort(key=lambda x: x["date"] if x["date"] else "", reverse=True)
    
    # Get next tier info
    next_tier_info = None
    for i, (min_vol, max_vol, rate) in enumerate(AGENT_COMMISSION_TIERS):
        if min_vol <= total_approved_volume <= max_vol:
            if i < len(AGENT_COMMISSION_TIERS) - 1:
                next_min, next_max, next_rate = AGENT_COMMISSION_TIERS[i + 1]
                next_tier_info = {
                    "current_tier": f"{int(rate * 100)}%",
                    "next_tier": f"{int(next_rate * 100)}%",
                    "amount_needed": next_min - total_approved_volume,
                    "next_tier_threshold": next_min
                }
            break
    
    return {
        "period": {
            "month": start_date.month,
            "year": start_date.year,
            "month_name": start_date.strftime("%B %Y")
        },
        "summary": {
            "base_salary": base_salary,
            "commission_rate": rate_label,
            "commission_earned": round(commission_earned, 2),
            "total_earnings": round(total_earnings, 2),
            "pending_deposits_amount": round(total_pending_volume, 2),
            "pending_commission": round(pending_commission, 2),
            "approved_deposits_count": len(approved_deposits),
            "pending_deposits_count": len(pending_deposits),
            "total_approved_volume": round(total_approved_volume, 2)
        },
        "next_tier": next_tier_info,
        "deposit_history": deposit_history,
        "commission_tiers": [
            {"range": "€0 - €19,999", "rate": "10%"},
            {"range": "€20,000 - €29,999", "rate": "14%"},
            {"range": "€30,000 - €49,999", "rate": "15%"},
            {"range": "€50,000 - €74,999", "rate": "16%"},
            {"range": "€75,000 - €99,999", "rate": "17%"},
            {"range": "€100,000 - €149,999", "rate": "18%"},
            {"range": "€150,000 - €249,999", "rate": "19%"},
            {"range": "€250,000 - €499,999", "rate": "20%"},
            {"range": "€500,000 - €749,999", "rate": "22%"},
            {"range": "€750,000 - €999,999", "rate": "25%"},
            {"range": "€1,000,000+", "rate": "30%"}
        ]
    }


# ==================== SUPERVISOR FINANCIAL DASHBOARD ====================

@finance_router.get("/supervisor/dashboard")
async def get_supervisor_financial_dashboard(
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get supervisor's financial dashboard
    Commission based on WHOLE TEAM's deposits
    """
    role = current_user.get("role", "").lower()
    user_id = current_user["id"]
    
    if role not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Only supervisors can access this dashboard")
    
    start_date, end_date = get_month_date_range(year, month)
    
    # Get supervisor's team IDs
    team_ids = await get_user_team_ids(user_id)
    
    if not team_ids:
        return {
            "period": {
                "month": start_date.month,
                "year": start_date.year,
                "month_name": start_date.strftime("%B %Y")
            },
            "summary": {
                "base_salary": SUPERVISOR_BASE_SALARY,
                "commission_rate": "1%",
                "commission_earned": 0,
                "total_earnings": SUPERVISOR_BASE_SALARY,
                "team_approved_volume": 0,
                "team_pending_volume": 0,
                "pending_commission": 0
            },
            "team_deposits": [],
            "agents_performance": []
        }
    
    # Get all approved deposits from the team for the month
    approved_deposits = await db.deposits.find({
        "team_id": {"$in": team_ids},
        "status": "approved",
        "approved_at": {"$gte": start_date, "$lte": end_date}
    }, {"_id": 0}).to_list(1000)
    
    # Get pending deposits
    pending_deposits = await db.deposits.find({
        "team_id": {"$in": team_ids},
        "status": "pending"
    }, {"_id": 0}).to_list(1000)
    
    # Calculate team totals
    team_approved_volume = sum(d.get("amount", 0) for d in approved_deposits)
    team_pending_volume = sum(d.get("amount", 0) for d in pending_deposits)
    
    # Get commission rate based on TEAM volume
    commission_rate, rate_label = get_commission_rate(team_approved_volume, "supervisor")
    
    # Calculate supervisor's commission
    commission_earned = team_approved_volume * commission_rate
    pending_commission = team_pending_volume * commission_rate
    
    # Total earnings
    base_salary = SUPERVISOR_BASE_SALARY
    total_earnings = base_salary + commission_earned
    
    # Get all team deposits for the month
    all_team_deposits = await db.deposits.find({
        "team_id": {"$in": team_ids},
        "created_at": {"$gte": start_date, "$lte": end_date}
    }, {"_id": 0}).to_list(1000)
    
    # Format team deposits table
    team_deposits = []
    for dep in all_team_deposits:
        team_deposits.append({
            "id": dep.get("id"),
            "agent_name": dep.get("agent_name", "Unknown"),
            "agent_id": dep.get("agent_id"),
            "date": dep.get("created_at"),
            "client_name": dep.get("lead_name", "Unknown"),
            "amount": dep.get("amount", 0),
            "status": dep.get("status", "pending"),
            "payment_type": dep.get("payment_type", "Unknown")
        })
    
    # Sort by date descending
    team_deposits.sort(key=lambda x: x["date"] if x["date"] else "", reverse=True)
    
    # Calculate each agent's performance
    agent_volumes = defaultdict(lambda: {"approved": 0, "pending": 0, "rejected": 0, "name": ""})
    for dep in all_team_deposits:
        agent_id = dep.get("agent_id", "unknown")
        agent_volumes[agent_id]["name"] = dep.get("agent_name", "Unknown")
        status = dep.get("status", "pending")
        agent_volumes[agent_id][status] += dep.get("amount", 0)
    
    agents_performance = [
        {
            "agent_id": aid,
            "agent_name": data["name"],
            "approved_volume": round(data["approved"], 2),
            "pending_volume": round(data["pending"], 2),
            "rejected_volume": round(data["rejected"], 2),
            "total_volume": round(data["approved"] + data["pending"], 2)
        }
        for aid, data in agent_volumes.items()
    ]
    agents_performance.sort(key=lambda x: x["approved_volume"], reverse=True)
    
    # Next tier info
    next_tier_info = None
    for i, (min_vol, max_vol, rate) in enumerate(SUPERVISOR_COMMISSION_TIERS):
        if min_vol <= team_approved_volume <= max_vol:
            if i < len(SUPERVISOR_COMMISSION_TIERS) - 1:
                next_min, next_max, next_rate = SUPERVISOR_COMMISSION_TIERS[i + 1]
                next_tier_info = {
                    "current_tier": f"{int(rate * 100)}%",
                    "next_tier": f"{int(next_rate * 100)}%",
                    "amount_needed": next_min - team_approved_volume,
                    "next_tier_threshold": next_min
                }
            break
    
    return {
        "period": {
            "month": start_date.month,
            "year": start_date.year,
            "month_name": start_date.strftime("%B %Y")
        },
        "summary": {
            "base_salary": base_salary,
            "commission_rate": rate_label,
            "commission_earned": round(commission_earned, 2),
            "total_earnings": round(total_earnings, 2),
            "team_approved_volume": round(team_approved_volume, 2),
            "team_pending_volume": round(team_pending_volume, 2),
            "pending_commission": round(pending_commission, 2),
            "approved_deposits_count": len(approved_deposits),
            "pending_deposits_count": len(pending_deposits)
        },
        "next_tier": next_tier_info,
        "team_deposits": team_deposits,
        "agents_performance": agents_performance,
        "commission_tiers": [
            {"range": "€0 - €29,999", "rate": "1%"},
            {"range": "€30,000 - €49,999", "rate": "2%"},
            {"range": "€50,000 - €79,999", "rate": "3%"},
            {"range": "€80,000 - €119,999", "rate": "4%"},
            {"range": "€120,000 - €159,999", "rate": "5%"},
            {"range": "€160,000 - €199,999", "rate": "6%"},
            {"range": "€200,000+", "rate": "7%"}
        ]
    }


# ==================== EXPENSE MANAGEMENT (ADMIN ONLY) ====================

EXPENSE_TYPES = ["Rent", "Utilities", "Equipment", "Supplies", "Marketing", "Salaries", "Other"]

@finance_router.post("/expenses")
async def create_expense(
    expense_type: str = Form(...),
    amount: float = Form(...),
    currency: str = Form("EUR"),
    date: str = Form(...),
    description: str = Form(""),
    paid_by: str = Form(""),
    receipt: Optional[UploadFile] = File(None),
    current_user: dict = Depends(get_current_user)
):
    """Create a new expense (Admin only)"""
    role = current_user.get("role", "").lower()
    
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can add expenses")
    
    if expense_type not in EXPENSE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid expense type. Must be one of: {EXPENSE_TYPES}")
    
    expense_id = str(uuid.uuid4())
    
    # Handle receipt upload
    receipt_path = None
    if receipt:
        upload_dir = "/app/backend/uploads/expenses"
        os.makedirs(upload_dir, exist_ok=True)
        file_ext = os.path.splitext(receipt.filename)[1]
        receipt_filename = f"{expense_id}{file_ext}"
        receipt_path = os.path.join(upload_dir, receipt_filename)
        
        with open(receipt_path, "wb") as f:
            shutil.copyfileobj(receipt.file, f)
    
    expense = {
        "id": expense_id,
        "type": expense_type,
        "amount": amount,
        "currency": currency,
        "date": date,
        "description": description,
        "paid_by": paid_by,
        "receipt_path": receipt_path,
        "created_by": current_user["id"],
        "created_at": datetime.now(),
        "visible_to_admin_only": True
    }
    
    await db.expenses.insert_one(expense)
    
    return {"message": "Expense created successfully", "expense_id": expense_id}


@finance_router.get("/expenses")
async def get_expenses(
    month: Optional[int] = None,
    year: Optional[int] = None,
    expense_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all expenses (Admin only)"""
    role = current_user.get("role", "").lower()
    
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can view expenses")
    
    start_date, end_date = get_month_date_range(year, month)
    
    query = {
        "date": {"$gte": start_date.strftime("%Y-%m-%d"), "$lte": end_date.strftime("%Y-%m-%d")}
    }
    
    if expense_type:
        query["type"] = expense_type
    
    expenses = await db.expenses.find(query, {"_id": 0}).to_list(1000)
    
    # Calculate totals
    total_amount = sum(e.get("amount", 0) for e in expenses)
    
    # Group by type
    by_type = defaultdict(float)
    for e in expenses:
        by_type[e.get("type", "Other")] += e.get("amount", 0)
    
    expenses_by_type = [{"type": k, "amount": round(v, 2)} for k, v in by_type.items()]
    
    return {
        "period": {
            "month": start_date.month,
            "year": start_date.year,
            "month_name": start_date.strftime("%B %Y")
        },
        "total_expenses": round(total_amount, 2),
        "expenses_by_type": expenses_by_type,
        "expense_types": EXPENSE_TYPES,
        "expenses": expenses
    }


@finance_router.delete("/expenses/{expense_id}")
async def delete_expense(
    expense_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an expense (Admin only)"""
    role = current_user.get("role", "").lower()
    
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete expenses")
    
    result = await db.expenses.delete_one({"id": expense_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    return {"message": "Expense deleted successfully"}


# ==================== ADMIN FINANCIAL OVERVIEW ====================

@finance_router.get("/admin/overview")
async def get_admin_financial_overview(
    month: Optional[int] = None,
    year: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    team_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get complete financial overview for admin
    Shows: Total deposits, commissions, salaries, expenses, profit/loss
    Supports filtering by team and/or agent
    Supports date_from/date_to OR month/year
    """
    role = current_user.get("role", "").lower()
    
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can access financial overview")
    
    # Use date range if provided, otherwise use month/year
    if date_from and date_to:
        try:
            start_date = datetime.fromisoformat(date_from.replace('Z', ''))
            end_date = datetime.fromisoformat(date_to.replace('Z', ''))
        except:
            start_date, end_date = get_month_date_range(year, month)
    else:
        start_date, end_date = get_month_date_range(year, month)
    
    # Build deposit query with optional filters
    deposit_query = {
        "created_at": {"$gte": start_date, "$lte": end_date}
    }
    
    # If filtering by agent
    if agent_id:
        deposit_query["created_by"] = agent_id
    
    # If filtering by team (get all agents in that team)
    if team_id and not agent_id:
        team = await db.teams.find_one({"id": team_id}, {"_id": 0})
        if team:
            team_member_ids = team.get("members", [])
            deposit_query["created_by"] = {"$in": team_member_ids}
    
    # Get all deposits for the period with filters
    all_deposits = await db.deposits.find(deposit_query, {"_id": 0}).to_list(10000)
    
    approved_deposits = [d for d in all_deposits if d.get("status") == "approved"]
    pending_deposits = [d for d in all_deposits if d.get("status") == "pending"]
    rejected_deposits = [d for d in all_deposits if d.get("status") == "rejected"]
    
    total_approved = sum(d.get("amount", 0) for d in approved_deposits)
    total_pending = sum(d.get("amount", 0) for d in pending_deposits)
    total_rejected = sum(d.get("amount", 0) for d in rejected_deposits)
    
    # Count active agents and supervisors
    agents = await db.crm_users.count_documents({"role": "agent", "deleted_at": None})
    supervisors = await db.crm_users.count_documents({"role": "supervisor", "deleted_at": None})
    
    # Calculate total salaries
    total_agent_salaries = agents * AGENT_BASE_SALARY
    total_supervisor_salaries = supervisors * SUPERVISOR_BASE_SALARY
    total_salaries = total_agent_salaries + total_supervisor_salaries
    
    # Calculate total commissions paid
    # For agents: sum of each agent's commission based on their personal volume
    agent_list = await db.crm_users.find({"role": "agent", "deleted_at": None}, {"_id": 0, "id": 1}).to_list(500)
    total_agent_commissions = 0
    
    for agent in agent_list:
        agent_deposits = [d for d in approved_deposits if d.get("agent_id") == agent["id"]]
        agent_volume = sum(d.get("amount", 0) for d in agent_deposits)
        rate, _ = get_commission_rate(agent_volume, "agent")
        total_agent_commissions += agent_volume * rate
    
    # For supervisors: sum of each supervisor's commission based on team volume
    supervisor_list = await db.crm_users.find({"role": "supervisor", "deleted_at": None}, {"_id": 0, "id": 1}).to_list(100)
    total_supervisor_commissions = 0
    
    for supervisor in supervisor_list:
        team_ids = await get_user_team_ids(supervisor["id"])
        team_deposits = [d for d in approved_deposits if d.get("team_id") in team_ids]
        team_volume = sum(d.get("amount", 0) for d in team_deposits)
        rate, _ = get_commission_rate(team_volume, "supervisor")
        total_supervisor_commissions += team_volume * rate
    
    total_commissions = total_agent_commissions + total_supervisor_commissions
    
    # Get expenses for the month
    expenses = await db.expenses.find({
        "date": {"$gte": start_date.strftime("%Y-%m-%d"), "$lte": end_date.strftime("%Y-%m-%d")}
    }, {"_id": 0}).to_list(1000)
    
    total_expenses = sum(e.get("amount", 0) for e in expenses)
    
    # Expenses by type
    expenses_by_type = defaultdict(float)
    for e in expenses:
        expenses_by_type[e.get("type", "Other")] += e.get("amount", 0)
    
    # Calculate profit/loss
    # Revenue = Total approved deposits (this is what the company receives)
    # Costs = Salaries + Commissions + Expenses
    total_costs = total_salaries + total_commissions + total_expenses
    net_profit = total_approved - total_costs
    
    return {
        "period": {
            "month": start_date.month,
            "year": start_date.year,
            "month_name": start_date.strftime("%B %Y")
        },
        "deposits": {
            "total_approved": round(total_approved, 2),
            "total_pending": round(total_pending, 2),
            "total_rejected": round(total_rejected, 2),
            "approved_count": len(approved_deposits),
            "pending_count": len(pending_deposits),
            "rejected_count": len(rejected_deposits)
        },
        "staff": {
            "agents_count": agents,
            "supervisors_count": supervisors,
            "total_staff": agents + supervisors
        },
        "salaries": {
            "agent_salaries": round(total_agent_salaries, 2),
            "supervisor_salaries": round(total_supervisor_salaries, 2),
            "total_salaries": round(total_salaries, 2)
        },
        "commissions": {
            "agent_commissions": round(total_agent_commissions, 2),
            "supervisor_commissions": round(total_supervisor_commissions, 2),
            "total_commissions": round(total_commissions, 2)
        },
        "expenses": {
            "total_expenses": round(total_expenses, 2),
            "by_type": [{"type": k, "amount": round(v, 2)} for k, v in expenses_by_type.items()]
        },
        "profit_loss": {
            "total_revenue": round(total_approved, 2),
            "total_costs": round(total_costs, 2),
            "net_profit": round(net_profit, 2),
            "profit_margin": round((net_profit / total_approved * 100) if total_approved > 0 else 0, 1)
        }
    }
