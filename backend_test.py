#!/usr/bin/env python3
"""
CRM Backend Testing Suite
Tests phone masking, mass update endpoint, and created_at field functionality
"""

import requests
import json
import sys
from datetime import datetime
import uuid

# Configuration
BASE_URL = "https://legal-rescue-2.preview.emergentagent.com/api"
CRM_BASE_URL = f"{BASE_URL}/crm"

# Test credentials
ADMIN_CREDENTIALS = {
    "email": "admin@1lawsolicitors.com",
    "password": "Admin@123456"
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
        self.test_lead_id = None
        self.test_results = []
        
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
            # Get agent user ID
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            users_response = self.session.get(f"{CRM_BASE_URL}/users", headers=headers)
            
            if users_response.status_code == 200:
                users = users_response.json()
                agent_id = None
                for user in users:
                    if user.get("role") == "agent":
                        agent_id = user.get("id")
                        break
                
                if agent_id:
                    # Assign lead to agent
                    assignment_data = {
                        "lead_id": self.test_lead_id,
                        "assigned_to": agent_id,
                        "assigned_by": "admin"
                    }
                    
                    assign_response = self.session.post(
                        f"{CRM_BASE_URL}/leads/{self.test_lead_id}/assign",
                        json=assignment_data,
                        headers=headers
                    )
                    
                    if assign_response.status_code == 200:
                        self.log_result("Assign Lead to Agent", True, "Successfully assigned lead to agent")
                    else:
                        self.log_result("Assign Lead to Agent", False, f"Failed to assign lead: {assign_response.status_code}")
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
    
    def run_all_tests(self):
        """Run all CRM backend tests"""
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
        
        # Step 4: Run all tests
        self.test_phone_masking()
        self.test_mass_update_permissions()
        self.test_mass_update_functionality()
        self.test_created_at_field()
        
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
        
        return failed_tests == 0

if __name__ == "__main__":
    tester = CRMTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)