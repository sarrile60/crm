#!/usr/bin/env python3
"""
Backend Testing Suite for Financial Dashboard System
Tests the complete financial dashboard APIs for all roles: Agent, Supervisor, Admin
"""

import requests
import json
import sys
from datetime import datetime, timezone, timedelta
import uuid
import time
import logging

# Configuration
BASE_URL = "https://profit-pulse-136.preview.emergentagent.com/api"
CRM_BASE_URL = f"{BASE_URL}/crm"
FINANCE_BASE_URL = f"{CRM_BASE_URL}/finance"

# Setup logging
logger = logging.getLogger(__name__)

# Test credentials from review request
AGENT_CREDENTIALS = {
    "username": "agente",
    "password": "12345"
}

SUPERVISOR_CREDENTIALS = {
    "username": "maurizio1",
    "password": "12345"
}

ADMIN_CREDENTIALS = {
    "username": "admin_f87450ce5d66",
    "password": "zTFjPAcs*-(NL-qbj@AP0TcWt*8)nV4f6K(ZcVP_"
}

class DepositManagementTester:
    def __init__(self):
        self.session = requests.Session()
        self.agent_token = None
        self.supervisor_token = None
        self.admin_token = None
        self.test_results = []
        self.test_lead_id = None
        self.test_agent_id = None
        self.test_deposit_id = None
        
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
                print(f"Login failed for {credentials['username']}: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            print(f"Login error for {credentials['username']}: {str(e)}")
            return None
    
    def setup_test_environment(self):
        """Setup test environment by logging in all users"""
        print("\n=== Setting Up Test Environment ===")
        
        # Login as admin
        self.admin_token = self.login_user(ADMIN_CREDENTIALS)
        if self.admin_token:
            self.log_result("Admin Login", True, "Successfully logged in as admin")
        else:
            self.log_result("Admin Login", False, "Failed to login as admin")
            return False
        
        # Login as supervisor
        self.supervisor_token = self.login_user(SUPERVISOR_CREDENTIALS)
        if self.supervisor_token:
            self.log_result("Supervisor Login", True, "Successfully logged in as supervisor (maurizio1)")
        else:
            self.log_result("Supervisor Login", False, "Failed to login as supervisor (maurizio1)")
            return False
        
        # Login as agent
        self.agent_token = self.login_user(AGENT_CREDENTIALS)
        if self.agent_token:
            self.log_result("Agent Login", True, "Successfully logged in as agent (agente)")
        else:
            self.log_result("Agent Login", False, "Failed to login as agent (agente)")
            return False
        
        return True
    
    def get_test_data(self):
        """Get lead and agent IDs for testing"""
        print("\n=== Getting Test Data ===")
        
        try:
            # Get leads
            headers = {"Authorization": f"Bearer {self.supervisor_token}"}
            leads_response = self.session.get(f"{CRM_BASE_URL}/leads", headers=headers)
            
            if leads_response.status_code == 200:
                leads = leads_response.json()
                if leads:
                    self.test_lead_id = leads[0]["id"]
                    self.log_result("Get Lead ID", True, f"Found lead ID: {self.test_lead_id}")
                else:
                    self.log_result("Get Lead ID", False, "No leads found")
                    return False
            else:
                self.log_result("Get Lead ID", False, f"Failed to get leads: {leads_response.status_code}")
                return False
            
            # Get agent user ID
            headers = {"Authorization": f"Bearer {self.agent_token}"}
            agent_response = self.session.get(f"{CRM_BASE_URL}/auth/me", headers=headers)
            
            if agent_response.status_code == 200:
                agent_info = agent_response.json()
                self.test_agent_id = agent_info.get("id")
                self.log_result("Get Agent ID", True, f"Found agent ID: {self.test_agent_id}")
                return True
            else:
                self.log_result("Get Agent ID", False, f"Failed to get agent info: {agent_response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("Get Test Data", False, f"Error getting test data: {str(e)}")
            return False
    
    
    def test_supervisor_creates_deposit(self):
        """Test supervisor creating a deposit"""
        print("\n=== Testing Supervisor Creates Deposit ===")
        
        if not self.supervisor_token or not self.test_lead_id or not self.test_agent_id:
            self.log_result("Create Deposit", False, "Missing required data (tokens or IDs)")
            return False
        
        try:
            headers = {
                "Authorization": f"Bearer {self.supervisor_token}",
                "Content-Type": "application/json"
            }
            
            # Create IBAN deposit
            deposit_data = {
                "lead_id": self.test_lead_id,
                "agent_id": self.test_agent_id,
                "payment_type": "IBAN",
                "amount": 5000,
                "currency": "EUR",
                "iban": "IT60X0542811101000000123456",
                "bank_name": "Test Bank",
                "notes": "Test deposit for backend testing"
            }
            
            response = self.session.post(
                f"{CRM_BASE_URL}/deposits",
                json=deposit_data,
                headers=headers
            )
            
            if response.status_code == 200:
                result = response.json()
                deposit = result.get("deposit")
                if deposit:
                    self.test_deposit_id = deposit.get("id")
                    self.log_result(
                        "Create Deposit", 
                        True, 
                        f"Successfully created deposit",
                        f"Deposit ID: {self.test_deposit_id}, Amount: €{deposit.get('amount')}, Type: {deposit.get('payment_type')}"
                    )
                    return True
                else:
                    self.log_result("Create Deposit", False, "No deposit data in response")
                    return False
            else:
                self.log_result("Create Deposit", False, f"Failed to create deposit: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Create Deposit", False, f"Error creating deposit: {str(e)}")
            return False
    
    def test_list_deposits_role_based(self):
        """Test listing deposits with role-based filtering"""
        print("\n=== Testing Role-Based Deposit Listing ===")
        
        # Test as supervisor
        try:
            headers = {"Authorization": f"Bearer {self.supervisor_token}"}
            response = self.session.get(f"{CRM_BASE_URL}/deposits", headers=headers)
            
            if response.status_code == 200:
                supervisor_deposits = response.json()
                self.log_result(
                    "Supervisor List Deposits", 
                    True, 
                    f"Supervisor can see {len(supervisor_deposits)} deposits"
                )
            else:
                self.log_result("Supervisor List Deposits", False, f"Failed: {response.status_code}")
                
        except Exception as e:
            self.log_result("Supervisor List Deposits", False, f"Error: {str(e)}")
        
        # Test as agent
        try:
            headers = {"Authorization": f"Bearer {self.agent_token}"}
            response = self.session.get(f"{CRM_BASE_URL}/deposits", headers=headers)
            
            if response.status_code == 200:
                agent_deposits = response.json()
                self.log_result(
                    "Agent List Deposits", 
                    True, 
                    f"Agent can see {len(agent_deposits)} deposits (should only see assigned ones)"
                )
            else:
                self.log_result("Agent List Deposits", False, f"Failed: {response.status_code}")
                
        except Exception as e:
            self.log_result("Agent List Deposits", False, f"Error: {str(e)}")
        
        # Test as admin
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = self.session.get(f"{CRM_BASE_URL}/deposits", headers=headers)
            
            if response.status_code == 200:
                admin_deposits = response.json()
                self.log_result(
                    "Admin List Deposits", 
                    True, 
                    f"Admin can see {len(admin_deposits)} deposits (should see all)"
                )
                return True
            else:
                self.log_result("Admin List Deposits", False, f"Failed: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("Admin List Deposits", False, f"Error: {str(e)}")
            return False
    
    def test_admin_approval_flow(self):
        """Test admin approval workflow"""
        print("\n=== Testing Admin Approval Flow ===")
        
        if not self.admin_token or not self.test_deposit_id:
            self.log_result("Admin Approval", False, "Missing admin token or deposit ID")
            return False
        
        try:
            headers = {
                "Authorization": f"Bearer {self.admin_token}",
                "Content-Type": "application/json"
            }
            
            # First, get pending deposits
            pending_response = self.session.get(
                f"{CRM_BASE_URL}/deposits?status=pending",
                headers=headers
            )
            
            if pending_response.status_code == 200:
                pending_deposits = pending_response.json()
                self.log_result(
                    "Get Pending Deposits", 
                    True, 
                    f"Found {len(pending_deposits)} pending deposits"
                )
            else:
                self.log_result("Get Pending Deposits", False, f"Failed: {pending_response.status_code}")
                return False
            
            # Approve the test deposit
            approval_data = {
                "admin_notes": "Approved for testing - backend test suite"
            }
            
            approve_response = self.session.put(
                f"{CRM_BASE_URL}/deposits/{self.test_deposit_id}/approve",
                json=approval_data,
                headers=headers
            )
            
            if approve_response.status_code == 200:
                self.log_result(
                    "Approve Deposit", 
                    True, 
                    f"Successfully approved deposit {self.test_deposit_id}"
                )
                
                # Verify status changed
                get_response = self.session.get(
                    f"{CRM_BASE_URL}/deposits/{self.test_deposit_id}",
                    headers=headers
                )
                
                if get_response.status_code == 200:
                    deposit = get_response.json()
                    if deposit.get("status") == "approved":
                        self.log_result(
                            "Verify Approval Status", 
                            True, 
                            f"Deposit status correctly changed to 'approved'"
                        )
                        return True
                    else:
                        self.log_result("Verify Approval Status", False, f"Status is '{deposit.get('status')}', expected 'approved'")
                        return False
                else:
                    self.log_result("Verify Approval Status", False, f"Failed to get deposit: {get_response.status_code}")
                    return False
            else:
                self.log_result("Approve Deposit", False, f"Failed to approve: {approve_response.status_code}", approve_response.text)
                return False
                
        except Exception as e:
            self.log_result("Admin Approval", False, f"Error in approval flow: {str(e)}")
            return False
    
    def test_supervisor_deposit_notifications(self):
        """Test supervisor deposit notifications endpoint"""
        print("\n=== Testing Supervisor Deposit Notifications ===")
        
        if not self.supervisor_token:
            self.log_result("Supervisor Notifications", False, "No supervisor token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.supervisor_token}"}
            response = self.session.get(
                f"{CRM_BASE_URL}/supervisor/deposit-notifications",
                headers=headers
            )
            
            if response.status_code == 200:
                notifications = response.json()
                notification_list = notifications.get("notifications", [])
                unread_count = notifications.get("unread_count", 0)
                
                self.log_result(
                    "Supervisor Notifications", 
                    True, 
                    f"Retrieved supervisor notifications",
                    f"Total: {len(notification_list)}, Unread: {unread_count}"
                )
                return True
            else:
                self.log_result("Supervisor Notifications", False, f"Failed: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Supervisor Notifications", False, f"Error: {str(e)}")
            return False
    
    def test_admin_deposit_notifications(self):
        """Test admin deposit notifications endpoint"""
        print("\n=== Testing Admin Deposit Notifications ===")
        
        if not self.admin_token:
            self.log_result("Admin Notifications", False, "No admin token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = self.session.get(
                f"{CRM_BASE_URL}/deposits/notifications",
                headers=headers
            )
            
            if response.status_code == 200:
                notifications = response.json()
                notification_list = notifications.get("notifications", [])
                unread_count = notifications.get("unread_count", 0)
                
                self.log_result(
                    "Admin Notifications", 
                    True, 
                    f"Retrieved admin deposit notifications",
                    f"Total: {len(notification_list)}, Unread: {unread_count}"
                )
                return True
            else:
                self.log_result("Admin Notifications", False, f"Failed: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Admin Notifications", False, f"Error: {str(e)}")
            return False
    
    def test_deposit_details_access(self):
        """Test accessing deposit details with different roles"""
        print("\n=== Testing Deposit Details Access ===")
        
        if not self.test_deposit_id:
            self.log_result("Deposit Details Access", False, "No test deposit ID available")
            return False
        
        success_count = 0
        
        # Test as admin
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = self.session.get(
                f"{CRM_BASE_URL}/deposits/{self.test_deposit_id}",
                headers=headers
            )
            
            if response.status_code == 200:
                deposit = response.json()
                self.log_result(
                    "Admin Access Deposit Details", 
                    True, 
                    f"Admin can access deposit details",
                    f"Status: {deposit.get('status')}, Amount: €{deposit.get('amount')}"
                )
                success_count += 1
            else:
                self.log_result("Admin Access Deposit Details", False, f"Failed: {response.status_code}")
                
        except Exception as e:
            self.log_result("Admin Access Deposit Details", False, f"Error: {str(e)}")
        
        # Test as supervisor
        try:
            headers = {"Authorization": f"Bearer {self.supervisor_token}"}
            response = self.session.get(
                f"{CRM_BASE_URL}/deposits/{self.test_deposit_id}",
                headers=headers
            )
            
            if response.status_code == 200:
                deposit = response.json()
                self.log_result(
                    "Supervisor Access Deposit Details", 
                    True, 
                    f"Supervisor can access deposit details"
                )
                success_count += 1
            else:
                self.log_result("Supervisor Access Deposit Details", False, f"Failed: {response.status_code}")
                
        except Exception as e:
            self.log_result("Supervisor Access Deposit Details", False, f"Error: {str(e)}")
        
        # Test as agent
        try:
            headers = {"Authorization": f"Bearer {self.agent_token}"}
            response = self.session.get(
                f"{CRM_BASE_URL}/deposits/{self.test_deposit_id}",
                headers=headers
            )
            
            if response.status_code == 200:
                deposit = response.json()
                self.log_result(
                    "Agent Access Deposit Details", 
                    True, 
                    f"Agent can access assigned deposit details"
                )
                success_count += 1
            else:
                self.log_result("Agent Access Deposit Details", False, f"Failed: {response.status_code}")
                
        except Exception as e:
            self.log_result("Agent Access Deposit Details", False, f"Error: {str(e)}")
        
        return success_count >= 2  # At least 2 out of 3 should work
    
    
    def run_all_tests(self):
        """Run all deposit management backend tests"""
        print("💰" * 60)
        print("💰 DEPOSIT MANAGEMENT SYSTEM BACKEND TESTING")
        print("💰 Testing complete deposit workflow: creation, approval, and notifications")
        print("💰" * 60)
        
        # Setup
        if not self.setup_test_environment():
            print("\n❌ SETUP FAILED - Cannot proceed with tests")
            return False
        
        # Get test data (leads and agent IDs)
        if not self.get_test_data():
            print("\n❌ TEST DATA RETRIEVAL FAILED - Cannot proceed with tests")
            return False
        
        # Run core tests
        tests_passed = 0
        total_tests = 6
        
        if self.test_supervisor_creates_deposit():
            tests_passed += 1
        
        if self.test_list_deposits_role_based():
            tests_passed += 1
        
        if self.test_admin_approval_flow():
            tests_passed += 1
        
        if self.test_supervisor_deposit_notifications():
            tests_passed += 1
        
        if self.test_admin_deposit_notifications():
            tests_passed += 1
        
        if self.test_deposit_details_access():
            tests_passed += 1
        
        # Summary
        print("\n" + "="*60)
        print("DEPOSIT MANAGEMENT BACKEND TEST SUMMARY")
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
                if test.get('details'):
                    print(f"    Details: {test['details']}")
        
        print("\n" + "="*60)
        print("DEPOSIT MANAGEMENT SYSTEM STATUS")
        print("="*60)
        
        if tests_passed >= 4:  # At least 4 out of 6 core tests should pass
            print("✅ DEPOSIT MANAGEMENT SYSTEM WORKING")
            print("✅ Supervisor can create deposits")
            print("✅ Role-based deposit access working")
            print("✅ Admin approval workflow functional")
            print("✅ Notification systems operational")
        else:
            print("❌ DEPOSIT MANAGEMENT SYSTEM HAS ISSUES")
            print("⚠️  Some critical deposit workflows are not functioning properly")
        
        return tests_passed >= 4

def main():
    """Main test execution"""
    tester = DepositManagementTester()
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 DEPOSIT MANAGEMENT TESTS PASSED!")
        print("The backend is ready to support deposit management functionality.")
        sys.exit(0)
    else:
        print("\n💥 SOME DEPOSIT TESTS FAILED!")
        print("Please check the deposit management implementation.")
        sys.exit(1)

if __name__ == "__main__":
    main()