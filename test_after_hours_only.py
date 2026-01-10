#!/usr/bin/env python3
"""
Focused After-Hours Login Approval Test
Tests the specific scenario described in the review request
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://leadhub-32.preview.emergentagent.com/api"
CRM_BASE_URL = f"{BASE_URL}/crm"

# Test credentials from review request
ADMIN_CREDENTIALS = {
    "username": "admin_f87450ce5d66",
    "password": "zTFjPAcs*-(NL-qbj@AP0TcWt*8)nV4f6K(ZcVP_"
}

AGENT_CREDENTIALS = {
    "username": "agente", 
    "password": "12345"
}

class AfterHoursTest:
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
    
    def setup_after_hours_scenario(self):
        """Set session end time to 14:30 to force after-hours mode"""
        print("\n=== Setting up After-Hours Scenario ===")
        
        try:
            admin_headers = {
                "Authorization": f"Bearer {self.admin_token}",
                "Content-Type": "application/json"
            }
            
            # Set session end time to 14:30 (current time is ~14:50)
            session_config = {
                "session_end_hour": 14,
                "session_end_minute": 30
            }
            
            response = self.session.put(
                f"{BASE_URL}/admin/session-settings",
                json=session_config,
                headers=admin_headers
            )
            
            if response.status_code == 200:
                self.log_result(
                    "Setup After-Hours Scenario", 
                    True,
                    "Session end time set to 14:30 (current time ~14:50 = after hours)",
                    "This forces the after-hours approval requirement"
                )
                return True
            else:
                self.log_result("Setup After-Hours Scenario", False, f"Failed to update session: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Setup After-Hours Scenario", False, f"Error: {str(e)}")
            return False
    
    def test_complete_after_hours_flow(self):
        """Test the complete after-hours login approval flow"""
        print("\n" + "🕐" * 60)
        print("🕐 TESTING COMPLETE AFTER-HOURS LOGIN APPROVAL FLOW")
        print("🕐 Session end: 14:30, Current time: ~14:50 (AFTER HOURS)")
        print("🕐" * 60)
        
        # Step 1: Test After-Hours Login Block
        print("\n=== Step 1: Testing After-Hours Login Block ===")
        try:
            response = self.session.post(
                f"{CRM_BASE_URL}/auth/login",
                json=AGENT_CREDENTIALS,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 403:
                error_detail = ""
                try:
                    error_data = response.json()
                    error_detail = error_data.get("detail", "")
                except:
                    error_detail = response.text
                
                # Check for specific error format: "after_hours_approval_required:after_work_hours:14:30"
                expected_pattern = "after_hours_approval_required:after_work_hours:14:30"
                has_correct_error = expected_pattern in error_detail
                
                self.log_result(
                    "After-Hours Login Block", 
                    has_correct_error,
                    f"Login correctly blocked with expected error format",
                    f"Error: '{error_detail}', Expected pattern: '{expected_pattern}'"
                )
                
                if not has_correct_error:
                    return False
                    
            else:
                self.log_result("After-Hours Login Block", False, f"Expected 403, got {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("After-Hours Login Block", False, f"Error: {str(e)}")
            return False
        
        # Step 2: Check Pending Requests
        print("\n=== Step 2: Checking Pending Login Requests ===")
        try:
            admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
            requests_response = self.session.get(f"{BASE_URL}/admin/login-requests", headers=admin_headers)
            
            if requests_response.status_code == 200:
                requests_data = requests_response.json()
                pending_requests = requests_data.get("requests", [])
                agente_requests = [r for r in pending_requests if r.get("username") == "agente"]
                
                if agente_requests:
                    request_id = agente_requests[0].get("id")
                    self.log_result(
                        "Check Pending Requests", 
                        True,
                        f"Found pending request for agente",
                        f"Request ID: {request_id}, Status: {agente_requests[0].get('status')}"
                    )
                    
                    # Step 3: Approve the Request
                    print("\n=== Step 3: Approving Login Request ===")
                    approve_response = self.session.post(
                        f"{BASE_URL}/admin/login-requests/{request_id}/approve",
                        headers={**admin_headers, "Content-Type": "application/json"}
                    )
                    
                    if approve_response.status_code == 200:
                        approval_data = approve_response.json()
                        expires_at = approval_data.get("expires_at")
                        duration_minutes = approval_data.get("duration_minutes", 30)
                        
                        self.log_result(
                            "Approve Request", 
                            True,
                            f"Request approved successfully",
                            f"Expires: {expires_at}, Duration: {duration_minutes} minutes"
                        )
                        
                        # Step 4: Test Login After Approval
                        print("\n=== Step 4: Testing Login After Approval ===")
                        time.sleep(1)  # Brief delay for approval processing
                        
                        login_response = self.session.post(
                            f"{CRM_BASE_URL}/auth/login",
                            json=AGENT_CREDENTIALS,
                            headers={"Content-Type": "application/json"}
                        )
                        
                        if login_response.status_code == 200:
                            login_data = login_response.json()
                            agent_token = login_data.get("token")
                            user_info = login_data.get("user", {})
                            
                            self.log_result(
                                "Login After Approval", 
                                True,
                                f"Login successful after approval",
                                f"User: {user_info.get('username')}, Token received: {len(agent_token) if agent_token else 0} chars"
                            )
                            
                            if agent_token:
                                # Step 5: CRITICAL - Test Session Check After Approval
                                print("\n=== Step 5: CRITICAL - Testing Session Check After Approval ===")
                                self.test_session_check_after_approval(agent_token)
                                
                                # Step 6: Test Dashboard Access
                                print("\n=== Step 6: Testing Dashboard Access ===")
                                self.test_dashboard_access_after_approval(agent_token)
                                
                                return True
                            else:
                                self.log_result("Token Validation", False, "No token received in login response")
                                return False
                        else:
                            self.log_result("Login After Approval", False, f"Login failed: {login_response.status_code}", login_response.text)
                            return False
                    else:
                        self.log_result("Approve Request", False, f"Approval failed: {approve_response.status_code}", approve_response.text)
                        return False
                else:
                    self.log_result("Check Pending Requests", False, "No pending request found for agente")
                    return False
            else:
                self.log_result("Check Pending Requests", False, f"Failed to get requests: {requests_response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("Check Pending Requests", False, f"Error: {str(e)}")
            return False
    
    def test_session_check_after_approval(self, agent_token):
        """Test the critical session check functionality after approval"""
        try:
            headers = {"Authorization": f"Bearer {agent_token}"}
            session_response = self.session.get(f"{CRM_BASE_URL}/auth/session-check", headers=headers)
            
            if session_response.status_code == 200:
                session_data = session_response.json()
                is_valid = session_data.get("valid", False)
                session_info = session_data.get("session_info", {})
                has_after_hours_approval = session_info.get("has_after_hours_approval", False)
                
                # This is the CRITICAL test - session should be valid with approval
                success = is_valid and has_after_hours_approval
                
                self.log_result(
                    "Session Check After Approval - CRITICAL", 
                    success,
                    f"Session check returns valid: {is_valid}, has_after_hours_approval: {has_after_hours_approval}",
                    f"Full response: valid={is_valid}, has_approval={has_after_hours_approval}, message='{session_data.get('message', '')}'"
                )
                
                if not success:
                    # This was the main bug - log detailed info for debugging
                    self.log_result(
                        "Session Check Analysis", 
                        False,
                        "CRITICAL BUG: Session check should return valid=true for approved users",
                        f"Session info: {session_info}"
                    )
            else:
                self.log_result("Session Check After Approval", False, f"Session check failed: {session_response.status_code}", session_response.text)
                
        except Exception as e:
            self.log_result("Session Check After Approval", False, f"Error: {str(e)}")
    
    def test_dashboard_access_after_approval(self, agent_token):
        """Test dashboard access after successful after-hours login"""
        try:
            headers = {"Authorization": f"Bearer {agent_token}"}
            
            # Test /api/crm/auth/me
            me_response = self.session.get(f"{CRM_BASE_URL}/auth/me", headers=headers)
            
            if me_response.status_code == 200:
                user_data = me_response.json()
                self.log_result(
                    "Dashboard Access - User Info", 
                    True,
                    f"Can access user info after after-hours login",
                    f"User: {user_data.get('full_name')}, Role: {user_data.get('role')}"
                )
            else:
                self.log_result("Dashboard Access - User Info", False, f"Cannot access user info: {me_response.status_code}")
            
            # Test /api/crm/dashboard/stats
            stats_response = self.session.get(f"{CRM_BASE_URL}/dashboard/stats", headers=headers)
            
            if stats_response.status_code == 200:
                stats_data = stats_response.json()
                self.log_result(
                    "Dashboard Access - Stats", 
                    True,
                    f"Can access dashboard stats after after-hours login",
                    f"Total leads: {stats_data.get('total_leads', 0)}, New: {stats_data.get('new_leads', 0)}"
                )
            else:
                self.log_result("Dashboard Access - Stats", False, f"Cannot access dashboard stats: {stats_response.status_code}")
                
        except Exception as e:
            self.log_result("Dashboard Access", False, f"Error: {str(e)}")
    
    def run_test(self):
        """Run the complete after-hours test"""
        print("🚀 Starting After-Hours Login Approval Test")
        print("=" * 60)
        
        # Step 1: Login as admin
        if not self.login_admin():
            print("❌ Cannot proceed without admin login")
            return False
        
        # Step 2: Setup after-hours scenario
        if not self.setup_after_hours_scenario():
            print("❌ Cannot proceed without proper session setup")
            return False
        
        # Step 3: Run the complete flow test
        success = self.test_complete_after_hours_flow()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
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
        
        return success

if __name__ == "__main__":
    tester = AfterHoursTest()
    success = tester.run_test()
    exit(0 if success else 1)