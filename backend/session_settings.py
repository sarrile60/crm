"""
Session Settings Management
Stores session configuration in database for GUI-based management
"""

from datetime import datetime, time
from zoneinfo import ZoneInfo
from typing import Optional


def get_gmt_offset(tz_name: str) -> str:
    """Get GMT offset string for a timezone (e.g., 'GMT+1', 'GMT-5')"""
    try:
        tz = ZoneInfo(tz_name)
        now = datetime.now(tz)
        offset = now.utcoffset()
        if offset is None:
            return "GMT"
        
        total_seconds = int(offset.total_seconds())
        hours = total_seconds // 3600
        minutes = abs(total_seconds % 3600) // 60
        
        if hours >= 0:
            if minutes:
                return f"GMT+{hours}:{minutes:02d}"
            return f"GMT+{hours}" if hours > 0 else "GMT"
        else:
            if minutes:
                return f"GMT{hours}:{minutes:02d}"
            return f"GMT{hours}"
    except Exception:
        return "GMT"


def get_current_time_in_timezone(tz_name: str) -> datetime:
    """Get current time in specified timezone"""
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("Europe/Berlin")
    return datetime.now(tz)


def get_all_timezones_with_offset() -> list:
    """Get all timezones with current GMT offset calculated dynamically"""
    base_timezones = [
        # Europe
        {"value": "Europe/London", "city": "London", "region": "Europe"},
        {"value": "Europe/Berlin", "city": "Berlin", "region": "Europe"},
        {"value": "Europe/Paris", "city": "Paris", "region": "Europe"},
        {"value": "Europe/Rome", "city": "Rome", "region": "Europe"},
        {"value": "Europe/Madrid", "city": "Madrid", "region": "Europe"},
        {"value": "Europe/Amsterdam", "city": "Amsterdam", "region": "Europe"},
        {"value": "Europe/Brussels", "city": "Brussels", "region": "Europe"},
        {"value": "Europe/Vienna", "city": "Vienna", "region": "Europe"},
        {"value": "Europe/Warsaw", "city": "Warsaw", "region": "Europe"},
        {"value": "Europe/Prague", "city": "Prague", "region": "Europe"},
        {"value": "Europe/Budapest", "city": "Budapest", "region": "Europe"},
        {"value": "Europe/Stockholm", "city": "Stockholm", "region": "Europe"},
        {"value": "Europe/Oslo", "city": "Oslo", "region": "Europe"},
        {"value": "Europe/Copenhagen", "city": "Copenhagen", "region": "Europe"},
        {"value": "Europe/Helsinki", "city": "Helsinki", "region": "Europe"},
        {"value": "Europe/Athens", "city": "Athens", "region": "Europe"},
        {"value": "Europe/Bucharest", "city": "Bucharest", "region": "Europe"},
        {"value": "Europe/Sofia", "city": "Sofia", "region": "Europe"},
        {"value": "Europe/Istanbul", "city": "Istanbul", "region": "Europe"},
        {"value": "Europe/Moscow", "city": "Moscow", "region": "Europe"},
        {"value": "Europe/Kiev", "city": "Kyiv", "region": "Europe"},
        {"value": "Europe/Dublin", "city": "Dublin", "region": "Europe"},
        {"value": "Europe/Lisbon", "city": "Lisbon", "region": "Europe"},
        {"value": "Europe/Zurich", "city": "Zurich", "region": "Europe"},
        # Americas
        {"value": "America/New_York", "city": "New York", "region": "Americas"},
        {"value": "America/Chicago", "city": "Chicago", "region": "Americas"},
        {"value": "America/Denver", "city": "Denver", "region": "Americas"},
        {"value": "America/Los_Angeles", "city": "Los Angeles", "region": "Americas"},
        {"value": "America/Phoenix", "city": "Phoenix", "region": "Americas"},
        {"value": "America/Anchorage", "city": "Anchorage", "region": "Americas"},
        {"value": "America/Honolulu", "city": "Honolulu", "region": "Americas"},
        {"value": "America/Toronto", "city": "Toronto", "region": "Americas"},
        {"value": "America/Vancouver", "city": "Vancouver", "region": "Americas"},
        {"value": "America/Mexico_City", "city": "Mexico City", "region": "Americas"},
        {"value": "America/Bogota", "city": "Bogota", "region": "Americas"},
        {"value": "America/Lima", "city": "Lima", "region": "Americas"},
        {"value": "America/Santiago", "city": "Santiago", "region": "Americas"},
        {"value": "America/Buenos_Aires", "city": "Buenos Aires", "region": "Americas"},
        {"value": "America/Sao_Paulo", "city": "São Paulo", "region": "Americas"},
        {"value": "America/Caracas", "city": "Caracas", "region": "Americas"},
        # Asia
        {"value": "Asia/Tokyo", "city": "Tokyo", "region": "Asia"},
        {"value": "Asia/Seoul", "city": "Seoul", "region": "Asia"},
        {"value": "Asia/Shanghai", "city": "Shanghai", "region": "Asia"},
        {"value": "Asia/Hong_Kong", "city": "Hong Kong", "region": "Asia"},
        {"value": "Asia/Singapore", "city": "Singapore", "region": "Asia"},
        {"value": "Asia/Bangkok", "city": "Bangkok", "region": "Asia"},
        {"value": "Asia/Jakarta", "city": "Jakarta", "region": "Asia"},
        {"value": "Asia/Manila", "city": "Manila", "region": "Asia"},
        {"value": "Asia/Kuala_Lumpur", "city": "Kuala Lumpur", "region": "Asia"},
        {"value": "Asia/Ho_Chi_Minh", "city": "Ho Chi Minh", "region": "Asia"},
        {"value": "Asia/Kolkata", "city": "Kolkata", "region": "Asia"},
        {"value": "Asia/Mumbai", "city": "Mumbai", "region": "Asia"},
        {"value": "Asia/Delhi", "city": "Delhi", "region": "Asia"},
        {"value": "Asia/Karachi", "city": "Karachi", "region": "Asia"},
        {"value": "Asia/Dubai", "city": "Dubai", "region": "Asia"},
        {"value": "Asia/Riyadh", "city": "Riyadh", "region": "Asia"},
        {"value": "Asia/Tehran", "city": "Tehran", "region": "Asia"},
        {"value": "Asia/Jerusalem", "city": "Jerusalem", "region": "Asia"},
        {"value": "Asia/Beirut", "city": "Beirut", "region": "Asia"},
        {"value": "Asia/Baghdad", "city": "Baghdad", "region": "Asia"},
        # Africa
        {"value": "Africa/Cairo", "city": "Cairo", "region": "Africa"},
        {"value": "Africa/Johannesburg", "city": "Johannesburg", "region": "Africa"},
        {"value": "Africa/Lagos", "city": "Lagos", "region": "Africa"},
        {"value": "Africa/Nairobi", "city": "Nairobi", "region": "Africa"},
        {"value": "Africa/Casablanca", "city": "Casablanca", "region": "Africa"},
        {"value": "Africa/Algiers", "city": "Algiers", "region": "Africa"},
        {"value": "Africa/Tunis", "city": "Tunis", "region": "Africa"},
        # Oceania
        {"value": "Australia/Sydney", "city": "Sydney", "region": "Oceania"},
        {"value": "Australia/Melbourne", "city": "Melbourne", "region": "Oceania"},
        {"value": "Australia/Brisbane", "city": "Brisbane", "region": "Oceania"},
        {"value": "Australia/Perth", "city": "Perth", "region": "Oceania"},
        {"value": "Australia/Adelaide", "city": "Adelaide", "region": "Oceania"},
        {"value": "Pacific/Auckland", "city": "Auckland", "region": "Oceania"},
        {"value": "Pacific/Fiji", "city": "Fiji", "region": "Oceania"},
        # UTC
        {"value": "UTC", "city": "UTC", "region": "UTC"},
    ]
    
    result = []
    for tz in base_timezones:
        offset = get_gmt_offset(tz["value"])
        current_time = get_current_time_in_timezone(tz["value"])
        result.append({
            "value": tz["value"],
            "label": f"{tz['city']} ({offset})",
            "city": tz["city"],
            "region": tz["region"],
            "offset": offset,
            "current_time": current_time.strftime("%H:%M")
        })
    
    return result


