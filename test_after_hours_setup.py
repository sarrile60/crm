#!/usr/bin/env python3
"""
Setup script to configure session settings for after-hours testing
"""

import requests
import json

# Configuration
BASE_URL = "https://deposit-crm-1.preview.emergentagent.com/api"

# Admin credentials
ADMIN_CREDENTIALS = {
    "username": "admin_f87450ce5d66",
    "password": "zTFjPAcs*-(NL-qbj@AP0TcWt*8)nV4f6K(ZcVP_"
}

def get_admin_token():
    """Get admin token"""
    response = requests.post(
        f"{BASE_URL}/crm/auth/login",
        json=ADMIN_CREDENTIALS,
        headers={"Content-Type": "application/json"}
    )
    
    if response.status_code == 200:
        return response.json().get("token")
    else:
        print(f"Failed to login: {response.status_code}")
        return None

def setup_after_hours_settings():
    """Configure session settings to make current time 'after hours'"""
    token = get_admin_token()
    if not token:
        return False
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # Set work hours to 8:00-11:00 UTC so that current time (11:26) is after hours
    settings_data = {
        "session_start_hour": 8,
        "session_start_minute": 0,
        "session_end_hour": 11,  # End at 11:00 so 11:26 is after hours
        "session_end_minute": 0,
        "work_days": [0, 1, 2, 3, 4],  # Monday-Friday
        "timezone": "UTC",
        "require_approval_after_hours": True,
        "approval_duration_minutes": 30
    }
    
    response = requests.put(
        f"{BASE_URL}/admin/session-settings",
        json=settings_data,
        headers=headers
    )
    
    if response.status_code == 200:
        print("✅ Session settings updated successfully")
        print("   Work hours: 08:00-11:00 UTC")
        print("   Current time should now be 'after hours'")
        return True
    else:
        print(f"❌ Failed to update settings: {response.status_code}")
        print(response.text)
        return False

def restore_normal_settings():
    """Restore normal work hours"""
    token = get_admin_token()
    if not token:
        return False
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # Restore normal work hours
    settings_data = {
        "session_start_hour": 8,
        "session_start_minute": 0,
        "session_end_hour": 18,
        "session_end_minute": 30,
        "work_days": [0, 1, 2, 3, 4],
        "timezone": "UTC",
        "require_approval_after_hours": True,
        "approval_duration_minutes": 30
    }
    
    response = requests.put(
        f"{BASE_URL}/admin/session-settings",
        json=settings_data,
        headers=headers
    )
    
    if response.status_code == 200:
        print("✅ Session settings restored to normal")
        print("   Work hours: 08:00-18:30 UTC")
        return True
    else:
        print(f"❌ Failed to restore settings: {response.status_code}")
        return False

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "restore":
        restore_normal_settings()
    else:
        setup_after_hours_settings()