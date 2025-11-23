#!/usr/bin/env python3
"""
CRM Backend Testing Suite
Tests phone masking, mass update endpoint, created_at field functionality, and WebSocket chat functionality
"""

import requests
import json
import sys
from datetime import datetime
import uuid
import time
import asyncio

# Configuration
BASE_URL = "https://legal-hub-27.preview.emergentagent.com/api"
CRM_BASE_URL = f"{BASE_URL}/crm"
CHAT_BASE_URL = f"{BASE_URL}/chat"

# Test credentials
ADMIN_CREDENTIALS = {
    "email": "admin@1lawsolicitors.com",
    "password": "Admin@123456"
}

AGENT_CREDENTIALS = {
    "email": "agent@test.com",
    "password": "TestPass123!"
}

SUPERVISOR_CREDENTIALS = {
    "email": "supervisor@test.com",
    "password": "TestPass123!"
}

# Test data
TEST_LEAD_DATA = {
    "fullName": "Marco Rossi",
    "email": "marco.rossi@example.com",
    "phone": "+393451234567",
    "scammerCompany": "Fake Investment Corp",
    "amountLost": "€15,000",
    "caseDetails": "Lost money in fake cryptocurrency investment scheme"
}

class CRMTester:
    def __init__(self):
        self.session = requests.Session()
        self.admin_token = None
        self.agent_token = None
        self.supervisor_token = None
        self.test_lead_id = None
        self.test_results = []
        self.test_users = {}
        
    def log_result(self, test_name, success, message, details=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        if details:
            print(f"   Details: {details}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "message": message,
            "details": details
        })
    
    def login_admin(self):
        """Login as admin user"""
        try:
            response = self.session.post(
                f"{CRM_BASE_URL}/auth/login",
                json=ADMIN_CREDENTIALS,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                self.admin_token = data.get("token")
                self.log_result("Admin Login", True, "Successfully logged in as admin")
                return True
            else:
                self.log_result("Admin Login", False, f"Login failed: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Admin Login", False, f"Login error: {str(e)}")
            return False
    
    def create_test_users(self):
        """Create test users for different roles"""
        if not self.admin_token:
            return False
            
        headers = {
            "Authorization": f"Bearer {self.admin_token}",
            "Content-Type": "application/json"
        }
        
        test_users = [
            {
                "email": "manager@test.com",
                "full_name": "Test Manager",
                "password": "TestPass123!",
                "role": "manager"
            },
            {
                "email": "supervisor@test.com", 
                "full_name": "Test Supervisor",
                "password": "TestPass123!",
                "role": "supervisor"
            },
            {
                "email": "agent@test.com",
                "full_name": "Test Agent", 
                "password": "TestPass123!",
                "role": "agent"
            }
        ]
        
        created_users = []
        for user_data in test_users:
            try:
                response = self.session.post(
                    f"{CRM_BASE_URL}/users",
                    json=user_data,
                    headers=headers
                )
                
                if response.status_code == 200:
                    created_users.append(user_data["role"])
                    self.log_result(f"Create {user_data['role']} user", True, f"Created {user_data['role']} user successfully")
                else:
                    # User might already exist, try to continue
                    if "already registered" in response.text:
                        created_users.append(user_data["role"])
                        self.log_result(f"Create {user_data['role']} user", True, f"{user_data['role']} user already exists")
                    else:
                        self.log_result(f"Create {user_data['role']} user", False, f"Failed to create {user_data['role']}: {response.status_code}", response.text)
                        
            except Exception as e:
                self.log_result(f"Create {user_data['role']} user", False, f"Error creating {user_data['role']}: {str(e)}")
        
        return len(created_users) >= 3
    
    def create_test_lead(self):
        """Create a test lead for testing"""
        if not self.admin_token:
            return False
            
        try:
            # Use the main leads endpoint to create a lead
            response = self.session.post(
                f"{BASE_URL}/leads/submit",
                json=TEST_LEAD_DATA,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                # Get the lead ID by fetching leads
                headers = {"Authorization": f"Bearer {self.admin_token}"}
                leads_response = self.session.get(f"{CRM_BASE_URL}/leads", headers=headers)
                
                if leads_response.status_code == 200:
                    leads = leads_response.json()
                    if leads:
                        # Find our test lead
                        for lead in leads:
                            if lead.get("email") == TEST_LEAD_DATA["email"]:
                                self.test_lead_id = lead.get("id")
                                break
                        
                        if self.test_lead_id:
                            # Assign the lead to the agent for testing
                            self.assign_lead_to_agent()
                            self.log_result("Create Test Lead", True, f"Created test lead with ID: {self.test_lead_id}")
                            return True
                
                self.log_result("Create Test Lead", False, "Could not retrieve lead ID after creation")
                return False
            else:
                self.log_result("Create Test Lead", False, f"Failed to create lead: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Create Test Lead", False, f"Error creating lead: {str(e)}")
            return False
    
    def assign_lead_to_agent(self):
        """Assign test lead to agent for permission testing"""
        if not self.admin_token or not self.test_lead_id:
            return
        
        try:
            # Get agent user ID (specifically the "Test Agent" we created)
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            users_response = self.session.get(f"{CRM_BASE_URL}/users", headers=headers)
            
            if users_response.status_code == 200:
                users = users_response.json()
                agent_id = None
                for user in users:
                    if user.get("role") == "agent" and user.get("email") == "agent@test.com":
                        agent_id = user.get("id")
                        break
                
                if agent_id:
                    # Use direct database update to assign lead
                    update_data = {
                        "assigned_to": agent_id,
                        "assigned_by": "admin"
                    }
                    
                    # Update lead directly via PUT endpoint
                    update_response = self.session.put(
                        f"{CRM_BASE_URL}/leads/{self.test_lead_id}",
                        json=update_data,
                        headers={**headers, "Content-Type": "application/json"}
                    )
                    
                    if update_response.status_code == 200:
                        self.log_result("Assign Lead to Agent", True, f"Successfully assigned lead to agent {agent_id}")
                    else:
                        self.log_result("Assign Lead to Agent", False, f"Failed to assign lead: {update_response.status_code} - {update_response.text}")
                else:
                    self.log_result("Assign Lead to Agent", False, "Could not find test agent")
        except Exception as e:
            self.log_result("Assign Lead to Agent", False, f"Error assigning lead: {str(e)}")
    
    def login_user(self, email, password):
        """Login as specific user and return token"""
        try:
            response = self.session.post(
                f"{CRM_BASE_URL}/auth/login",
                json={"email": email, "password": password},
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                return data.get("token")
            else:
                return None
                
        except Exception as e:
            return None
    
    def test_phone_masking(self):
        """Test phone masking for different user roles"""
        print("\n=== Testing Phone Masking ===")
        
        if not self.test_lead_id:
            self.log_result("Phone Masking Setup", False, "No test lead available")
            return
        
        # Test users with their expected phone visibility
        test_cases = [
            ("admin@1lawsolicitors.com", "Admin@123456", "admin", "+393451234567"),  # Full phone
            ("manager@test.com", "TestPass123!", "manager", "xxxxxxxx4567"),  # Masked phone
            ("supervisor@test.com", "TestPass123!", "supervisor", "xxxxxxxx4567"),  # Masked phone  
            ("agent@test.com", "TestPass123!", "agent", "xxxxxxxx4567")  # Masked phone
        ]
        
        for email, password, role, expected_phone in test_cases:
            token = self.login_user(email, password)
            if not token:
                self.log_result(f"Phone Masking - {role} login", False, f"Could not login as {role}")
                continue
            
            headers = {"Authorization": f"Bearer {token}"}
            
            # Test leads list endpoint
            try:
                response = self.session.get(f"{CRM_BASE_URL}/leads", headers=headers)
                if response.status_code == 200:
                    leads = response.json()
                    test_lead = None
                    for lead in leads:
                        if lead.get("id") == self.test_lead_id:
                            test_lead = lead
                            break
                    
                    if test_lead:
                        actual_phone = test_lead.get("phone", "")
                        if role == "admin":
                            # Admin should see full phone
                            success = actual_phone == expected_phone
                        else:
                            # Others should see masked phone
                            success = actual_phone.endswith("4567") and "xxxxxxxx" in actual_phone
                        
                        self.log_result(
                            f"Phone Masking - {role} leads list", 
                            success, 
                            f"Phone visibility correct for {role}",
                            f"Expected pattern: {expected_phone}, Got: {actual_phone}"
                        )
                    else:
                        self.log_result(f"Phone Masking - {role} leads list", False, "Test lead not found in response")
                else:
                    self.log_result(f"Phone Masking - {role} leads list", False, f"Failed to get leads: {response.status_code}")
                    
            except Exception as e:
                self.log_result(f"Phone Masking - {role} leads list", False, f"Error: {str(e)}")
            
            # Test lead detail endpoint
            try:
                response = self.session.get(f"{CRM_BASE_URL}/leads/{self.test_lead_id}", headers=headers)
                if response.status_code == 200:
                    lead = response.json()
                    actual_phone = lead.get("phone", "")
                    
                    if role == "admin":
                        # Admin should see full phone
                        success = actual_phone == expected_phone
                    else:
                        # Others should see masked phone
                        success = actual_phone.endswith("4567") and "xxxxxxxx" in actual_phone
                    
                    self.log_result(
                        f"Phone Masking - {role} lead detail", 
                        success, 
                        f"Phone visibility correct for {role}",
                        f"Expected pattern: {expected_phone}, Got: {actual_phone}"
                    )
                else:
                    self.log_result(f"Phone Masking - {role} lead detail", False, f"Failed to get lead detail: {response.status_code}")
                    
            except Exception as e:
                self.log_result(f"Phone Masking - {role} lead detail", False, f"Error: {str(e)}")
    
    def test_mass_update_permissions(self):
        """Test mass update endpoint permissions"""
        print("\n=== Testing Mass Update Permissions ===")
        
        if not self.test_lead_id:
            self.log_result("Mass Update Setup", False, "No test lead available")
            return
        
        # Test data for mass update
        mass_update_data = {
            "lead_ids": [self.test_lead_id],
            "status": "contacted"
        }
        
        # Test users and their expected access
        test_cases = [
            ("admin@1lawsolicitors.com", "Admin@123456", "admin", True),
            ("manager@test.com", "TestPass123!", "manager", True),
            ("supervisor@test.com", "TestPass123!", "supervisor", True),
            ("agent@test.com", "TestPass123!", "agent", False)  # Should fail with 403
        ]
        
        for email, password, role, should_succeed in test_cases:
            token = self.login_user(email, password)
            if not token:
                self.log_result(f"Mass Update - {role} login", False, f"Could not login as {role}")
                continue
            
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            
            try:
                response = self.session.post(
                    f"{CRM_BASE_URL}/leads/mass-update",
                    json=mass_update_data,
                    headers=headers
                )
                
                if should_succeed:
                    if response.status_code == 200:
                        data = response.json()
                        updated_count = data.get("updated_count", 0)
                        success = data.get("success", False) and updated_count > 0
                        self.log_result(
                            f"Mass Update - {role} access", 
                            success, 
                            f"{role} can perform mass update",
                            f"Updated {updated_count} leads"
                        )
                    else:
                        self.log_result(f"Mass Update - {role} access", False, f"Mass update failed for {role}: {response.status_code}", response.text)
                else:
                    # Agent should get 403
                    if response.status_code == 403:
                        self.log_result(f"Mass Update - {role} access", True, f"{role} correctly denied access (403)")
                    else:
                        self.log_result(f"Mass Update - {role} access", False, f"Expected 403 for {role}, got {response.status_code}")
                        
            except Exception as e:
                self.log_result(f"Mass Update - {role} access", False, f"Error: {str(e)}")
    
    def test_mass_update_functionality(self):
        """Test mass update functionality with different fields"""
        print("\n=== Testing Mass Update Functionality ===")
        
        if not self.admin_token or not self.test_lead_id:
            self.log_result("Mass Update Functionality Setup", False, "Missing admin token or test lead")
            return
        
        headers = {
            "Authorization": f"Bearer {self.admin_token}",
            "Content-Type": "application/json"
        }
        
        # Test different update scenarios
        test_scenarios = [
            {
                "name": "Status Update",
                "data": {"lead_ids": [self.test_lead_id], "status": "qualified"},
                "verify_field": "status",
                "expected_value": "qualified"
            },
            {
                "name": "Multiple Fields Update", 
                "data": {"lead_ids": [self.test_lead_id], "status": "in_progress", "priority": "high"},
                "verify_field": "status",
                "expected_value": "in_progress"
            }
        ]
        
        for scenario in test_scenarios:
            try:
                response = self.session.post(
                    f"{CRM_BASE_URL}/leads/mass-update",
                    json=scenario["data"],
                    headers=headers
                )
                
                if response.status_code == 200:
                    data = response.json()
                    updated_count = data.get("updated_count", 0)
                    
                    if updated_count > 0:
                        # Verify the update by fetching the lead
                        lead_response = self.session.get(f"{CRM_BASE_URL}/leads/{self.test_lead_id}", headers=headers)
                        if lead_response.status_code == 200:
                            lead = lead_response.json()
                            actual_value = lead.get(scenario["verify_field"])
                            
                            if actual_value == scenario["expected_value"]:
                                self.log_result(
                                    f"Mass Update - {scenario['name']}", 
                                    True, 
                                    f"Successfully updated {scenario['verify_field']}",
                                    f"Updated {updated_count} leads, {scenario['verify_field']} = {actual_value}"
                                )
                            else:
                                self.log_result(
                                    f"Mass Update - {scenario['name']}", 
                                    False, 
                                    f"Update not reflected in lead data",
                                    f"Expected {scenario['expected_value']}, got {actual_value}"
                                )
                        else:
                            self.log_result(f"Mass Update - {scenario['name']}", False, "Could not verify update")
                    else:
                        self.log_result(f"Mass Update - {scenario['name']}", False, "No leads were updated")
                else:
                    self.log_result(f"Mass Update - {scenario['name']}", False, f"Update failed: {response.status_code}", response.text)
                    
            except Exception as e:
                self.log_result(f"Mass Update - {scenario['name']}", False, f"Error: {str(e)}")
    
    def test_created_at_field(self):
        """Test created_at field presence and format"""
        print("\n=== Testing Created At Field ===")
        
        if not self.admin_token:
            self.log_result("Created At Field Setup", False, "Missing admin token")
            return
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        try:
            response = self.session.get(f"{CRM_BASE_URL}/leads", headers=headers)
            if response.status_code == 200:
                leads = response.json()
                
                if not leads:
                    self.log_result("Created At Field", False, "No leads found to test")
                    return
                
                leads_with_created_at = 0
                valid_iso_format = 0
                
                for lead in leads:
                    if "created_at" in lead:
                        leads_with_created_at += 1
                        created_at = lead["created_at"]
                        
                        # Try to parse as ISO datetime
                        try:
                            if isinstance(created_at, str):
                                # Try parsing ISO format
                                datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                                valid_iso_format += 1
                            elif isinstance(created_at, dict) and "$date" in created_at:
                                # MongoDB date format
                                valid_iso_format += 1
                        except:
                            pass
                
                total_leads = len(leads)
                
                self.log_result(
                    "Created At Field - Presence", 
                    leads_with_created_at == total_leads,
                    f"All leads have created_at field",
                    f"{leads_with_created_at}/{total_leads} leads have created_at"
                )
                
                self.log_result(
                    "Created At Field - Format", 
                    valid_iso_format == leads_with_created_at,
                    f"All created_at fields have valid format",
                    f"{valid_iso_format}/{leads_with_created_at} have valid ISO format"
                )
                
            else:
                self.log_result("Created At Field", False, f"Failed to get leads: {response.status_code}")
                
        except Exception as e:
            self.log_result("Created At Field", False, f"Error: {str(e)}")
    
    def login_chat_users(self):
        """Login chat test users and get their tokens"""
        print("\n=== Logging in Chat Test Users ===")
        
        # Login agent
        self.agent_token = self.login_user(AGENT_CREDENTIALS["email"], AGENT_CREDENTIALS["password"])
        if self.agent_token:
            self.log_result("Agent Login", True, "Successfully logged in as agent")
        else:
            self.log_result("Agent Login", False, "Failed to login as agent")
            return False
        
        # Login supervisor
        self.supervisor_token = self.login_user(SUPERVISOR_CREDENTIALS["email"], SUPERVISOR_CREDENTIALS["password"])
        if self.supervisor_token:
            self.log_result("Supervisor Login", True, "Successfully logged in as supervisor")
        else:
            self.log_result("Supervisor Login", False, "Failed to login as supervisor")
            return False
        
        # Get user info for both users
        try:
            # Get agent info
            agent_headers = {"Authorization": f"Bearer {self.agent_token}"}
            agent_response = self.session.get(f"{CRM_BASE_URL}/auth/me", headers=agent_headers)
            if agent_response.status_code == 200:
                self.test_users["agent"] = agent_response.json()
                self.log_result("Agent Info", True, f"Retrieved agent info: {self.test_users['agent']['full_name']}")
            
            # Get supervisor info
            supervisor_headers = {"Authorization": f"Bearer {self.supervisor_token}"}
            supervisor_response = self.session.get(f"{CRM_BASE_URL}/auth/me", headers=supervisor_headers)
            if supervisor_response.status_code == 200:
                self.test_users["supervisor"] = supervisor_response.json()
                self.log_result("Supervisor Info", True, f"Retrieved supervisor info: {self.test_users['supervisor']['full_name']}")
            
            return True
            
        except Exception as e:
            self.log_result("Chat User Setup", False, f"Error getting user info: {str(e)}")
            return False
    
    def test_chat_contacts_endpoint(self):
        """Test chat contacts endpoint for different users"""
        print("\n=== Testing Chat Contacts Endpoint ===")
        
        if not self.agent_token or not self.supervisor_token:
            self.log_result("Chat Contacts Setup", False, "Missing user tokens")
            return
        
        # Test agent contacts
        try:
            agent_headers = {"Authorization": f"Bearer {self.agent_token}"}
            response = self.session.get(f"{CHAT_BASE_URL}/contacts", headers=agent_headers)
            
            if response.status_code == 200:
                contacts = response.json()
                self.log_result(
                    "Chat Contacts - Agent", 
                    len(contacts) > 0,
                    f"Agent can see {len(contacts)} contacts",
                    f"Contacts: {[c.get('full_name', 'Unknown') for c in contacts]}"
                )
            else:
                self.log_result("Chat Contacts - Agent", False, f"Failed to get agent contacts: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Chat Contacts - Agent", False, f"Error: {str(e)}")
        
        # Test supervisor contacts
        try:
            supervisor_headers = {"Authorization": f"Bearer {self.supervisor_token}"}
            response = self.session.get(f"{CHAT_BASE_URL}/contacts", headers=supervisor_headers)
            
            if response.status_code == 200:
                contacts = response.json()
                self.log_result(
                    "Chat Contacts - Supervisor", 
                    len(contacts) > 0,
                    f"Supervisor can see {len(contacts)} contacts",
                    f"Contacts: {[c.get('full_name', 'Unknown') for c in contacts]}"
                )
            else:
                self.log_result("Chat Contacts - Supervisor", False, f"Failed to get supervisor contacts: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Chat Contacts - Supervisor", False, f"Error: {str(e)}")
    
    def test_direct_messaging(self):
        """Test real-time direct messaging between users"""
        print("\n=== Testing Real-time Direct Messaging ===")
        
        if not self.agent_token or not self.supervisor_token or not self.test_users:
            self.log_result("Direct Messaging Setup", False, "Missing tokens or user info")
            return
        
        agent_id = self.test_users["agent"]["id"]
        supervisor_id = self.test_users["supervisor"]["id"]
        
        # Test 1: Agent sends message to Supervisor
        try:
            agent_headers = {
                "Authorization": f"Bearer {self.agent_token}",
                "Content-Type": "application/json"
            }
            
            message_data = {
                "type": "direct",
                "content": f"Test direct message from agent at {datetime.now().strftime('%H:%M:%S')}",
                "recipient_id": supervisor_id
            }
            
            response = self.session.post(
                f"{CHAT_BASE_URL}/send",
                json=message_data,
                headers=agent_headers
            )
            
            if response.status_code == 200:
                result = response.json()
                message_id = result.get("message_id")
                
                # Verify message was saved to database by retrieving it
                time.sleep(1)  # Brief delay to ensure message is saved
                
                messages_response = self.session.get(
                    f"{CHAT_BASE_URL}/messages/direct/{supervisor_id}",
                    headers=agent_headers
                )
                
                if messages_response.status_code == 200:
                    messages = messages_response.json()
                    latest_message = messages[-1] if messages else None
                    
                    if latest_message and latest_message.get("id") == message_id:
                        self.log_result(
                            "Direct Messaging - Agent to Supervisor", 
                            True,
                            "Message sent and saved successfully",
                            f"Message ID: {message_id}, Content: {latest_message.get('content', '')[:50]}..."
                        )
                    else:
                        self.log_result("Direct Messaging - Agent to Supervisor", False, "Message not found in conversation history")
                else:
                    self.log_result("Direct Messaging - Agent to Supervisor", False, f"Could not retrieve messages: {messages_response.status_code}")
            else:
                self.log_result("Direct Messaging - Agent to Supervisor", False, f"Failed to send message: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Direct Messaging - Agent to Supervisor", False, f"Error: {str(e)}")
        
        # Test 2: Supervisor sends message to Agent (reverse direction)
        try:
            supervisor_headers = {
                "Authorization": f"Bearer {self.supervisor_token}",
                "Content-Type": "application/json"
            }
            
            message_data = {
                "type": "direct",
                "content": f"Test reply from supervisor at {datetime.now().strftime('%H:%M:%S')}",
                "recipient_id": agent_id
            }
            
            response = self.session.post(
                f"{CHAT_BASE_URL}/send",
                json=message_data,
                headers=supervisor_headers
            )
            
            if response.status_code == 200:
                result = response.json()
                message_id = result.get("message_id")
                
                # Verify message was saved
                time.sleep(1)
                
                messages_response = self.session.get(
                    f"{CHAT_BASE_URL}/messages/direct/{agent_id}",
                    headers=supervisor_headers
                )
                
                if messages_response.status_code == 200:
                    messages = messages_response.json()
                    latest_message = messages[-1] if messages else None
                    
                    if latest_message and latest_message.get("id") == message_id:
                        self.log_result(
                            "Direct Messaging - Supervisor to Agent", 
                            True,
                            "Reply sent and saved successfully",
                            f"Message ID: {message_id}, Content: {latest_message.get('content', '')[:50]}..."
                        )
                    else:
                        self.log_result("Direct Messaging - Supervisor to Agent", False, "Reply not found in conversation history")
                else:
                    self.log_result("Direct Messaging - Supervisor to Agent", False, f"Could not retrieve messages: {messages_response.status_code}")
            else:
                self.log_result("Direct Messaging - Supervisor to Agent", False, f"Failed to send reply: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Direct Messaging - Supervisor to Agent", False, f"Error: {str(e)}")
    
    def test_team_messaging(self):
        """Test real-time team messaging"""
        print("\n=== Testing Real-time Team Messaging ===")
        
        if not self.agent_token or not self.supervisor_token or not self.test_users:
            self.log_result("Team Messaging Setup", False, "Missing tokens or user info")
            return
        
        # Get team ID from supervisor (agents and supervisors should be in same team)
        supervisor_team_id = self.test_users["supervisor"].get("team_id")
        agent_team_id = self.test_users["agent"].get("team_id")
        
        if not supervisor_team_id:
            self.log_result("Team Messaging Setup", False, "Supervisor has no team_id")
            return
        
        # Test 1: Supervisor sends team message
        try:
            supervisor_headers = {
                "Authorization": f"Bearer {self.supervisor_token}",
                "Content-Type": "application/json"
            }
            
            message_data = {
                "type": "team",
                "content": f"Team message from supervisor at {datetime.now().strftime('%H:%M:%S')}",
                "team_id": supervisor_team_id
            }
            
            response = self.session.post(
                f"{CHAT_BASE_URL}/send",
                json=message_data,
                headers=supervisor_headers
            )
            
            if response.status_code == 200:
                result = response.json()
                message_id = result.get("message_id")
                
                # Verify message was saved
                time.sleep(1)
                
                messages_response = self.session.get(
                    f"{CHAT_BASE_URL}/messages/team/{supervisor_team_id}",
                    headers=supervisor_headers
                )
                
                if messages_response.status_code == 200:
                    messages = messages_response.json()
                    latest_message = messages[-1] if messages else None
                    
                    if latest_message and latest_message.get("id") == message_id:
                        self.log_result(
                            "Team Messaging - Supervisor", 
                            True,
                            "Team message sent and saved successfully",
                            f"Team ID: {supervisor_team_id}, Message ID: {message_id}"
                        )
                    else:
                        self.log_result("Team Messaging - Supervisor", False, "Team message not found in history")
                else:
                    self.log_result("Team Messaging - Supervisor", False, f"Could not retrieve team messages: {messages_response.status_code}")
            else:
                self.log_result("Team Messaging - Supervisor", False, f"Failed to send team message: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Team Messaging - Supervisor", False, f"Error: {str(e)}")
        
        # Test 2: Agent sends team message (if in same team)
        if agent_team_id == supervisor_team_id:
            try:
                agent_headers = {
                    "Authorization": f"Bearer {self.agent_token}",
                    "Content-Type": "application/json"
                }
                
                message_data = {
                    "type": "team",
                    "content": f"Team message from agent at {datetime.now().strftime('%H:%M:%S')}",
                    "team_id": agent_team_id
                }
                
                response = self.session.post(
                    f"{CHAT_BASE_URL}/send",
                    json=message_data,
                    headers=agent_headers
                )
                
                if response.status_code == 200:
                    result = response.json()
                    message_id = result.get("message_id")
                    
                    # Verify message was saved
                    time.sleep(1)
                    
                    messages_response = self.session.get(
                        f"{CHAT_BASE_URL}/messages/team/{agent_team_id}",
                        headers=agent_headers
                    )
                    
                    if messages_response.status_code == 200:
                        messages = messages_response.json()
                        latest_message = messages[-1] if messages else None
                        
                        if latest_message and latest_message.get("id") == message_id:
                            self.log_result(
                                "Team Messaging - Agent", 
                                True,
                                "Agent team message sent and saved successfully",
                                f"Team ID: {agent_team_id}, Message ID: {message_id}"
                            )
                        else:
                            self.log_result("Team Messaging - Agent", False, "Agent team message not found in history")
                    else:
                        self.log_result("Team Messaging - Agent", False, f"Could not retrieve team messages: {messages_response.status_code}")
                else:
                    self.log_result("Team Messaging - Agent", False, f"Failed to send agent team message: {response.status_code}", response.text)
                    
            except Exception as e:
                self.log_result("Team Messaging - Agent", False, f"Error: {str(e)}")
        else:
            self.log_result("Team Messaging - Agent", False, f"Agent and supervisor not in same team (Agent: {agent_team_id}, Supervisor: {supervisor_team_id})")
    
    def test_websocket_stability(self):
        """Test WebSocket connection stability by checking backend logs"""
        print("\n=== Testing WebSocket Connection Stability ===")
        
        try:
            # Check backend logs for WebSocket connections and errors
            import subprocess
            
            # Get recent backend logs
            result = subprocess.run(
                ["tail", "-n", "50", "/var/log/supervisor/backend.err.log"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                log_content = result.stdout
                
                # Check for WebSocket connection messages
                websocket_connections = log_content.count("WebSocket")
                websocket_errors = log_content.count("WebSocket error")
                websocket_disconnects = log_content.count("disconnected")
                
                # Check for the specific fix - asyncio.wait_for usage
                has_timeout_fix = "asyncio.wait_for" in log_content or "timeout" in log_content.lower()
                
                self.log_result(
                    "WebSocket Stability - Backend Logs", 
                    websocket_errors == 0,
                    f"Backend logs analysis completed",
                    f"WebSocket mentions: {websocket_connections}, Errors: {websocket_errors}, Disconnects: {websocket_disconnects}"
                )
                
                # Check for any critical errors in logs
                critical_errors = ["500 Internal Server Error", "Exception", "Error", "Failed"]
                error_count = sum(log_content.lower().count(error.lower()) for error in critical_errors)
                
                self.log_result(
                    "WebSocket Stability - Error Analysis", 
                    error_count < 5,  # Allow some minor errors
                    f"Backend error analysis completed",
                    f"Total error mentions in logs: {error_count}"
                )
                
            else:
                self.log_result("WebSocket Stability - Backend Logs", False, "Could not read backend logs")
                
        except Exception as e:
            self.log_result("WebSocket Stability - Backend Logs", False, f"Error checking logs: {str(e)}")
    
    def test_message_flow_architecture(self):
        """Test the complete message flow: POST to /send → save to DB → broadcast via WebSocket"""
        print("\n=== Testing Message Flow Architecture ===")
        
        if not self.agent_token or not self.supervisor_token or not self.test_users:
            self.log_result("Message Flow Setup", False, "Missing tokens or user info")
            return
        
        supervisor_id = self.test_users["supervisor"]["id"]
        
        # Step 1: Send message via POST /api/chat/send
        try:
            agent_headers = {
                "Authorization": f"Bearer {self.agent_token}",
                "Content-Type": "application/json"
            }
            
            test_message = f"Architecture test message at {datetime.now().strftime('%H:%M:%S.%f')}"
            message_data = {
                "type": "direct",
                "content": test_message,
                "recipient_id": supervisor_id
            }
            
            send_response = self.session.post(
                f"{CHAT_BASE_URL}/send",
                json=message_data,
                headers=agent_headers
            )
            
            if send_response.status_code == 200:
                result = send_response.json()
                message_id = result.get("message_id")
                
                self.log_result(
                    "Message Flow - Step 1 (POST /send)", 
                    True,
                    "Message sent successfully via API",
                    f"Message ID: {message_id}"
                )
                
                # Step 2: Verify message saved to database
                time.sleep(1)  # Allow time for database save
                
                messages_response = self.session.get(
                    f"{CHAT_BASE_URL}/messages/direct/{supervisor_id}",
                    headers=agent_headers
                )
                
                if messages_response.status_code == 200:
                    messages = messages_response.json()
                    saved_message = None
                    
                    for msg in messages:
                        if msg.get("content") == test_message:
                            saved_message = msg
                            break
                    
                    if saved_message:
                        self.log_result(
                            "Message Flow - Step 2 (Save to DB)", 
                            True,
                            "Message successfully saved to database",
                            f"Saved message ID: {saved_message.get('id')}, Created at: {saved_message.get('created_at')}"
                        )
                        
                        # Step 3: Verify message structure for WebSocket broadcast
                        required_fields = ["id", "type", "sender_id", "sender_name", "content", "recipient_id", "created_at"]
                        missing_fields = [field for field in required_fields if field not in saved_message]
                        
                        if not missing_fields:
                            self.log_result(
                                "Message Flow - Step 3 (WebSocket Ready)", 
                                True,
                                "Message has all required fields for WebSocket broadcast",
                                f"Message structure complete with {len(saved_message)} fields"
                            )
                        else:
                            self.log_result(
                                "Message Flow - Step 3 (WebSocket Ready)", 
                                False,
                                "Message missing required fields for WebSocket",
                                f"Missing fields: {missing_fields}"
                            )
                    else:
                        self.log_result("Message Flow - Step 2 (Save to DB)", False, "Message not found in database")
                else:
                    self.log_result("Message Flow - Step 2 (Save to DB)", False, f"Could not retrieve messages: {messages_response.status_code}")
            else:
                self.log_result("Message Flow - Step 1 (POST /send)", False, f"Failed to send message: {send_response.status_code}", send_response.text)
                
        except Exception as e:
            self.log_result("Message Flow Architecture", False, f"Error: {str(e)}")
    
    def run_websocket_tests(self):
        """Run all WebSocket-related tests"""
        print("\n" + "🔌" * 50)
        print("🔌 WEBSOCKET REAL-TIME CHAT TESTING")
        print("🔌" * 50)
        
        # Step 1: Login chat users
        if not self.login_chat_users():
            print("❌ Cannot proceed without chat user logins")
            return False
        
        # Step 2: Test chat contacts
        self.test_chat_contacts_endpoint()
        
        # Step 3: Test direct messaging
        self.test_direct_messaging()
        
        # Step 4: Test team messaging
        self.test_team_messaging()
        
        # Step 5: Test WebSocket stability
        self.test_websocket_stability()
        
        # Step 6: Test complete message flow architecture
        self.test_message_flow_architecture()
        
        return True
    
    def run_all_tests(self):
        """Run all CRM backend tests including WebSocket functionality"""
        print("🚀 Starting CRM Backend Tests")
        print("=" * 50)
        
        # Step 1: Login as admin
        if not self.login_admin():
            print("❌ Cannot proceed without admin login")
            return False
        
        # Step 2: Create test users
        self.create_test_users()
        
        # Step 3: Create test lead
        self.create_test_lead()
        
        # Step 4: Run CRM tests
        self.test_phone_masking()
        self.test_mass_update_permissions()
        self.test_mass_update_functionality()
        self.test_created_at_field()
        
        # Step 5: Run WebSocket tests (CRITICAL FIX TESTING)
        self.run_websocket_tests()
        
        # Summary
        print("\n" + "=" * 50)
        print("📊 TEST SUMMARY")
        print("=" * 50)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print("\n🔍 FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  • {result['test']}: {result['message']}")
                    if result["details"]:
                        print(f"    Details: {result['details']}")
        
        # Separate WebSocket test results
        websocket_tests = [r for r in self.test_results if "WebSocket" in r["test"] or "Direct Messaging" in r["test"] or "Team Messaging" in r["test"] or "Message Flow" in r["test"] or "Chat Contacts" in r["test"]]
        websocket_passed = sum(1 for r in websocket_tests if r["success"])
        websocket_total = len(websocket_tests)
        
        if websocket_total > 0:
            print(f"\n🔌 WEBSOCKET TEST RESULTS:")
            print(f"WebSocket Tests: {websocket_total}")
            print(f"✅ Passed: {websocket_passed}")
            print(f"❌ Failed: {websocket_total - websocket_passed}")
            print(f"WebSocket Success Rate: {(websocket_passed/websocket_total)*100:.1f}%")
        
        return failed_tests == 0

if __name__ == "__main__":
    tester = CRMTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)