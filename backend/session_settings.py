"""
Session Settings Management
Stores session configuration in database for GUI-based management
"""

from datetime import datetime, time
from zoneinfo import ZoneInfo
from typing import Optional

# All available timezones grouped by region
ALL_TIMEZONES = [
    # Europe
    {"value": "Europe/London", "label": "London (GMT/BST)", "region": "Europe"},
    {"value": "Europe/Berlin", "label": "Berlin (CET/CEST)", "region": "Europe"},
    {"value": "Europe/Paris", "label": "Paris (CET/CEST)", "region": "Europe"},
    {"value": "Europe/Rome", "label": "Rome (CET/CEST)", "region": "Europe"},
    {"value": "Europe/Madrid", "label": "Madrid (CET/CEST)", "region": "Europe"},
    {"value": "Europe/Amsterdam", "label": "Amsterdam (CET/CEST)", "region": "Europe"},
    {"value": "Europe/Brussels", "label": "Brussels (CET/CEST)", "region": "Europe"},
    {"value": "Europe/Vienna", "label": "Vienna (CET/CEST)", "region": "Europe"},
    {"value": "Europe/Warsaw", "label": "Warsaw (CET/CEST)", "region": "Europe"},
    {"value": "Europe/Prague", "label": "Prague (CET/CEST)", "region": "Europe"},
    {"value": "Europe/Budapest", "label": "Budapest (CET/CEST)", "region": "Europe"},
    {"value": "Europe/Stockholm", "label": "Stockholm (CET/CEST)", "region": "Europe"},
    {"value": "Europe/Oslo", "label": "Oslo (CET/CEST)", "region": "Europe"},
    {"value": "Europe/Copenhagen", "label": "Copenhagen (CET/CEST)", "region": "Europe"},
    {"value": "Europe/Helsinki", "label": "Helsinki (EET/EEST)", "region": "Europe"},
    {"value": "Europe/Athens", "label": "Athens (EET/EEST)", "region": "Europe"},
    {"value": "Europe/Bucharest", "label": "Bucharest (EET/EEST)", "region": "Europe"},
    {"value": "Europe/Sofia", "label": "Sofia (EET/EEST)", "region": "Europe"},
    {"value": "Europe/Istanbul", "label": "Istanbul (TRT)", "region": "Europe"},
    {"value": "Europe/Moscow", "label": "Moscow (MSK)", "region": "Europe"},
    {"value": "Europe/Kiev", "label": "Kyiv (EET/EEST)", "region": "Europe"},
    {"value": "Europe/Dublin", "label": "Dublin (GMT/IST)", "region": "Europe"},
    {"value": "Europe/Lisbon", "label": "Lisbon (WET/WEST)", "region": "Europe"},
    {"value": "Europe/Zurich", "label": "Zurich (CET/CEST)", "region": "Europe"},
    # Americas
    {"value": "America/New_York", "label": "New York (EST/EDT)", "region": "Americas"},
    {"value": "America/Chicago", "label": "Chicago (CST/CDT)", "region": "Americas"},
    {"value": "America/Denver", "label": "Denver (MST/MDT)", "region": "Americas"},
    {"value": "America/Los_Angeles", "label": "Los Angeles (PST/PDT)", "region": "Americas"},
    {"value": "America/Phoenix", "label": "Phoenix (MST)", "region": "Americas"},
    {"value": "America/Anchorage", "label": "Anchorage (AKST/AKDT)", "region": "Americas"},
    {"value": "America/Honolulu", "label": "Honolulu (HST)", "region": "Americas"},
    {"value": "America/Toronto", "label": "Toronto (EST/EDT)", "region": "Americas"},
    {"value": "America/Vancouver", "label": "Vancouver (PST/PDT)", "region": "Americas"},
    {"value": "America/Mexico_City", "label": "Mexico City (CST/CDT)", "region": "Americas"},
    {"value": "America/Bogota", "label": "Bogota (COT)", "region": "Americas"},
    {"value": "America/Lima", "label": "Lima (PET)", "region": "Americas"},
    {"value": "America/Santiago", "label": "Santiago (CLT/CLST)", "region": "Americas"},
    {"value": "America/Buenos_Aires", "label": "Buenos Aires (ART)", "region": "Americas"},
    {"value": "America/Sao_Paulo", "label": "São Paulo (BRT)", "region": "Americas"},
    {"value": "America/Caracas", "label": "Caracas (VET)", "region": "Americas"},
    # Asia
    {"value": "Asia/Tokyo", "label": "Tokyo (JST)", "region": "Asia"},
    {"value": "Asia/Seoul", "label": "Seoul (KST)", "region": "Asia"},
    {"value": "Asia/Shanghai", "label": "Shanghai (CST)", "region": "Asia"},
    {"value": "Asia/Hong_Kong", "label": "Hong Kong (HKT)", "region": "Asia"},
    {"value": "Asia/Singapore", "label": "Singapore (SGT)", "region": "Asia"},
    {"value": "Asia/Bangkok", "label": "Bangkok (ICT)", "region": "Asia"},
    {"value": "Asia/Jakarta", "label": "Jakarta (WIB)", "region": "Asia"},
    {"value": "Asia/Manila", "label": "Manila (PHT)", "region": "Asia"},
    {"value": "Asia/Kuala_Lumpur", "label": "Kuala Lumpur (MYT)", "region": "Asia"},
    {"value": "Asia/Ho_Chi_Minh", "label": "Ho Chi Minh (ICT)", "region": "Asia"},
    {"value": "Asia/Kolkata", "label": "Kolkata (IST)", "region": "Asia"},
    {"value": "Asia/Mumbai", "label": "Mumbai (IST)", "region": "Asia"},
    {"value": "Asia/Delhi", "label": "Delhi (IST)", "region": "Asia"},
    {"value": "Asia/Karachi", "label": "Karachi (PKT)", "region": "Asia"},
    {"value": "Asia/Dubai", "label": "Dubai (GST)", "region": "Asia"},
    {"value": "Asia/Riyadh", "label": "Riyadh (AST)", "region": "Asia"},
    {"value": "Asia/Tehran", "label": "Tehran (IRST)", "region": "Asia"},
    {"value": "Asia/Jerusalem", "label": "Jerusalem (IST/IDT)", "region": "Asia"},
    {"value": "Asia/Beirut", "label": "Beirut (EET/EEST)", "region": "Asia"},
    {"value": "Asia/Baghdad", "label": "Baghdad (AST)", "region": "Asia"},
    # Africa
    {"value": "Africa/Cairo", "label": "Cairo (EET)", "region": "Africa"},
    {"value": "Africa/Johannesburg", "label": "Johannesburg (SAST)", "region": "Africa"},
    {"value": "Africa/Lagos", "label": "Lagos (WAT)", "region": "Africa"},
    {"value": "Africa/Nairobi", "label": "Nairobi (EAT)", "region": "Africa"},
    {"value": "Africa/Casablanca", "label": "Casablanca (WET/WEST)", "region": "Africa"},
    {"value": "Africa/Algiers", "label": "Algiers (CET)", "region": "Africa"},
    {"value": "Africa/Tunis", "label": "Tunis (CET)", "region": "Africa"},
    # Oceania
    {"value": "Australia/Sydney", "label": "Sydney (AEST/AEDT)", "region": "Oceania"},
    {"value": "Australia/Melbourne", "label": "Melbourne (AEST/AEDT)", "region": "Oceania"},
    {"value": "Australia/Brisbane", "label": "Brisbane (AEST)", "region": "Oceania"},
    {"value": "Australia/Perth", "label": "Perth (AWST)", "region": "Oceania"},
    {"value": "Australia/Adelaide", "label": "Adelaide (ACST/ACDT)", "region": "Oceania"},
    {"value": "Pacific/Auckland", "label": "Auckland (NZST/NZDT)", "region": "Oceania"},
    {"value": "Pacific/Fiji", "label": "Fiji (FJT)", "region": "Oceania"},
    # UTC
    {"value": "UTC", "label": "UTC (Coordinated Universal Time)", "region": "UTC"},
]

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


def get_current_time_in_timezone(tz_name: str) -> datetime:
    """Get current time in specified timezone"""
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("Europe/Berlin")
    return datetime.now(tz)


async def update_session_settings(
    session_start_hour: int,
    session_start_minute: int,
    session_end_hour: int,
    session_end_minute: int,
    work_days: list,
    require_approval_after_hours: bool,
    approval_duration_minutes: int = 30,
    timezone: str = "Europe/Berlin"
) -> dict:
    """Update session settings in database"""
    # Validate timezone
    valid_tz = timezone if any(tz["value"] == timezone for tz in ALL_TIMEZONES) else "Europe/Berlin"
    
    settings = {
        "type": "session_config",
        "session_start_hour": session_start_hour,
        "session_start_minute": session_start_minute,
        "session_end_hour": session_end_hour,
        "session_end_minute": session_end_minute,
        "work_days": work_days,
        "timezone": valid_tz,
        "require_approval_after_hours": require_approval_after_hours,
        "approval_duration_minutes": approval_duration_minutes,
        "updated_at": datetime.now(ZoneInfo("UTC"))
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
