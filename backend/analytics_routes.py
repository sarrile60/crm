"""
Analytics Routes - Comprehensive analytics for admin dashboard
Provides metrics on leads, agents, deposits, and team performance
"""

from fastapi import APIRouter, Depends, HTTPException, Header
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from collections import defaultdict
import jwt
import os

analytics_router = APIRouter(prefix="/analytics", tags=["Analytics"])

# Database reference
db = None
JWT_SECRET = os.environ.get("JWT_SECRET", "your-secret-key-here")

def init_analytics_routes(database):
    global db
    db = database


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


def get_date_range(period: str, date_from: Optional[str] = None, date_to: Optional[str] = None):
    """Get date range based on period or custom dates"""
    now = datetime.now(timezone.utc)
    
    if period == "custom" and date_from and date_to:
        try:
            start = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            end = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            return start, end
        except:
            pass
    
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
    elif period == "week":
        start = now - timedelta(days=7)
        end = now
    elif period == "month":
        start = now - timedelta(days=30)
        end = now
    elif period == "year":
        start = now - timedelta(days=365)
        end = now
    else:
        # Default to last 30 days
        start = now - timedelta(days=30)
        end = now
    
    return start, end


@analytics_router.get("/overview")
async def get_analytics_overview(
    period: str = "month",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get comprehensive analytics overview for admin
    Includes: leads, deposits, agents, teams metrics
    """
    role = current_user.get("role", "").lower()
    
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can access analytics")
    
    start_date, end_date = get_date_range(period, date_from, date_to)
    
    # ==================== LEADS ANALYTICS ====================
    
    # Total leads in period
    leads_query = {
        "created_at": {"$gte": start_date, "$lte": end_date}
    }
    total_leads = await db.leads.count_documents(leads_query)
    
    # Leads by status
    all_leads = await db.leads.find(leads_query, {"_id": 0, "status": 1, "created_at": 1, "source": 1, "assigned_to": 1, "team_id": 1}).to_list(10000)
    
    leads_by_status = defaultdict(int)
    for lead in all_leads:
        status = lead.get("status") or "New"
        leads_by_status[status] += 1
    
    leads_by_status_list = [{"status": k, "count": v} for k, v in sorted(leads_by_status.items(), key=lambda x: x[1], reverse=True)]
    
    # Leads by source
    leads_by_source = defaultdict(int)
    for lead in all_leads:
        source = lead.get("source") or "No Source"
        # Simplify source
        if "Website" in source or "website" in source:
            source = "Website"
        elif "CRM" in source:
            source = "CRM"
        elif "Legacy" in source:
            source = "Legacy"
        elif "Referral" in source:
            source = "Referral"
        leads_by_source[source] += 1
    
    leads_by_source_list = [{"source": k, "count": v} for k, v in sorted(leads_by_source.items(), key=lambda x: x[1], reverse=True)]
    
    # Leads over time (group by day)
    leads_over_time = defaultdict(int)
    for lead in all_leads:
        created = lead.get("created_at")
        if created:
            if isinstance(created, str):
                created = datetime.fromisoformat(created.replace('Z', '+00:00'))
            day = created.strftime("%Y-%m-%d")
            leads_over_time[day] += 1
    
    leads_over_time_list = [{"date": k, "count": v} for k, v in sorted(leads_over_time.items())]
    
    # Conversion rate (leads with deposit status / total leads)
    deposit_statuses = ['Deposit', 'Deposit 1', 'Deposit 2', 'Deposit 3', 'Deposit 4', 'Deposit 5']
    converted_leads = sum(1 for lead in all_leads if lead.get("status") in deposit_statuses)
    conversion_rate = (converted_leads / total_leads * 100) if total_leads > 0 else 0
    
    # ==================== DEPOSIT ANALYTICS ====================
    
    deposits_query = {
        "created_at": {"$gte": start_date, "$lte": end_date}
    }
    all_deposits = await db.deposits.find(deposits_query, {"_id": 0}).to_list(10000)
    
    total_deposits = len(all_deposits)
    approved_deposits = [d for d in all_deposits if d.get("status") == "approved"]
    pending_deposits = [d for d in all_deposits if d.get("status") == "pending"]
    rejected_deposits = [d for d in all_deposits if d.get("status") == "rejected"]
    
    total_revenue = sum(d.get("amount", 0) for d in approved_deposits)
    avg_deposit = total_revenue / len(approved_deposits) if approved_deposits else 0
    approval_rate = (len(approved_deposits) / total_deposits * 100) if total_deposits > 0 else 0
    
    # Deposits over time
    deposits_over_time = defaultdict(lambda: {"count": 0, "amount": 0})
    for deposit in all_deposits:
        created = deposit.get("created_at")
        if created:
            if isinstance(created, str):
                created = datetime.fromisoformat(created.replace('Z', '+00:00'))
            day = created.strftime("%Y-%m-%d")
            deposits_over_time[day]["count"] += 1
            if deposit.get("status") == "approved":
                deposits_over_time[day]["amount"] += deposit.get("amount", 0)
    
    deposits_over_time_list = [{"date": k, "count": v["count"], "amount": v["amount"]} for k, v in sorted(deposits_over_time.items())]
    
    # Deposits by payment type
    deposits_by_type = defaultdict(lambda: {"count": 0, "amount": 0})
    for deposit in approved_deposits:
        ptype = deposit.get("payment_type", "Unknown")
        deposits_by_type[ptype]["count"] += 1
        deposits_by_type[ptype]["amount"] += deposit.get("amount", 0)
    
    deposits_by_type_list = [{"type": k, "count": v["count"], "amount": v["amount"]} for k, v in deposits_by_type.items()]
    
    # ==================== AGENT PERFORMANCE ====================
    
    # Get all agents
    agents = await db.crm_users.find(
        {"role": {"$in": ["agent", "supervisor"]}, "deleted_at": None},
        {"_id": 0, "id": 1, "full_name": 1, "role": 1, "team_id": 1}
    ).to_list(500)
    
    agent_performance = []
    for agent in agents:
        agent_id = agent["id"]
        
        # Leads assigned to agent in period
        agent_leads = [l for l in all_leads if l.get("assigned_to") == agent_id]
        
        # Leads converted (deposit status)
        agent_converted = sum(1 for l in agent_leads if l.get("status") in deposit_statuses)
        
        # Deposits created by agent
        agent_deposits = [d for d in approved_deposits if d.get("agent_id") == agent_id]
        agent_revenue = sum(d.get("amount", 0) for d in agent_deposits)
        
        # Get callbacks completed (from activity logs)
        callbacks_count = await db.activity_logs.count_documents({
            "user_id": agent_id,
            "action": {"$in": ["callback_completed", "call_made", "status_changed"]},
            "timestamp": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
        })
        
        agent_performance.append({
            "agent_id": agent_id,
            "agent_name": agent.get("full_name", "Unknown"),
            "role": agent.get("role", "agent"),
            "team_id": agent.get("team_id"),
            "leads_assigned": len(agent_leads),
            "leads_converted": agent_converted,
            "conversion_rate": (agent_converted / len(agent_leads) * 100) if agent_leads else 0,
            "deposits_count": len(agent_deposits),
            "revenue": agent_revenue,
            "activities": callbacks_count
        })
    
    # Sort by revenue
    agent_performance.sort(key=lambda x: x["revenue"], reverse=True)
    
    # ==================== TEAM PERFORMANCE ====================
    
    teams = await db.teams.find(
        {"$or": [{"archived_at": None}, {"archived_at": {"$exists": False}}]},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(100)
    
    team_performance = []
    for team in teams:
        team_id = team["id"]
        
        # Team leads
        team_leads = [l for l in all_leads if l.get("team_id") == team_id]
        team_converted = sum(1 for l in team_leads if l.get("status") in deposit_statuses)
        
        # Team deposits
        team_deposits = [d for d in approved_deposits if d.get("team_id") == team_id]
        team_revenue = sum(d.get("amount", 0) for d in team_deposits)
        
        # Team members count
        team_members = await db.crm_users.count_documents({"team_id": team_id, "deleted_at": None})
        
        team_performance.append({
            "team_id": team_id,
            "team_name": team.get("name", "Unknown"),
            "members": team_members,
            "leads": len(team_leads),
            "conversions": team_converted,
            "conversion_rate": (team_converted / len(team_leads) * 100) if team_leads else 0,
            "deposits": len(team_deposits),
            "revenue": team_revenue,
            "avg_revenue_per_member": team_revenue / team_members if team_members > 0 else 0
        })
    
    # Sort by revenue
    team_performance.sort(key=lambda x: x["revenue"], reverse=True)
    
    # ==================== SUMMARY STATS ====================
    
    # Compare to previous period
    period_days = (end_date - start_date).days
    prev_start = start_date - timedelta(days=period_days)
    prev_end = start_date
    
    prev_leads = await db.leads.count_documents({
        "created_at": {"$gte": prev_start, "$lte": prev_end}
    })
    
    prev_deposits = await db.deposits.find({
        "created_at": {"$gte": prev_start, "$lte": prev_end},
        "status": "approved"
    }, {"_id": 0, "amount": 1}).to_list(10000)
    prev_revenue = sum(d.get("amount", 0) for d in prev_deposits)
    
    leads_change = ((total_leads - prev_leads) / prev_leads * 100) if prev_leads > 0 else 0
    revenue_change = ((total_revenue - prev_revenue) / prev_revenue * 100) if prev_revenue > 0 else 0
    
    return {
        "period": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "days": period_days
        },
        "summary": {
            "total_leads": total_leads,
            "leads_change": round(leads_change, 1),
            "conversion_rate": round(conversion_rate, 1),
            "total_deposits": total_deposits,
            "approved_deposits": len(approved_deposits),
            "pending_deposits": len(pending_deposits),
            "rejected_deposits": len(rejected_deposits),
            "approval_rate": round(approval_rate, 1),
            "total_revenue": total_revenue,
            "revenue_change": round(revenue_change, 1),
            "avg_deposit": round(avg_deposit, 2)
        },
        "leads": {
            "by_status": leads_by_status_list,
            "by_source": leads_by_source_list,
            "over_time": leads_over_time_list
        },
        "deposits": {
            "by_type": deposits_by_type_list,
            "over_time": deposits_over_time_list
        },
        "agents": agent_performance[:20],  # Top 20 agents
        "teams": team_performance
    }


@analytics_router.get("/realtime")
async def get_realtime_stats(current_user: dict = Depends(get_current_user)):
    """Get real-time statistics for dashboard widgets"""
    role = current_user.get("role", "").lower()
    
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can access analytics")
    
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Today's stats
    today_leads = await db.leads.count_documents({
        "created_at": {"$gte": today_start}
    })
    
    today_deposits = await db.deposits.find({
        "created_at": {"$gte": today_start}
    }, {"_id": 0, "status": 1, "amount": 1}).to_list(1000)
    
    today_revenue = sum(d.get("amount", 0) for d in today_deposits if d.get("status") == "approved")
    
    # Active users (last 5 minutes)
    active_threshold = now - timedelta(minutes=5)
    active_users = await db.crm_users.count_documents({
        "last_active": {"$gte": active_threshold},
        "deleted_at": None
    })
    
    # Pending items
    pending_deposits = await db.deposits.count_documents({"status": "pending"})
    pending_callbacks = await db.callback_reminders.count_documents({
        "is_completed": False,
        "callback_date": {"$lte": now}
    })
    
    return {
        "today": {
            "leads": today_leads,
            "deposits": len(today_deposits),
            "revenue": today_revenue
        },
        "active_users": active_users,
        "pending": {
            "deposits": pending_deposits,
            "callbacks": pending_callbacks
        },
        "timestamp": now.isoformat()
    }