# Keep for backward compatibility
ALL_TIMEZONES = get_all_timezones_with_offset()

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
    
    # Get current time in configured timezone
    tz_name = settings.get("timezone", "Europe/Berlin")
    current_datetime = get_current_time_in_timezone(tz_name)
    
    # Check if it's a work day
    if current_datetime.weekday() not in settings.get("work_days", [0, 1, 2, 3, 4]):
        day_name = current_datetime.strftime("%A")
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
    
    current_time = current_datetime.time()
    
    if current_time < start_time:
        return False, f"Prima dell'orario di lavoro (inizio: {start_time.strftime('%H:%M')})"
    
    if current_time >= end_time:
        return False, f"Dopo l'orario di lavoro (fine: {end_time.strftime('%H:%M')})"
    
    return True, "Entro l'orario di lavoro"


async def get_session_expiry_from_settings() -> datetime:
    """Calculate session expiry based on database settings"""
    settings = await get_session_settings()
    tz_name = settings.get("timezone", "Europe/Berlin")
    current_time = get_current_time_in_timezone(tz_name)
    
    end_hour = settings.get("session_end_hour", 18)
    end_minute = settings.get("session_end_minute", 30)
    
    today_end = current_time.replace(
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
        expiry = current_time + timedelta(minutes=1)
    
    return expiry.astimezone(ZoneInfo("UTC"))
