#!/usr/bin/env python3
"""
Debug agent access to leads
"""
import requests
import json

BASE_URL = "https://solicitor-suite.preview.emergentagent.com/api"
CRM_BASE_URL = f"{BASE_URL}/crm"

def login_user(email, password):
    """Login as specific user and return token"""
    try:
        response = requests.post(
            f"{CRM_BASE_URL}/auth/login",
            json={"email": email, "password": password},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            return data.get("token"), data.get("user")
        else:
            print(f"Login failed: {response.status_code} - {response.text}")
            return None, None
            
    except Exception as e:
        print(f"Login error: {e}")
        return None, None

def main():
    # Login as agent
    agent_token, agent_user = login_user("agent@test.com", "TestPass123!")
    
    if not agent_token:
        print("Could not login as agent")
        return
    
    print(f"Agent user info: {agent_user}")
    
    # Get leads as agent
    headers = {"Authorization": f"Bearer {agent_token}"}
    response = requests.get(f"{CRM_BASE_URL}/leads", headers=headers)
    
    print(f"Agent leads response: {response.status_code}")
    if response.status_code == 200:
        leads = response.json()
        print(f"Agent can see {len(leads)} leads:")
        for lead in leads:
            print(f"  - {lead.get('fullName')} (ID: {lead.get('id')}, assigned_to: {lead.get('assigned_to')})")
    else:
        print(f"Error: {response.text}")

if __name__ == "__main__":
    main()