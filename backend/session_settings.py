"""
Session Settings Management
Stores session configuration in database for GUI-based management
"""

from datetime import datetime, time
from zoneinfo import ZoneInfo
from typing import Optional

# Berlin timezone
BERLIN_TZ = ZoneInfo("Europe/Berlin")

# Database reference - set from server.py
db = None

# Default settings (used if no settings in database)
DEFAULT_SETTINGS = {
    "session_start_hour": 8,
    "session_start_minute": 0,
    "session_end_hour": 18,
    "session_end_minute": 30,
    "work_days": [0, 1, 2, 3, 4],  # Monday=0 to Friday=4
    "timezone": "Europe/Berlin",
    "require_approval_after_hours": True,
    "approval_duration_minutes": 30  # How long an approved login is valid
}


def init_session_settings_db(database):
    """Initialize database connection"""
    global db
    db = database


async def get_session_settings() -> dict:
    """Get session settings from database or return defaults"""
    if db is None:
        return DEFAULT_SETTINGS
    
    settings = await db.system_settings.find_one({"type": "session_config"}, {"_id": 0})
    
    if not settings:
        # Initialize with defaults
        settings = {**DEFAULT_SETTINGS, "type": "session_config"}
        await db.system_settings.insert_one(settings)
        return DEFAULT_SETTINGS
    
    return settings


async def update_session_settings(
    session_start_hour: int,
    session_start_minute: int,
    session_end_hour: int,
    session_end_minute: int,
    work_days: list,
    require_approval_after_hours: bool
) -> dict:
    """Update session settings in database"""
    settings = {
        "type": "session_config",
        "session_start_hour": session_start_hour,
        "session_start_minute": session_start_minute,
        "session_end_hour": session_end_hour,
        "session_end_minute": session_end_minute,
        "work_days": work_days,
        "timezone": "Europe/Berlin",
        "require_approval_after_hours": require_approval_after_hours,
        "updated_at": datetime.now(BERLIN_TZ)
    }
    
    await db.system_settings.update_one(
        {"type": "session_config"},
        {"$set": settings},
        upsert=True
    )
    
    return settings


async def is_within_work_hours(settings: Optional[dict] = None) -> tuple:
    """
    Check if current time is within work hours.
    Returns (is_work_hours: bool, reason: str)
    """
    if settings is None:
        settings = await get_session_settings()
    
    berlin_now = datetime.now(BERLIN_TZ)
    
    # Check if it's a work day
    if berlin_now.weekday() not in settings.get("work_days", [0, 1, 2, 3, 4]):
        day_name = berlin_now.strftime("%A")
        return False, f"Non è un giorno lavorativo ({day_name})"
    
    # Check if within work hours
    start_time = time(
        settings.get("session_start_hour", 8),
        settings.get("session_start_minute", 0)
    )
    end_time = time(
        settings.get("session_end_hour", 18),
        settings.get("session_end_minute", 30)
    )
    
    current_time = berlin_now.time()
    
    if current_time < start_time:
        return False, f"Prima dell'orario di lavoro (inizio: {start_time.strftime('%H:%M')})"
    
    if current_time >= end_time:
        return False, f"Dopo l'orario di lavoro (fine: {end_time.strftime('%H:%M')})"
    
    return True, "Entro l'orario di lavoro"


async def get_session_expiry_from_settings() -> datetime:
    """Calculate session expiry based on database settings"""
    settings = await get_session_settings()
    berlin_now = datetime.now(BERLIN_TZ)
    
    end_hour = settings.get("session_end_hour", 18)
    end_minute = settings.get("session_end_minute", 30)
    
    today_end = berlin_now.replace(
        hour=end_hour,
        minute=end_minute,
        second=0,
        microsecond=0
    )
    
    is_work_hours, _ = await is_within_work_hours(settings)
    
    if is_work_hours:
        expiry = today_end
    else:
        # Session expires in 1 minute (grace period)
        from datetime import timedelta
        expiry = berlin_now + timedelta(minutes=1)
    
    return expiry.astimezone(ZoneInfo("UTC"))
