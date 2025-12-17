#!/usr/bin/env python3
"""
Final Comprehensive Team-Based Permission Test
Tests all the specific scenarios requested by the user
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://law-crm-admin.preview.emergentagent.com/api"
CRM_BASE_URL = f"{BASE_URL}/crm"

# Test credentials as specified by user
TEST_CREDENTIALS = {
    "admin": {"email": "admin@1lawsolicitors.com", "password": "Admin@123456"},
    "supervisor": {"email": "supervisor@test.com", "password": "TestPass123!"},
    "manager": {"email": "manager@test.com", "password": "TestPass123!"},
    "agent": {"email": "agent@test.com", "password": "TestPass123!"}
}

class FinalTeamPermissionTester:
    def __init__(self):
        self.session = requests.Session()
        self.tokens = {}
        self.user_info = {}
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
    
    def login_and_get_info(self, role):
        """Login and get user information"""
        try:
            credentials = TEST_CREDENTIALS[role]
            
            # Login
            response = self.session.post(
                f"{CRM_BASE_URL}/auth/login",
                json=credentials,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                self.tokens[role] = data.get("token")
                
                # Get detailed user info
                headers = {"Authorization": f"Bearer {self.tokens[role]}"}
                me_response = self.session.get(f"{CRM_BASE_URL}/auth/me", headers=headers)
                
                if me_response.status_code == 200:
                    self.user_info[role] = me_response.json()
                    return True
                    
            return False
            
        except Exception as e:
            print(f"Error logging in {role}: {str(e)}")
            return False
    
    def get_leads_for_role(self, role):
        """Get leads for a specific role"""
        if role not in self.tokens:
            return None
            
        try:
            headers = {"Authorization": f"Bearer {self.tokens[role]}"}
            response = self.session.get(f"{CRM_BASE_URL}/leads", headers=headers)
            
            if response.status_code == 200:
                return response.json()
            else:
                return None
                
        except Exception as e:
            return None
    
    def test_lead_detail_access(self, role, lead_id):
        """Test access to specific lead detail"""
        if role not in self.tokens:
            return None
            
        try:
            headers = {"Authorization": f"Bearer {self.tokens[role]}"}
            response = self.session.get(f"{CRM_BASE_URL}/leads/{lead_id}", headers=headers)
            return response.status_code
                    
        except Exception as e:
            return None
    
    def run_comprehensive_test(self):
        """Run the comprehensive team permission test as requested"""
        print("🚀 COMPREHENSIVE TEAM-BASED PERMISSION TEST")
        print("=" * 70)
        print("Testing team-based permission filtering for CRM leads")
        print("=" * 70)
        
        # Step 1: Login all users and get their info
        print("\n📋 STEP 1: User Authentication and Team Information")
        print("-" * 50)
        
        all_logged_in = True
        for role in TEST_CREDENTIALS.keys():
            if self.login_and_get_info(role):
                user = self.user_info[role]
                team_id = user.get("team_id")
                print(f"✅ {role.upper()}: ID={user.get('id')}, Team={team_id or 'None'}")
            else:
                print(f"❌ {role.upper()}: Login failed")
                all_logged_in = False
        
        if not all_logged_in:
            print("❌ Cannot proceed - some users failed to login")
            return False
        
        # Step 2: Test lead access for each role
        print("\n🔍 STEP 2: Lead Access Testing")
        print("-" * 50)
        
        # Test 1: Admin should see ALL leads
        print("\n1️⃣  ADMIN ACCESS TEST")
        admin_leads = self.get_leads_for_role("admin")
        if admin_leads is not None:
            print(f"   ✅ Admin can access leads endpoint")
            print(f"   📊 Admin sees {len(admin_leads)} total leads")
            self.log_result("Admin Lead Access", True, f"Admin sees all {len(admin_leads)} leads")
        else:
            print(f"   ❌ Admin cannot access leads")
            self.log_result("Admin Lead Access", False, "Admin cannot access leads")
        
        # Test 2: Supervisor access
        print("\n2️⃣  SUPERVISOR ACCESS TEST")
        supervisor = self.user_info["supervisor"]
        supervisor_team = supervisor.get("team_id")
        supervisor_leads = self.get_leads_for_role("supervisor")
        
        if supervisor_leads is not None:
            print(f"   ✅ Supervisor can access leads endpoint")
            print(f"   👤 Supervisor team: {supervisor_team or 'None'}")
            print(f"   📊 Supervisor sees {len(supervisor_leads)} leads")
            
            if supervisor_team:
                # Check if all leads belong to supervisor's team
                team_leads = [lead for lead in supervisor_leads if lead.get("team_id") == supervisor_team]
                if len(team_leads) == len(supervisor_leads):
                    self.log_result("Supervisor Team Filtering", True, f"Supervisor sees only team leads ({len(supervisor_leads)} leads)")
                else:
                    self.log_result("Supervisor Team Filtering", False, f"Supervisor sees leads from other teams")
            else:
                if len(supervisor_leads) == 0:
                    self.log_result("Supervisor No Team", True, "Supervisor without team sees no leads")
                else:
                    self.log_result("Supervisor No Team", False, f"Supervisor without team incorrectly sees {len(supervisor_leads)} leads")
        else:
            print(f"   ❌ Supervisor cannot access leads")
            self.log_result("Supervisor Lead Access", False, "Supervisor cannot access leads")
        
        # Test 3: Manager access
        print("\n3️⃣  MANAGER ACCESS TEST")
        manager = self.user_info["manager"]
        manager_team = manager.get("team_id")
        manager_leads = self.get_leads_for_role("manager")
        
        if manager_leads is not None:
            print(f"   ✅ Manager can access leads endpoint")
            print(f"   👤 Manager team: {manager_team or 'None'}")
            print(f"   📊 Manager sees {len(manager_leads)} leads")
            
            if manager_team:
                # Check if all leads belong to manager's team
                team_leads = [lead for lead in manager_leads if lead.get("team_id") == manager_team]
                if len(team_leads) == len(manager_leads):
                    self.log_result("Manager Team Filtering", True, f"Manager sees only team leads ({len(manager_leads)} leads)")
                else:
                    self.log_result("Manager Team Filtering", False, f"Manager sees leads from other teams")
            else:
                if len(manager_leads) == 0:
                    self.log_result("Manager No Team", True, "Manager without team sees no leads")
                else:
                    self.log_result("Manager No Team", False, f"Manager without team incorrectly sees {len(manager_leads)} leads")
        else:
            print(f"   ❌ Manager cannot access leads")
            self.log_result("Manager Lead Access", False, "Manager cannot access leads")
        
        # Test 4: Agent access
        print("\n4️⃣  AGENT ACCESS TEST")
        agent = self.user_info["agent"]
        agent_id = agent.get("id")
        agent_leads = self.get_leads_for_role("agent")
        
        if agent_leads is not None:
            print(f"   ✅ Agent can access leads endpoint")
            print(f"   👤 Agent ID: {agent_id}")
            print(f"   📊 Agent sees {len(agent_leads)} leads")
            
            # Check if all leads are assigned to the agent
            assigned_leads = [lead for lead in agent_leads if lead.get("assigned_to") == agent_id]
            if len(assigned_leads) == len(agent_leads):
                self.log_result("Agent Assignment Filtering", True, f"Agent sees only assigned leads ({len(agent_leads)} leads)")
            else:
                self.log_result("Agent Assignment Filtering", False, f"Agent sees unassigned leads")
        else:
            print(f"   ❌ Agent cannot access leads")
            self.log_result("Agent Lead Access", False, "Agent cannot access leads")
        
        # Step 3: Test lead detail access permissions
        print("\n🔒 STEP 3: Lead Detail Access Permissions")
        print("-" * 50)
        
        if admin_leads and len(admin_leads) > 0:
            # Test with first lead
            test_lead = admin_leads[0]
            test_lead_id = test_lead.get("id")
            test_lead_team = test_lead.get("team_id")
            test_lead_assigned = test_lead.get("assigned_to")
            
            print(f"\n🎯 Testing with Lead ID: {test_lead_id}")
            print(f"   Team: {test_lead_team or 'None'}")
            print(f"   Assigned to: {test_lead_assigned or 'None'}")
            
            # Test each role's access to this specific lead
            for role in ["admin", "supervisor", "manager", "agent"]:
                status_code = self.test_lead_detail_access(role, test_lead_id)
                
                if role == "admin":
                    # Admin should always have access
                    if status_code == 200:
                        print(f"   ✅ {role.upper()}: Can access lead detail (200)")
                        self.log_result(f"{role.title()} Detail Access", True, "Admin can access lead detail")
                    else:
                        print(f"   ❌ {role.upper()}: Cannot access lead detail ({status_code})")
                        self.log_result(f"{role.title()} Detail Access", False, f"Admin denied access ({status_code})")
                
                elif role in ["supervisor", "manager"]:
                    user_team = self.user_info[role].get("team_id")
                    should_have_access = user_team and user_team == test_lead_team
                    
                    if should_have_access:
                        if status_code == 200:
                            print(f"   ✅ {role.upper()}: Can access team lead (200)")
                            self.log_result(f"{role.title()} Detail Access", True, f"{role.title()} can access team lead")
                        else:
                            print(f"   ❌ {role.upper()}: Cannot access team lead ({status_code})")
                            self.log_result(f"{role.title()} Detail Access", False, f"{role.title()} denied team lead access")
                    else:
                        if status_code == 403:
                            print(f"   ✅ {role.upper()}: Correctly denied access (403)")
                            self.log_result(f"{role.title()} Detail Access", True, f"{role.title()} correctly denied access")
                        else:
                            print(f"   ❌ {role.upper()}: Should be denied access, got ({status_code})")
                            self.log_result(f"{role.title()} Detail Access", False, f"{role.title()} should be denied access")
                
                elif role == "agent":
                    agent_id = self.user_info[role].get("id")
                    should_have_access = agent_id == test_lead_assigned
                    
                    if should_have_access:
                        if status_code == 200:
                            print(f"   ✅ {role.upper()}: Can access assigned lead (200)")
                            self.log_result(f"{role.title()} Detail Access", True, "Agent can access assigned lead")
                        else:
                            print(f"   ❌ {role.upper()}: Cannot access assigned lead ({status_code})")
                            self.log_result(f"{role.title()} Detail Access", False, "Agent denied assigned lead access")
                    else:
                        if status_code == 403:
                            print(f"   ✅ {role.upper()}: Correctly denied access (403)")
                            self.log_result(f"{role.title()} Detail Access", True, "Agent correctly denied access")
                        else:
                            print(f"   ❌ {role.upper()}: Should be denied access, got ({status_code})")
                            self.log_result(f"{role.title()} Detail Access", False, "Agent should be denied access")
        
        # Final Summary
        print("\n" + "=" * 70)
        print("📊 FINAL TEST SUMMARY")
        print("=" * 70)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        # Detailed results by role
        print(f"\n📋 DETAILED RESULTS BY ROLE:")
        for role in ["admin", "supervisor", "manager", "agent"]:
            user = self.user_info.get(role, {})
            team_id = user.get("team_id")
            leads = self.get_leads_for_role(role)
            lead_count = len(leads) if leads else 0
            
            print(f"  🔹 {role.upper()}:")
            print(f"     User ID: {user.get('id', 'Unknown')}")
            print(f"     Team ID: {team_id or 'None'}")
            print(f"     Visible Leads: {lead_count}")
            
            if role == "admin":
                print(f"     Expected: See ALL leads ✅")
            elif role in ["supervisor", "manager"]:
                if team_id:
                    print(f"     Expected: See ONLY team leads ✅")
                else:
                    print(f"     Expected: See NO leads (no team) ✅")
            elif role == "agent":
                print(f"     Expected: See ONLY assigned leads ✅")
        
        if failed_tests > 0:
            print(f"\n🔍 FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  • {result['test']}: {result['message']}")
        
        print(f"\n🎉 TEAM-BASED PERMISSION FILTERING: {'WORKING CORRECTLY' if failed_tests == 0 else 'HAS ISSUES'}")
        
        return failed_tests == 0

if __name__ == "__main__":
    tester = FinalTeamPermissionTester()
    success = tester.run_comprehensive_test()
    sys.exit(0 if success else 1)