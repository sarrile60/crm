#!/usr/bin/env python3
"""
After-Hours Login Approval System Testing
Focused test for the specific review request
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://crm-workflow-13.preview.emergentagent.com/api"
CRM_BASE_URL = f"{BASE_URL}/crm"

# Test credentials
ADMIN_CREDENTIALS = {
    "username": "admin_f87450ce5d66",
    "password": "zTFjPAcs*-(NL-qbj@AP0TcWt*8)nV4f6K(ZcVP_"
}

AGENT_CREDENTIALS = {
    "username": "maurizio1", 
    "password": "12345"
}

class AfterHoursTester:
    def __init__(self):
        self.session = requests.Session()
        self.admin_token = None
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
    
    def test_duplicate_prevention(self):
        """Test 1: Verify duplicate prevention"""
        print("\n=== Test 1: Verify Duplicate Prevention ===")
        
        # Clear any existing requests first
        try:
            admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
            clear_response = self.session.delete(f"{BASE_URL}/admin/login-requests/clear-expired", headers=admin_headers)
        except:
            pass
        
        # Try to login as maurizio1 multiple times (3+ times)
        login_attempts = []
        for i in range(3):
            try:
                response = self.session.post(
                    f"{CRM_BASE_URL}/auth/login",
                    json=AGENT_CREDENTIALS,
                    headers={"Content-Type": "application/json"}
                )
                login_attempts.append({
                    "attempt": i + 1,
                    "status_code": response.status_code,
                    "response_text": response.text[:200]  # First 200 chars
                })
                time.sleep(0.5)  # Small delay between attempts
            except Exception as e:
                login_attempts.append({
                    "attempt": i + 1,
                    "error": str(e)
                })
        
        # Check admin's pending requests - should be only ONE for maurizio1
        try:
            admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
            requests_response = self.session.get(f"{BASE_URL}/admin/login-requests", headers=admin_headers)
            
            if requests_response.status_code == 200:
                requests_data = requests_response.json()
                pending_requests = requests_data.get("requests", [])
                maurizio_requests = [r for r in pending_requests if r.get("username") == "maurizio1"]
                
                success = len(maurizio_requests) == 1
                self.log_result(
                    "Test 1 - Duplicate Prevention", 
                    success,
                    f"Expected 1 pending request, found {len(maurizio_requests)}",
                    f"Login attempts: {len(login_attempts)}, Pending requests: {len(maurizio_requests)}"
                )
                
                if maurizio_requests:
                    self.maurizio_request_id = maurizio_requests[0].get("id")
                    return True
            else:
                self.log_result("Test 1 - Get Requests", False, f"Failed to get requests: {requests_response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("Test 1 - Get Requests", False, f"Error: {str(e)}")
            return False
    
    def test_approval_workflow(self):
        """Test 2: Verify approval works"""
        print("\n=== Test 2: Verify Approval Works ===")
        
        if not hasattr(self, 'maurizio_request_id'):
            self.log_result("Test 2 - Setup", False, "No request ID from Test 1")
            return False
        
        # Step 1: Get the request_id for maurizio1 (already have it)
        # Step 2: Approve the request
        try:
            admin_headers = {
                "Authorization": f"Bearer {self.admin_token}",
                "Content-Type": "application/json"
            }
            
            approve_response = self.session.post(
                f"{BASE_URL}/admin/login-requests/{self.maurizio_request_id}/approve",
                headers=admin_headers
            )
            
            if approve_response.status_code == 200:
                approval_data = approve_response.json()
                self.log_result(
                    "Test 2 - Approve Request", 
                    True,
                    "Request approved successfully",
                    f"Duration: {approval_data.get('duration_minutes', 30)} minutes"
                )
            else:
                self.log_result("Test 2 - Approve Request", False, f"Approval failed: {approve_response.status_code}", approve_response.text)
                return False
                
        except Exception as e:
            self.log_result("Test 2 - Approve Request", False, f"Error: {str(e)}")
            return False
        
        # Step 3: Now try to login as maurizio1 - should succeed and get a token
        try:
            time.sleep(2)  # Brief delay to ensure approval is processed
            
            login_response = self.session.post(
                f"{CRM_BASE_URL}/auth/login",
                json=AGENT_CREDENTIALS,
                headers={"Content-Type": "application/json"}
            )
            
            if login_response.status_code == 200:
                login_data = login_response.json()
                token = login_data.get("token")
                user_info = login_data.get("user", {})
                
                success = token is not None and len(token) > 0
                self.log_result(
                    "Test 2 - Login After Approval", 
                    success,
                    "Agent successfully logged in after approval",
                    f"User: {user_info.get('username')}, Token length: {len(token) if token else 0}"
                )
                return success
                
            else:
                self.log_result("Test 2 - Login After Approval", False, f"Login failed: {login_response.status_code}", login_response.text[:200])
                return False
                
        except Exception as e:
            self.log_result("Test 2 - Login After Approval", False, f"Error: {str(e)}")
            return False
    
    def test_error_message_format(self):
        """Test 3: Verify the error message format"""
        print("\n=== Test 3: Verify Error Message Format ===")
        
        # Clear any approvals for maurizio1
        try:
            admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
            clear_response = self.session.delete(f"{BASE_URL}/admin/login-requests/clear-expired", headers=admin_headers)
        except:
            pass
        
        # Try to login as maurizio1 (should fail with proper error format)
        try:
            login_response = self.session.post(
                f"{CRM_BASE_URL}/auth/login",
                json=AGENT_CREDENTIALS,
                headers={"Content-Type": "application/json"}
            )
            
            if login_response.status_code == 403:
                error_detail = ""
                try:
                    error_data = login_response.json()
                    error_detail = error_data.get("detail", "")
                except:
                    error_detail = login_response.text
                
                # Check format: after_hours_approval_required:after_work_hours:HH:MM
                expected_format = "after_hours_approval_required:"
                has_expected_format = error_detail.startswith(expected_format)
                
                # Check if it contains time information (HH:MM format)
                import re
                has_time_format = bool(re.search(r'\d{1,2}:\d{2}', error_detail))
                
                # Check it's not hardcoded Italian
                is_not_italian = "Notifiche" not in error_detail and "fuori orario" not in error_detail.lower()
                
                success = has_expected_format and has_time_format and is_not_italian
                
                self.log_result(
                    "Test 3 - Error Message Format", 
                    success,
                    f"Error message format correct: {success}",
                    f"Message: '{error_detail}', Format OK: {has_expected_format}, Has time: {has_time_format}, Not Italian: {is_not_italian}"
                )
                return success
                
            else:
                self.log_result("Test 3 - Error Message Format", False, f"Expected 403, got {login_response.status_code}", login_response.text[:200])
                return False
                
        except Exception as e:
            self.log_result("Test 3 - Error Message Format", False, f"Error: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all after-hours login approval tests"""
        print("🕐" * 60)
        print("🕐 AFTER-HOURS LOGIN APPROVAL SYSTEM TESTING")
        print("🕐" * 60)
        
        # Login as admin
        if not self.login_admin():
            print("❌ Cannot proceed without admin login")
            return False
        
        # Run the three test scenarios
        test1_success = self.test_duplicate_prevention()
        test2_success = self.test_approval_workflow()
        test3_success = self.test_error_message_format()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 AFTER-HOURS TESTING SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        # Test scenario results
        print(f"\n📋 TEST SCENARIO RESULTS:")
        print(f"Test 1 (Duplicate Prevention): {'✅ PASS' if test1_success else '❌ FAIL'}")
        print(f"Test 2 (Approval Workflow): {'✅ PASS' if test2_success else '❌ FAIL'}")
        print(f"Test 3 (Error Message Format): {'✅ PASS' if test3_success else '❌ FAIL'}")
        
        if failed_tests > 0:
            print("\n🔍 FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  • {result['test']}: {result['message']}")
                    if result["details"]:
                        print(f"    Details: {result['details']}")
        
        return failed_tests == 0

if __name__ == "__main__":
    tester = AfterHoursTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)