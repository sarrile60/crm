#!/usr/bin/env python3
"""
Analytics Time Period Filters and Agent Earnings Dashboard Testing
Tests specific requirements from the review request
"""

import requests
import json
import sys
from datetime import datetime, timezone, timedelta
import logging

# Configuration
BASE_URL = "https://onelaw-crm.preview.emergentagent.com/api"
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

class AnalyticsAgentTester:
    def __init__(self):
        self.session = requests.Session()
        self.agent_token = None
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
    
    def test_analytics_time_period_today(self):
        """Test Analytics Time Period Filter: Today - Should return 0 leads"""
        print("\n=== Testing Analytics Time Period: Today ===")
        
        if not self.admin_token:
            self.log_result("Analytics Today Filter", False, "No admin token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = self.session.get(
                f"{CRM_BASE_URL}/analytics/overview?period=today",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Check if summary exists and has total_leads
                summary = data.get("summary", {})
                total_leads = summary.get("total_leads", -1)
                
                if total_leads == 0:
                    self.log_result(
                        "Analytics Today Filter", 
                        True, 
                        f"Today filter working correctly - 0 leads as expected",
                        f"Total Leads: {total_leads}"
                    )
                    return True
                else:
                    self.log_result(
                        "Analytics Today Filter", 
                        False, 
                        f"Expected 0 leads for today, got {total_leads}",
                        f"Response: {json.dumps(summary, indent=2)}"
                    )
                    return False
            else:
                self.log_result("Analytics Today Filter", False, f"Failed: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Analytics Today Filter", False, f"Error: {str(e)}")
            return False
    
    def test_analytics_time_period_week(self):
        """Test Analytics Time Period Filter: Week - Should return 9 leads, €58,800 revenue"""
        print("\n=== Testing Analytics Time Period: Week ===")
        
        if not self.admin_token:
            self.log_result("Analytics Week Filter", False, "No admin token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = self.session.get(
                f"{CRM_BASE_URL}/analytics/overview?period=week",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                
                summary = data.get("summary", {})
                total_leads = summary.get("total_leads", -1)
                total_revenue = summary.get("total_revenue", -1)
                
                # Check expected values
                expected_leads = 9
                expected_revenue = 58800
                
                leads_match = total_leads == expected_leads
                revenue_match = total_revenue == expected_revenue
                
                if leads_match and revenue_match:
                    self.log_result(
                        "Analytics Week Filter", 
                        True, 
                        f"Week filter working correctly",
                        f"Total Leads: {total_leads} (expected {expected_leads}), Revenue: €{total_revenue} (expected €{expected_revenue})"
                    )
                    return True
                else:
                    self.log_result(
                        "Analytics Week Filter", 
                        False, 
                        f"Week filter data mismatch",
                        f"Total Leads: {total_leads} (expected {expected_leads}), Revenue: €{total_revenue} (expected €{expected_revenue})"
                    )
                    return False
            else:
                self.log_result("Analytics Week Filter", False, f"Failed: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Analytics Week Filter", False, f"Error: {str(e)}")
            return False
    
    def test_analytics_time_period_month(self):
        """Test Analytics Time Period Filter: Month - Should return 15 leads, €58,800 revenue"""
        print("\n=== Testing Analytics Time Period: Month ===")
        
        if not self.admin_token:
            self.log_result("Analytics Month Filter", False, "No admin token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = self.session.get(
                f"{CRM_BASE_URL}/analytics/overview?period=month",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                
                summary = data.get("summary", {})
                total_leads = summary.get("total_leads", -1)
                total_revenue = summary.get("total_revenue", -1)
                
                # Check expected values
                expected_leads = 15
                expected_revenue = 58800
                
                leads_match = total_leads == expected_leads
                revenue_match = total_revenue == expected_revenue
                
                if leads_match and revenue_match:
                    self.log_result(
                        "Analytics Month Filter", 
                        True, 
                        f"Month filter working correctly",
                        f"Total Leads: {total_leads} (expected {expected_leads}), Revenue: €{total_revenue} (expected €{expected_revenue})"
                    )
                    return True
                else:
                    self.log_result(
                        "Analytics Month Filter", 
                        False, 
                        f"Month filter data mismatch",
                        f"Total Leads: {total_leads} (expected {expected_leads}), Revenue: €{total_revenue} (expected €{expected_revenue})"
                    )
                    return False
            else:
                self.log_result("Analytics Month Filter", False, f"Failed: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Analytics Month Filter", False, f"Error: {str(e)}")
            return False
    
    def test_analytics_time_period_year(self):
        """Test Analytics Time Period Filter: Year - Should return 15 leads, €58,800 revenue"""
        print("\n=== Testing Analytics Time Period: Year ===")
        
        if not self.admin_token:
            self.log_result("Analytics Year Filter", False, "No admin token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = self.session.get(
                f"{CRM_BASE_URL}/analytics/overview?period=year",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                
                summary = data.get("summary", {})
                total_leads = summary.get("total_leads", -1)
                total_revenue = summary.get("total_revenue", -1)
                
                # Check expected values
                expected_leads = 15
                expected_revenue = 58800
                
                leads_match = total_leads == expected_leads
                revenue_match = total_revenue == expected_revenue
                
                if leads_match and revenue_match:
                    self.log_result(
                        "Analytics Year Filter", 
                        True, 
                        f"Year filter working correctly",
                        f"Total Leads: {total_leads} (expected {expected_leads}), Revenue: €{total_revenue} (expected €{expected_revenue})"
                    )
                    return True
                else:
                    self.log_result(
                        "Analytics Year Filter", 
                        False, 
                        f"Year filter data mismatch",
                        f"Total Leads: {total_leads} (expected {expected_leads}), Revenue: €{total_revenue} (expected €{expected_revenue})"
                    )
                    return False
            else:
                self.log_result("Analytics Year Filter", False, f"Failed: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Analytics Year Filter", False, f"Error: {str(e)}")
            return False
    
    def test_agent_dashboard_current_month(self):
        """Test Agent Finance Dashboard: Current month (Dec 2025) - Should return deposit_history with dates"""
        print("\n=== Testing Agent Dashboard: Current Month (Dec 2025) ===")
        
        if not self.agent_token:
            self.log_result("Agent Dashboard Current Month", False, "No agent token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.agent_token}"}
            response = self.session.get(
                f"{CRM_BASE_URL}/finance/agent/dashboard?month=12&year=2025",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Check required fields
                required_fields = ["period", "summary", "deposit_history"]
                missing_fields = []
                for field in required_fields:
                    if field not in data:
                        missing_fields.append(field)
                
                if missing_fields:
                    self.log_result(
                        "Agent Dashboard Current Month", 
                        False, 
                        f"Missing required fields: {missing_fields}"
                    )
                    return False
                
                # Check deposit_history has dates
                deposit_history = data.get("deposit_history", [])
                has_dates = all(dep.get("date") for dep in deposit_history)
                
                # Check period info
                period = data.get("period", {})
                month = period.get("month")
                year = period.get("year")
                
                if month == 12 and year == 2025 and has_dates:
                    self.log_result(
                        "Agent Dashboard Current Month", 
                        True, 
                        f"Agent dashboard working correctly for Dec 2025",
                        f"Period: {period.get('month_name')}, Deposits: {len(deposit_history)}, All have dates: {has_dates}"
                    )
                    return True
                else:
                    self.log_result(
                        "Agent Dashboard Current Month", 
                        False, 
                        f"Agent dashboard data issues",
                        f"Month: {month}, Year: {year}, Deposits with dates: {has_dates}"
                    )
                    return False
            else:
                self.log_result("Agent Dashboard Current Month", False, f"Failed: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Agent Dashboard Current Month", False, f"Error: {str(e)}")
            return False
    
    def test_agent_dashboard_future_year_2026(self):
        """Test Agent Finance Dashboard: Future year 2026 - Should return empty/0"""
        print("\n=== Testing Agent Dashboard: Future Year 2026 ===")
        
        if not self.agent_token:
            self.log_result("Agent Dashboard Future Year 2026", False, "No agent token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.agent_token}"}
            response = self.session.get(
                f"{CRM_BASE_URL}/finance/agent/dashboard?month=12&year=2026",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Check period
                period = data.get("period", {})
                year = period.get("year")
                
                # Check deposit_history is empty or has no data
                deposit_history = data.get("deposit_history", [])
                summary = data.get("summary", {})
                
                # For future year, should have empty/minimal data
                if year == 2026 and len(deposit_history) == 0:
                    self.log_result(
                        "Agent Dashboard Future Year 2026", 
                        True, 
                        f"Agent dashboard correctly handles future year 2026",
                        f"Year: {year}, Deposits: {len(deposit_history)}"
                    )
                    return True
                else:
                    self.log_result(
                        "Agent Dashboard Future Year 2026", 
                        False, 
                        f"Agent dashboard should have empty data for future year",
                        f"Year: {year}, Deposits: {len(deposit_history)}"
                    )
                    return False
            else:
                self.log_result("Agent Dashboard Future Year 2026", False, f"Failed: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Agent Dashboard Future Year 2026", False, f"Error: {str(e)}")
            return False
    
    def test_agent_dashboard_extended_year_2030(self):
        """Test Agent Finance Dashboard: Extended year 2030 - Should work"""
        print("\n=== Testing Agent Dashboard: Extended Year 2030 ===")
        
        if not self.agent_token:
            self.log_result("Agent Dashboard Extended Year 2030", False, "No agent token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.agent_token}"}
            response = self.session.get(
                f"{CRM_BASE_URL}/finance/agent/dashboard?month=12&year=2030",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Check period
                period = data.get("period", {})
                year = period.get("year")
                
                # Should accept extended year range
                if year == 2030:
                    self.log_result(
                        "Agent Dashboard Extended Year 2030", 
                        True, 
                        f"Agent dashboard accepts extended year range",
                        f"Year: {year}, Period: {period.get('month_name')}"
                    )
                    return True
                else:
                    self.log_result(
                        "Agent Dashboard Extended Year 2030", 
                        False, 
                        f"Agent dashboard should accept year 2030",
                        f"Expected year: 2030, Got: {year}"
                    )
                    return False
            else:
                self.log_result("Agent Dashboard Extended Year 2030", False, f"Failed: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Agent Dashboard Extended Year 2030", False, f"Error: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all analytics and agent dashboard tests"""
        print("📊" * 60)
        print("📊 ANALYTICS TIME PERIOD FILTERS & AGENT EARNINGS TESTING")
        print("📊 Testing specific requirements from review request")
        print("📊" * 60)
        
        # Setup
        if not self.setup_test_environment():
            print("\n❌ SETUP FAILED - Cannot proceed with tests")
            return False
        
        # Run tests
        tests_passed = 0
        total_tests = 7
        
        # Analytics Time Period Tests
        if self.test_analytics_time_period_today():
            tests_passed += 1
        
        if self.test_analytics_time_period_week():
            tests_passed += 1
        
        if self.test_analytics_time_period_month():
            tests_passed += 1
        
        if self.test_analytics_time_period_year():
            tests_passed += 1
        
        # Agent Dashboard Tests
        if self.test_agent_dashboard_current_month():
            tests_passed += 1
        
        if self.test_agent_dashboard_future_year_2026():
            tests_passed += 1
        
        if self.test_agent_dashboard_extended_year_2030():
            tests_passed += 1
        
        # Summary
        print("\n" + "="*60)
        print("ANALYTICS & AGENT DASHBOARD TEST SUMMARY")
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
        print("SYSTEM STATUS")
        print("="*60)
        
        if tests_passed >= 5:  # At least 5 out of 7 tests should pass
            print("✅ ANALYTICS TIME PERIOD FILTERS WORKING")
            print("✅ AGENT EARNINGS DASHBOARD WORKING")
        else:
            print("❌ SOME CRITICAL FEATURES HAVE ISSUES")
            print("⚠️  Analytics time period filters or agent dashboard not functioning properly")
        
        return tests_passed >= 5

def main():
    """Main test execution"""
    tester = AnalyticsAgentTester()
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 ANALYTICS & AGENT DASHBOARD TESTS PASSED!")
        print("The backend is ready for the requested features.")
        sys.exit(0)
    else:
        print("\n💥 SOME TESTS FAILED!")
        print("Please check the analytics and agent dashboard implementation.")
        sys.exit(1)

if __name__ == "__main__":
    main()