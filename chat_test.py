#!/usr/bin/env python3
"""
Chat API Testing Suite
Tests chat contacts and messaging functionality to debug reported issues
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://leads-ui-upgrade.preview.emergentagent.com/api"
CRM_BASE_URL = f"{BASE_URL}/crm"
CHAT_BASE_URL = f"{BASE_URL}/chat"

# Test credentials
TEST_USERS = [
    {
        "email": "admin@1lawsolicitors.com",
        "password": "Admin@123456",
        "role": "admin",
        "name": "Admin User"
    },
    {
        "email": "supervisor@test.com",
        "password": "TestPass123!",
        "role": "supervisor", 
        "name": "Test Supervisor"
    },
    {
        "email": "agent@test.com",
        "password": "TestPass123!",
        "role": "agent",
        "name": "Test Agent"
    }
]

class ChatTester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        self.user_tokens = {}
        self.user_data = {}
        
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
    
    def login_user(self, email, password, role_name):
        """Login user and store token"""
        try:
            response = self.session.post(
                f"{CRM_BASE_URL}/auth/login",
                json={"email": email, "password": password},
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                token = data.get("token")
                if token:
                    self.user_tokens[role_name] = token
                    self.log_result(f"Login {role_name}", True, f"Successfully logged in as {role_name}")
                    return token
                else:
                    self.log_result(f"Login {role_name}", False, "No token in response", data)
                    return None
            else:
                self.log_result(f"Login {role_name}", False, f"Login failed: {response.status_code}", response.text)
                return None
                
        except Exception as e:
            self.log_result(f"Login {role_name}", False, f"Login error: {str(e)}")
            return None
    
    def get_user_info(self, role_name):
        """Get user info using /me endpoint"""
        token = self.user_tokens.get(role_name)
        if not token:
            self.log_result(f"Get {role_name} info", False, "No token available")
            return None
            
        try:
            headers = {"Authorization": f"Bearer {token}"}
            response = self.session.get(f"{CRM_BASE_URL}/auth/me", headers=headers)
            
            if response.status_code == 200:
                user_data = response.json()
                self.user_data[role_name] = user_data
                
                # Check if user has team_id
                team_id = user_data.get("team_id")
                has_team = team_id is not None and team_id != ""
                
                self.log_result(
                    f"Get {role_name} info", 
                    True, 
                    f"Retrieved user info for {role_name}",
                    f"User ID: {user_data.get('id')}, Team ID: {team_id}, Has Team: {has_team}, Role: {user_data.get('role')}"
                )
                return user_data
            else:
                self.log_result(f"Get {role_name} info", False, f"Failed to get user info: {response.status_code}", response.text)
                return None
                
        except Exception as e:
            self.log_result(f"Get {role_name} info", False, f"Error getting user info: {str(e)}")
            return None
    
    def get_all_users(self):
        """Get all users to check team assignments"""
        admin_token = self.user_tokens.get("admin")
        if not admin_token:
            self.log_result("Get all users", False, "No admin token available")
            return None
            
        try:
            headers = {"Authorization": f"Bearer {admin_token}"}
            response = self.session.get(f"{CRM_BASE_URL}/users", headers=headers)
            
            if response.status_code == 200:
                users = response.json()
                self.log_result("Get all users", True, f"Retrieved {len(users)} users")
                
                # Print user details for debugging
                print("\n📋 USER DETAILS:")
                for user in users:
                    team_info = f"Team: {user.get('team_id', 'None')}" if user.get('team_id') else "Team: None"
                    print(f"  • {user.get('full_name', 'Unknown')} ({user.get('email', 'No email')}) - Role: {user.get('role', 'Unknown')} - {team_info}")
                
                return users
            else:
                self.log_result("Get all users", False, f"Failed to get users: {response.status_code}", response.text)
                return None
                
        except Exception as e:
            self.log_result("Get all users", False, f"Error getting users: {str(e)}")
            return None
    
    def test_contacts_endpoint(self, role_name):
        """Test the /chat/contacts endpoint for a specific user"""
        token = self.user_tokens.get(role_name)
        if not token:
            self.log_result(f"Contacts {role_name}", False, "No token available")
            return
            
        try:
            headers = {"Authorization": f"Bearer {token}"}
            response = self.session.get(f"{CHAT_BASE_URL}/contacts", headers=headers)
            
            if response.status_code == 200:
                contacts = response.json()
                contact_count = len(contacts)
                
                if contact_count > 0:
                    self.log_result(
                        f"Contacts {role_name}", 
                        True, 
                        f"Retrieved {contact_count} contacts for {role_name}"
                    )
                    
                    # Print contact details
                    print(f"  📞 {role_name.upper()} CONTACTS:")
                    for contact in contacts:
                        print(f"    • {contact.get('full_name', 'Unknown')} ({contact.get('email', 'No email')}) - Role: {contact.get('role', 'Unknown')}")
                else:
                    self.log_result(
                        f"Contacts {role_name}", 
                        False, 
                        f"No contacts returned for {role_name} - this explains 'Nessun contatto disponibile'",
                        f"User data: {self.user_data.get(role_name, {})}"
                    )
                
                return contacts
            else:
                self.log_result(f"Contacts {role_name}", False, f"Failed to get contacts: {response.status_code}", response.text)
                return None
                
        except Exception as e:
            self.log_result(f"Contacts {role_name}", False, f"Error getting contacts: {str(e)}")
            return None
    
    def test_send_team_message(self, sender_role):
        """Test sending a team message"""
        token = self.user_tokens.get(sender_role)
        user_data = self.user_data.get(sender_role)
        
        if not token or not user_data:
            self.log_result(f"Send team message {sender_role}", False, "No token or user data available")
            return
        
        team_id = user_data.get("team_id")
        if not team_id:
            self.log_result(f"Send team message {sender_role}", False, f"{sender_role} has no team_id - cannot send team messages")
            return
            
        try:
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            
            message_data = {
                "type": "team",
                "content": f"Test team message from {sender_role}",
                "team_id": team_id
            }
            
            response = self.session.post(
                f"{CHAT_BASE_URL}/send",
                json=message_data,
                headers=headers
            )
            
            if response.status_code == 200:
                result = response.json()
                self.log_result(
                    f"Send team message {sender_role}", 
                    True, 
                    f"Successfully sent team message",
                    f"Message ID: {result.get('message_id')}"
                )
            else:
                self.log_result(
                    f"Send team message {sender_role}", 
                    False, 
                    f"Failed to send team message: {response.status_code}",
                    response.text
                )
                
        except Exception as e:
            self.log_result(f"Send team message {sender_role}", False, f"Error sending team message: {str(e)}")
    
    def test_send_direct_message(self, sender_role, recipient_role):
        """Test sending a direct message"""
        sender_token = self.user_tokens.get(sender_role)
        recipient_data = self.user_data.get(recipient_role)
        
        if not sender_token or not recipient_data:
            self.log_result(f"Send direct message {sender_role}→{recipient_role}", False, "Missing token or recipient data")
            return
        
        recipient_id = recipient_data.get("id")
        if not recipient_id:
            self.log_result(f"Send direct message {sender_role}→{recipient_role}", False, "No recipient ID")
            return
            
        try:
            headers = {
                "Authorization": f"Bearer {sender_token}",
                "Content-Type": "application/json"
            }
            
            message_data = {
                "type": "direct",
                "content": f"Test direct message from {sender_role} to {recipient_role}",
                "recipient_id": recipient_id
            }
            
            response = self.session.post(
                f"{CHAT_BASE_URL}/send",
                json=message_data,
                headers=headers
            )
            
            if response.status_code == 200:
                result = response.json()
                self.log_result(
                    f"Send direct message {sender_role}→{recipient_role}", 
                    True, 
                    f"Successfully sent direct message",
                    f"Message ID: {result.get('message_id')}"
                )
            else:
                self.log_result(
                    f"Send direct message {sender_role}→{recipient_role}", 
                    False, 
                    f"Failed to send direct message: {response.status_code}",
                    response.text
                )
                
        except Exception as e:
            self.log_result(f"Send direct message {sender_role}→{recipient_role}", False, f"Error sending direct message: {str(e)}")
    
    def run_all_tests(self):
        """Run all chat API tests"""
        print("🚀 Starting Chat API Tests")
        print("=" * 60)
        
        # Step 1: Login all users
        print("\n1️⃣ AUTHENTICATION TESTS")
        for user in TEST_USERS:
            self.login_user(user["email"], user["password"], user["role"])
        
        # Step 2: Get user info for all users
        print("\n2️⃣ USER INFO TESTS")
        for user in TEST_USERS:
            self.get_user_info(user["role"])
        
        # Step 3: Get all users (admin only)
        print("\n3️⃣ USER LISTING TEST")
        self.get_all_users()
        
        # Step 4: Test contacts endpoint for each user
        print("\n4️⃣ CONTACTS ENDPOINT TESTS")
        for user in TEST_USERS:
            self.test_contacts_endpoint(user["role"])
        
        # Step 5: Test team messaging
        print("\n5️⃣ TEAM MESSAGING TESTS")
        for user in TEST_USERS:
            self.test_send_team_message(user["role"])
        
        # Step 6: Test direct messaging
        print("\n6️⃣ DIRECT MESSAGING TESTS")
        # Test some direct message combinations
        self.test_send_direct_message("agent", "supervisor")
        self.test_send_direct_message("supervisor", "admin")
        self.test_send_direct_message("admin", "agent")
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 CHAT API TEST SUMMARY")
        print("=" * 60)
        
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
        
        # Specific analysis for the reported issues
        print("\n🔍 ISSUE ANALYSIS:")
        print("=" * 60)
        
        # Check contacts issue
        contacts_working = any(r["success"] and "contacts" in r["test"].lower() for r in self.test_results)
        if not contacts_working:
            print("❌ CONTACTS ISSUE CONFIRMED: Users getting empty contact lists")
            print("   Possible causes:")
            print("   - Users missing team_id assignments")
            print("   - Hierarchical permission logic issues")
            print("   - Database query problems")
        
        # Check messaging issue
        messaging_working = any(r["success"] and "message" in r["test"].lower() for r in self.test_results)
        if not messaging_working:
            print("❌ MESSAGING ISSUE CONFIRMED: Messages failing to send")
            print("   Possible causes:")
            print("   - Authentication issues")
            print("   - Missing team assignments")
            print("   - Permission validation failures")
        
        return failed_tests == 0

if __name__ == "__main__":
    tester = ChatTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)