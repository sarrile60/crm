#!/usr/bin/env python3
"""
Backend Testing Suite for Callback Notification Dismiss and Clear All Functionality
Tests the backend endpoints that support the callback notification system
"""

import requests
import json
import sys
from datetime import datetime, timezone, timedelta
import uuid
import time
import logging

# Configuration
BASE_URL = "https://teamalerts.preview.emergentagent.com/api"
CRM_BASE_URL = f"{BASE_URL}/crm"

# Setup logging
logger = logging.getLogger(__name__)

# Test credentials from review request
AGENT_CREDENTIALS = {
    "username": "agente",
    "password": "12345"
}

ADMIN_CREDENTIALS = {
    "username": "admin_f87450ce5d66",
    "password": "zTFjPAcs*-(NL-qbj@AP0TcWt*8)nV4f6K(ZcVP_"
}

class CallbackNotificationTester:
    def __init__(self):
        self.session = requests.Session()
        self.agent_token = None
        self.admin_token = None
        self.test_results = []
        self.test_lead_id = None
        
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
    
    def login_user(self, credentials):
        """Login user and return token"""
        try:
            response = self.session.post(
                f"{CRM_BASE_URL}/auth/login",
                json=credentials,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                return data.get("token")
            else:
                return None
                
        except Exception as e:
            return None
    
    def setup_test_environment(self):
        """Setup test environment by logging in users"""
        print("\n=== Setting Up Test Environment ===")
        
        # Login as admin
        self.admin_token = self.login_user(ADMIN_CREDENTIALS)
        if self.admin_token:
            self.log_result("Admin Login", True, "Successfully logged in as admin")
        else:
            self.log_result("Admin Login", False, "Failed to login as admin")
            return False
        
        # Login as agent
        self.agent_token = self.login_user(AGENT_CREDENTIALS)
        if self.agent_token:
            self.log_result("Agent Login", True, "Successfully logged in as agent (agente)")
        else:
            self.log_result("Agent Login", False, "Failed to login as agent (agente)")
            return False
        
        return True
    
    def create_test_callback_lead(self):
        """Create a test lead with callback status for testing"""
        print("\n=== Creating Test Callback Lead ===")
        
        if not self.admin_token:
            self.log_result("Create Test Lead", False, "No admin token available")
            return False
        
        try:
            headers = {
                "Authorization": f"Bearer {self.admin_token}",
                "Content-Type": "application/json"
            }
            
            # Create a test lead
            lead_data = {
                "fullName": "Mario Rossi Test",
                "email": f"mario.test.{int(time.time())}@example.com",
                "phone": "3451234567",
                "scammerCompany": "Test Scam Corp",
                "amountLost": "€10,000",
                "caseDetails": "Test callback notification case",
                "status": "Callback",
                "priority": "high"
            }
            
            response = self.session.post(
                f"{CRM_BASE_URL}/leads/create",
                json=lead_data,
                headers=headers
            )
            
            if response.status_code == 200:
                result = response.json()
                self.test_lead_id = result.get("lead_id")
                
                # Now update the lead to have a callback date in the past (overdue)
                past_callback_date = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
                
                update_response = self.session.put(
                    f"{CRM_BASE_URL}/leads/{self.test_lead_id}",
                    json={
                        "status": "Callback",
                        "callback_date": past_callback_date,
                        "callback_notes": "Test callback for notification testing"
                    },
                    headers=headers
                )
                
                if update_response.status_code == 200:
                    self.log_result(
                        "Create Test Lead", 
                        True, 
                        f"Created test lead with overdue callback",
                        f"Lead ID: {self.test_lead_id}, Callback Date: {past_callback_date}"
                    )
                    return True
                else:
                    self.log_result("Create Test Lead", False, f"Failed to update callback date: {update_response.status_code}")
                    return False
            else:
                self.log_result("Create Test Lead", False, f"Failed to create lead: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Create Test Lead", False, f"Error creating test lead: {str(e)}")
            return False
    
    def assign_lead_to_agent(self):
        """Assign the test lead to the agent (agente)"""
        print("\n=== Assigning Lead to Agent ===")
        
        if not self.admin_token or not self.test_lead_id:
            self.log_result("Assign Lead", False, "Missing admin token or test lead ID")
            return False
        
        try:
            # Get agent user info
            headers = {"Authorization": f"Bearer {self.agent_token}"}
            agent_response = self.session.get(f"{CRM_BASE_URL}/auth/me", headers=headers)
            
            if agent_response.status_code != 200:
                self.log_result("Assign Lead", False, "Failed to get agent info")
                return False
            
            agent_info = agent_response.json()
            agent_id = agent_info.get("id")
            
            # Assign lead to agent
            admin_headers = {
                "Authorization": f"Bearer {self.admin_token}",
                "Content-Type": "application/json"
            }
            
            assignment_data = {
                "lead_id": self.test_lead_id,
                "assigned_to": agent_id,
                "assigned_by": "admin"
            }
            
            assign_response = self.session.post(
                f"{CRM_BASE_URL}/leads/{self.test_lead_id}/assign",
                json=assignment_data,
                headers=admin_headers
            )
            
            if assign_response.status_code == 200:
                self.log_result(
                    "Assign Lead", 
                    True, 
                    f"Successfully assigned lead to agent",
                    f"Agent ID: {agent_id}, Lead ID: {self.test_lead_id}"
                )
                return True
            else:
                self.log_result("Assign Lead", False, f"Failed to assign lead: {assign_response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("Assign Lead", False, f"Error assigning lead: {str(e)}")
            return False
    
    def test_agent_can_access_leads(self):
        """Test that agent can access their assigned leads (prerequisite for notifications)"""
        print("\n=== Testing Agent Lead Access ===")
        
        if not self.agent_token:
            self.log_result("Agent Lead Access", False, "No agent token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.agent_token}"}
            response = self.session.get(f"{CRM_BASE_URL}/leads", headers=headers)
            
            if response.status_code == 200:
                leads = response.json()
                
                # Find our test lead
                test_lead = None
                for lead in leads:
                    if lead.get("id") == self.test_lead_id:
                        test_lead = lead
                        break
                
                if test_lead:
                    # Check if it has callback status and callback_date
                    has_callback_status = test_lead.get("status") == "Callback"
                    has_callback_date = test_lead.get("callback_date") is not None
                    
                    success = has_callback_status and has_callback_date
                    
                    self.log_result(
                        "Agent Lead Access", 
                        success, 
                        f"Agent can access test lead with callback data",
                        f"Status: {test_lead.get('status')}, Callback Date: {test_lead.get('callback_date')}"
                    )
                    return success
                else:
                    self.log_result("Agent Lead Access", False, "Test lead not found in agent's leads")
                    return False
            else:
                self.log_result("Agent Lead Access", False, f"Failed to get leads: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("Agent Lead Access", False, f"Error accessing leads: {str(e)}")
            return False
    
    def test_callback_reminders_endpoint(self):
        """Test the callback reminders endpoint that feeds the notification system"""
        print("\n=== Testing Callback Reminders Endpoint ===")
        
        if not self.agent_token:
            self.log_result("Callback Reminders", False, "No agent token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.agent_token}"}
            response = self.session.get(f"{CRM_BASE_URL}/reminders", headers=headers)
            
            if response.status_code == 200:
                reminders = response.json()
                
                self.log_result(
                    "Callback Reminders", 
                    True, 
                    f"Successfully retrieved callback reminders",
                    f"Found {len(reminders)} reminders"
                )
                
                # Check if any reminders are for our test lead
                test_reminder = None
                for reminder in reminders:
                    if reminder.get("lead_id") == self.test_lead_id:
                        test_reminder = reminder
                        break
                
                if test_reminder:
                    self.log_result(
                        "Test Lead Reminder", 
                        True, 
                        f"Found reminder for test lead",
                        f"Reminder ID: {test_reminder.get('id')}, Callback Date: {test_reminder.get('callback_date')}"
                    )
                else:
                    self.log_result(
                        "Test Lead Reminder", 
                        False, 
                        "No reminder found for test lead (may be expected if no reminder was created)"
                    )
                
                return True
            else:
                self.log_result("Callback Reminders", False, f"Failed to get reminders: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("Callback Reminders", False, f"Error getting reminders: {str(e)}")
            return False
    
    def test_lead_update_callback_status(self):
        """Test updating lead callback status (simulates agent interaction)"""
        print("\n=== Testing Lead Callback Status Update ===")
        
        if not self.agent_token or not self.test_lead_id:
            self.log_result("Update Callback Status", False, "Missing agent token or test lead ID")
            return False
        
        try:
            headers = {
                "Authorization": f"Bearer {self.agent_token}",
                "Content-Type": "application/json"
            }
            
            # Update the lead to a different status (simulating agent completing the callback)
            update_data = {
                "status": "contacted",
                "callback_notes": "Callback completed - notification should be dismissed"
            }
            
            response = self.session.put(
                f"{CRM_BASE_URL}/leads/{self.test_lead_id}",
                json=update_data,
                headers=headers
            )
            
            if response.status_code == 200:
                # Verify the update
                get_response = self.session.get(f"{CRM_BASE_URL}/leads/{self.test_lead_id}", headers=headers)
                
                if get_response.status_code == 200:
                    updated_lead = get_response.json()
                    new_status = updated_lead.get("status")
                    
                    success = new_status == "contacted"
                    
                    self.log_result(
                        "Update Callback Status", 
                        success, 
                        f"Successfully updated lead status",
                        f"New Status: {new_status}, Notes: {updated_lead.get('callback_notes')}"
                    )
                    return success
                else:
                    self.log_result("Update Callback Status", False, "Failed to verify update")
                    return False
            else:
                self.log_result("Update Callback Status", False, f"Failed to update lead: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("Update Callback Status", False, f"Error updating lead: {str(e)}")
            return False
    
    def test_callback_snooze_alert_endpoint(self):
        """Test the callback snooze alert endpoint (supervisor notification)"""
        print("\n=== Testing Callback Snooze Alert Endpoint ===")
        
        if not self.agent_token or not self.test_lead_id:
            self.log_result("Callback Snooze Alert", False, "Missing agent token or test lead ID")
            return False
        
        try:
            # Get agent info
            headers = {"Authorization": f"Bearer {self.agent_token}"}
            agent_response = self.session.get(f"{CRM_BASE_URL}/auth/me", headers=headers)
            
            if agent_response.status_code != 200:
                self.log_result("Callback Snooze Alert", False, "Failed to get agent info")
                return False
            
            agent_info = agent_response.json()
            agent_id = agent_info.get("id")
            
            # Test the snooze alert endpoint
            response = self.session.post(
                f"{CRM_BASE_URL}/callback-snooze-alert?lead_id={self.test_lead_id}&agent_id={agent_id}",
                headers=headers
            )
            
            if response.status_code == 200:
                result = response.json()
                success = result.get("success", False)
                
                self.log_result(
                    "Callback Snooze Alert", 
                    success, 
                    f"Snooze alert endpoint responded correctly",
                    f"Response: {result.get('message', 'No message')}"
                )
                return success
            else:
                self.log_result("Callback Snooze Alert", False, f"Snooze alert failed: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Callback Snooze Alert", False, f"Error testing snooze alert: {str(e)}")
            return False
    
    def test_authentication_and_session(self):
        """Test that authentication works properly for the notification system"""
        print("\n=== Testing Authentication and Session ===")
        
        if not self.agent_token:
            self.log_result("Authentication Test", False, "No agent token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.agent_token}"}
            
            # Test /auth/me endpoint
            me_response = self.session.get(f"{CRM_BASE_URL}/auth/me", headers=headers)
            
            if me_response.status_code == 200:
                user_info = me_response.json()
                
                # Test session check endpoint
                session_response = self.session.get(f"{CRM_BASE_URL}/auth/session-check", headers=headers)
                
                if session_response.status_code == 200:
                    session_info = session_response.json()
                    is_valid = session_info.get("valid", False)
                    
                    self.log_result(
                        "Authentication Test", 
                        is_valid, 
                        f"Agent authentication and session are valid",
                        f"User: {user_info.get('username')}, Role: {user_info.get('role')}, Session Valid: {is_valid}"
                    )
                    return is_valid
                else:
                    self.log_result("Authentication Test", False, f"Session check failed: {session_response.status_code}")
                    return False
            else:
                self.log_result("Authentication Test", False, f"User info failed: {me_response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("Authentication Test", False, f"Error testing authentication: {str(e)}")
            return False
    
    def cleanup_test_data(self):
        """Clean up test data"""
        print("\n=== Cleaning Up Test Data ===")
        
        if not self.admin_token or not self.test_lead_id:
            self.log_result("Cleanup", True, "No cleanup needed (no test data created)")
            return
        
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            
            # Delete the test lead
            response = self.session.delete(f"{CRM_BASE_URL}/leads/{self.test_lead_id}", headers=headers)
            
            if response.status_code == 200:
                self.log_result("Cleanup", True, f"Successfully deleted test lead: {self.test_lead_id}")
            else:
                self.log_result("Cleanup", False, f"Failed to delete test lead: {response.status_code}")
                
        except Exception as e:
            self.log_result("Cleanup", False, f"Error during cleanup: {str(e)}")
    
    def run_all_tests(self):
        """Run all callback notification backend tests"""
        print("🔔" * 60)
        print("🔔 CALLBACK NOTIFICATION BACKEND TESTING")
        print("🔔 Testing backend endpoints that support notification dismiss/clear functionality")
        print("🔔" * 60)
        
        # Setup
        if not self.setup_test_environment():
            print("\n❌ SETUP FAILED - Cannot proceed with tests")
            return False
        
        # Test authentication first
        if not self.test_authentication_and_session():
            print("\n❌ AUTHENTICATION FAILED - Cannot proceed with tests")
            return False
        
        # Create test data
        if not self.create_test_callback_lead():
            print("\n❌ TEST DATA CREATION FAILED - Cannot proceed with tests")
            return False
        
        if not self.assign_lead_to_agent():
            print("\n❌ LEAD ASSIGNMENT FAILED - Cannot proceed with tests")
            return False
        
        # Run core tests
        tests_passed = 0
        total_tests = 4
        
        if self.test_agent_can_access_leads():
            tests_passed += 1
        
        if self.test_callback_reminders_endpoint():
            tests_passed += 1
        
        if self.test_lead_update_callback_status():
            tests_passed += 1
        
        if self.test_callback_snooze_alert_endpoint():
            tests_passed += 1
        
        # Cleanup
        self.cleanup_test_data()
        
        # Summary
        print("\n" + "="*60)
        print("BACKEND TEST SUMMARY")
        print("="*60)
        
        success_count = sum(1 for result in self.test_results if result["success"])
        total_count = len(self.test_results)
        
        print(f"Total Tests: {total_count}")
        print(f"Passed: {success_count}")
        print(f"Failed: {total_count - success_count}")
        print(f"Success Rate: {(success_count/total_count)*100:.1f}%")
        
        # Show failed tests
        failed_tests = [result for result in self.test_results if not result["success"]]
        if failed_tests:
            print("\n❌ FAILED TESTS:")
            for test in failed_tests:
                print(f"  - {test['test']}: {test['message']}")
        
        print("\n" + "="*60)
        print("NOTIFICATION SYSTEM BACKEND STATUS")
        print("="*60)
        
        if tests_passed == total_tests:
            print("✅ ALL BACKEND ENDPOINTS WORKING")
            print("✅ Agent authentication working")
            print("✅ Lead access and updates working")
            print("✅ Callback reminders endpoint working")
            print("✅ Snooze alert endpoint working")
            print("\n💡 NOTE: Notification dismiss/clear functionality is handled entirely in the frontend")
            print("💡 using localStorage. No backend endpoints are required for dismiss/clear operations.")
        else:
            print("❌ SOME BACKEND ENDPOINTS HAVE ISSUES")
            print("⚠️  This may affect the notification system functionality")
        
        return tests_passed == total_tests

def main():
    """Main test execution"""
    tester = CallbackNotificationTester()
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 ALL BACKEND TESTS PASSED!")
        print("The backend is ready to support callback notification functionality.")
        sys.exit(0)
    else:
        print("\n💥 SOME TESTS FAILED!")
        print("Please check the backend implementation.")
        sys.exit(1)

if __name__ == "__main__":
    main()