"""
Session Management Utilities
Handles automatic session expiry at 6:30 PM Berlin time (Monday-Friday)
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

# Berlin timezone (CET/CEST - automatically handles daylight saving)
BERLIN_TZ = ZoneInfo("Europe/Berlin")

# Session end time: 6:30 PM (18:30)
SESSION_END_HOUR = 18
SESSION_END_MINUTE = 30


def get_berlin_time() -> datetime:
    """Get current time in Berlin timezone"""
    return datetime.now(BERLIN_TZ)


def get_session_expiry() -> datetime:
    """
    Calculate session expiry time.
    Sessions expire at 6:30 PM Berlin time on weekdays.
    If it's already past 6:30 PM or it's a weekend, session expires immediately.
    
    Returns:
        datetime: Session expiry time in UTC
    """
    berlin_now = get_berlin_time()
    
    # Get today's 6:30 PM in Berlin
    today_end = berlin_now.replace(
        hour=SESSION_END_HOUR, 
        minute=SESSION_END_MINUTE, 
        second=0, 
        microsecond=0
    )
    
    # Check if it's a weekday (Monday=0 to Friday=4)
    is_weekday = berlin_now.weekday() < 5
    
    # Check if current time is before 6:30 PM
    is_before_end_time = berlin_now < today_end
    
    if is_weekday and is_before_end_time:
        # Session expires today at 6:30 PM Berlin time
        expiry = today_end
    else:
        # Session expires immediately (past work hours or weekend)
        # But we'll give a grace period of 1 minute for the system to work
        expiry = berlin_now + timedelta(minutes=1)
    
    # Convert to UTC for storage
    return expiry.astimezone(ZoneInfo("UTC"))


def is_session_valid(session_expiry_utc: datetime) -> bool:
    """
    Check if a session is still valid.
    
    Args:
        session_expiry_utc: Session expiry time in UTC
        
    Returns:
        bool: True if session is still valid
    """
    now_utc = datetime.now(ZoneInfo("UTC"))
    return now_utc < session_expiry_utc


def get_session_info() -> dict:
    """
    Get current session information for debugging/display.
    
    Returns:
        dict with berlin_time, is_work_hours, session_expiry, etc.
    """
    berlin_now = get_berlin_time()
    is_weekday = berlin_now.weekday() < 5
    
    today_end = berlin_now.replace(
        hour=SESSION_END_HOUR, 
        minute=SESSION_END_MINUTE, 
        second=0, 
        microsecond=0
    )
    
    is_work_hours = is_weekday and berlin_now < today_end
    
    # Calculate time remaining
    if is_work_hours:
        time_remaining = today_end - berlin_now
        minutes_remaining = int(time_remaining.total_seconds() / 60)
    else:
        minutes_remaining = 0
    
    return {
        "berlin_time": berlin_now.strftime("%Y-%m-%d %H:%M:%S"),
        "day_of_week": berlin_now.strftime("%A"),
        "is_weekday": is_weekday,
        "is_work_hours": is_work_hours,
        "session_end_time": "18:30",
        "minutes_remaining": minutes_remaining,
        "session_expiry_utc": get_session_expiry().isoformat()
    }
