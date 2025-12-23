#!/usr/bin/env python3
"""
Team-Based Permission Filtering Test for CRM Leads
Tests the specific team-based access control requirements
"""

import requests
import json
import sys
from datetime import datetime
import uuid

# Configuration
BASE_URL = "https://profit-pulse-136.preview.emergentagent.com/api"
CRM_BASE_URL = f"{BASE_URL}/crm"

# Test credentials
TEST_CREDENTIALS = {
    "admin": {"email": "admin@1lawsolicitors.com", "password": "Admin@123456"},
    "supervisor": {"email": "supervisor@test.com", "password": "TestPass123!"},
    "manager": {"email": "manager@test.com", "password": "TestPass123!"},
    "agent": {"email": "agent@test.com", "password": "TestPass123!"}
}

class TeamPermissionTester:
    def __init__(self):
        self.session = requests.Session()
        self.tokens = {}
        self.user_info = {}
        self.test_results = []
        self.test_leads = []
        
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
    
    def login_user(self, role):
        """Login as specific user and store token"""
        try:
            credentials = TEST_CREDENTIALS[role]
            response = self.session.post(
                f"{CRM_BASE_URL}/auth/login",
                json=credentials,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                self.tokens[role] = data.get("token")
                self.user_info[role] = data.get("user", {})
                self.log_result(f"{role.title()} Login", True, f"Successfully logged in as {role}")
                return True
            else:
                self.log_result(f"{role.title()} Login", False, f"Login failed: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result(f"{role.title()} Login", False, f"Login error: {str(e)}")
            return False
    
    def get_user_info(self, role):
        """Get current user information using /auth/me endpoint"""
        if role not in self.tokens:
            return None
            
        try:
            headers = {"Authorization": f"Bearer {self.tokens[role]}"}
            response = self.session.get(f"{CRM_BASE_URL}/auth/me", headers=headers)
            
            if response.status_code == 200:
                user_data = response.json()
                self.user_info[role] = user_data
                return user_data
            else:
                self.log_result(f"Get {role} Info", False, f"Failed to get user info: {response.status_code}")
                return None
                
        except Exception as e:
            self.log_result(f"Get {role} Info", False, f"Error getting user info: {str(e)}")
            return None
    
    def get_leads_for_user(self, role):
        """Get leads for a specific user role"""
        if role not in self.tokens:
            return None
            
        try:
            headers = {"Authorization": f"Bearer {self.tokens[role]}"}
            response = self.session.get(f"{CRM_BASE_URL}/leads", headers=headers)
            
            if response.status_code == 200:
                return response.json()
            else:
                self.log_result(f"Get Leads - {role}", False, f"Failed to get leads: {response.status_code}")
                return None
                
        except Exception as e:
            self.log_result(f"Get Leads - {role}", False, f"Error getting leads: {str(e)}")
            return None
    
    def test_lead_detail_access(self, role, lead_id, should_have_access=True):
        """Test access to specific lead detail"""
        if role not in self.tokens:
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.tokens[role]}"}
            response = self.session.get(f"{CRM_BASE_URL}/leads/{lead_id}", headers=headers)
            
            if should_have_access:
                if response.status_code == 200:
                    self.log_result(f"Lead Detail Access - {role}", True, f"{role} can access lead {lead_id}")
                    return True
                else:
                    self.log_result(f"Lead Detail Access - {role}", False, f"{role} cannot access lead {lead_id}: {response.status_code}")
                    return False
            else:
                if response.status_code == 403:
                    self.log_result(f"Lead Detail Access - {role}", True, f"{role} correctly denied access to lead {lead_id} (403)")
                    return True
                else:
                    self.log_result(f"Lead Detail Access - {role}", False, f"Expected 403 for {role}, got {response.status_code}")
                    return False
                    
        except Exception as e:
            self.log_result(f"Lead Detail Access - {role}", False, f"Error testing lead access: {str(e)}")
            return False
    
    def create_test_teams(self):
        """Create test teams for comprehensive testing"""
        if "admin" not in self.tokens:
            return False
            
        headers = {
            "Authorization": f"Bearer {self.tokens['admin']}",
            "Content-Type": "application/json"
        }
        
        # Create test teams
        test_teams = [
            {"name": "Sales Team A", "description": "Test sales team A"},
            {"name": "Sales Team B", "description": "Test sales team B"}
        ]
        
        created_teams = []
        for team_data in test_teams:
            try:
                response = self.session.post(
                    f"{CRM_BASE_URL}/teams",
                    json=team_data,
                    headers=headers
                )
                
                if response.status_code == 200:
                    team_id = response.json().get("team_id")
                    created_teams.append({"name": team_data["name"], "id": team_id})
                    self.log_result(f"Create Team", True, f"Created team: {team_data['name']}")
                else:
                    self.log_result(f"Create Team", False, f"Failed to create team: {response.status_code}")
                    
            except Exception as e:
                self.log_result(f"Create Team", False, f"Error creating team: {str(e)}")
        
        return created_teams
    
    def assign_users_to_teams(self, teams):
        """Assign test users to teams"""
        if "admin" not in self.tokens or len(teams) < 2:
            return False
            
        headers = {
            "Authorization": f"Bearer {self.tokens['admin']}",
            "Content-Type": "application/json"
        }
        
        # Assign supervisor to team A, manager to team B
        assignments = [
            {"role": "supervisor", "team_id": teams[0]["id"], "team_name": teams[0]["name"]},
            {"role": "manager", "team_id": teams[1]["id"], "team_name": teams[1]["name"]}
        ]
        
        for assignment in assignments:
            try:
                user_info = self.user_info.get(assignment["role"])
                if not user_info:
                    continue
                    
                user_id = user_info.get("id")
                update_data = {"team_id": assignment["team_id"]}
                
                response = self.session.put(
                    f"{CRM_BASE_URL}/users/{user_id}",
                    json=update_data,
                    headers=headers
                )
                
                if response.status_code == 200:
                    self.log_result(
                        f"Assign Team", 
                        True, 
                        f"Assigned {assignment['role']} to {assignment['team_name']}"
                    )
                    # Update local user info
                    self.user_info[assignment["role"]]["team_id"] = assignment["team_id"]
                else:
                    self.log_result(f"Assign Team", False, f"Failed to assign team: {response.status_code}")
                    
            except Exception as e:
                self.log_result(f"Assign Team", False, f"Error assigning team: {str(e)}")
        
        return True
    
    def assign_existing_leads_to_teams(self, teams):
        """Assign some existing leads to teams using mass update"""
        if "admin" not in self.tokens or len(teams) < 2:
            return []
            
        headers = {"Authorization": f"Bearer {self.tokens['admin']}", "Content-Type": "application/json"}
        
        try:
            # Get existing leads
            response = self.session.get(f"{CRM_BASE_URL}/leads", headers=headers)
            if response.status_code != 200:
                return []
                
            leads = response.json()
            if len(leads) < 4:
                return []
            
            # Assign first 2 leads to team A, next 2 to team B
            team_a_leads = [leads[0]["id"], leads[1]["id"]]
            team_b_leads = [leads[2]["id"], leads[3]["id"]]
            
            assignments = []
            
            # Assign leads to team A
            mass_update_a = {
                "lead_ids": team_a_leads,
                "team_id": teams[0]["id"]
            }
            
            response_a = self.session.post(
                f"{CRM_BASE_URL}/leads/mass-update",
                json=mass_update_a,
                headers=headers
            )
            
            if response_a.status_code == 200:
                assignments.extend([
                    {"id": lead_id, "team_id": teams[0]["id"], "team_name": teams[0]["name"]}
                    for lead_id in team_a_leads
                ])
                self.log_result(
                    "Assign Leads to Team A", 
                    True, 
                    f"Assigned 2 leads to {teams[0]['name']}"
                )
            else:
                self.log_result("Assign Leads to Team A", False, f"Failed: {response_a.status_code}")
            
            # Assign leads to team B
            mass_update_b = {
                "lead_ids": team_b_leads,
                "team_id": teams[1]["id"]
            }
            
            response_b = self.session.post(
                f"{CRM_BASE_URL}/leads/mass-update",
                json=mass_update_b,
                headers=headers
            )
            
            if response_b.status_code == 200:
                assignments.extend([
                    {"id": lead_id, "team_id": teams[1]["id"], "team_name": teams[1]["name"]}
                    for lead_id in team_b_leads
                ])
                self.log_result(
                    "Assign Leads to Team B", 
                    True, 
                    f"Assigned 2 leads to {teams[1]['name']}"
                )
            else:
                self.log_result("Assign Leads to Team B", False, f"Failed: {response_b.status_code}")
            
            return assignments
            
        except Exception as e:
            self.log_result("Assign Leads to Teams", False, f"Error: {str(e)}")
            return []
    
    def verify_team_assignments(self):
        """Verify that team assignments are working correctly"""
        print("\n🔍 Verifying team assignments...")
        
        if "admin" not in self.tokens:
            return
            
        headers = {"Authorization": f"Bearer {self.tokens['admin']}"}
        
        try:
            # Get all leads as admin
            response = self.session.get(f"{CRM_BASE_URL}/leads", headers=headers)
            if response.status_code == 200:
                leads = response.json()
                
                # Count leads by team
                team_counts = {}
                no_team_count = 0
                
                for lead in leads:
                    team_id = lead.get("team_id")
                    if team_id:
                        team_counts[team_id] = team_counts.get(team_id, 0) + 1
                    else:
                        no_team_count += 1
                
                print(f"   Total leads: {len(leads)}")
                print(f"   Leads without team: {no_team_count}")
                for team_id, count in team_counts.items():
                    print(f"   Leads in team {team_id}: {count}")
                    
        except Exception as e:
            print(f"   Error verifying assignments: {str(e)}")

    def setup_test_environment(self):
        """Setup test environment by logging in all users and getting their info"""
        print("🔧 Setting up test environment...")
        
        # Login all users
        for role in TEST_CREDENTIALS.keys():
            if not self.login_user(role):
                return False
        
        # Get user information for all roles
        for role in TEST_CREDENTIALS.keys():
            user_info = self.get_user_info(role)
            if user_info:
                team_id = user_info.get("team_id")
                print(f"   {role.title()}: ID={user_info.get('id')}, Team={team_id or 'None'}")
        
        # Create test teams and assign users
        print("\n🏢 Creating test teams and assignments...")
        teams = self.create_test_teams()
        if teams:
            self.assign_users_to_teams(teams)
            self.assign_existing_leads_to_teams(teams)
            self.verify_team_assignments()
            
            # Refresh user info after team assignments
            for role in TEST_CREDENTIALS.keys():
                self.get_user_info(role)
        
        return True
    
    def test_team_based_filtering(self):
        """Test team-based lead filtering for each role"""
        print("\n=== Testing Team-Based Lead Filtering ===")
        
        # Test each role's lead access
        for role in ["admin", "supervisor", "manager", "agent"]:
            user_info = self.user_info.get(role, {})
            user_team_id = user_info.get("team_id")
            user_id = user_info.get("id")
            
            leads = self.get_leads_for_user(role)
            
            if leads is None:
                continue
                
            lead_count = len(leads)
            
            if role == "admin":
                # Admin should see ALL leads
                self.log_result(
                    f"Team Filtering - {role}",
                    lead_count > 0,  # Admin should see some leads
                    f"Admin sees all leads",
                    f"Admin can see {lead_count} leads (should see all)"
                )
                
            elif role == "supervisor":
                # Supervisor should see ONLY leads from their team OR no leads if no team
                if user_team_id:
                    # Check if all visible leads belong to supervisor's team
                    team_leads = [lead for lead in leads if lead.get("team_id") == user_team_id]
                    all_from_team = len(team_leads) == lead_count
                    
                    self.log_result(
                        f"Team Filtering - {role}",
                        all_from_team,
                        f"Supervisor sees only team leads" if all_from_team else "Supervisor sees leads from other teams",
                        f"Supervisor (team: {user_team_id}) sees {lead_count} leads, {len(team_leads)} from their team"
                    )
                else:
                    # Supervisor without team should see NO leads
                    self.log_result(
                        f"Team Filtering - {role}",
                        lead_count == 0,
                        f"Supervisor without team sees no leads" if lead_count == 0 else "Supervisor without team incorrectly sees leads",
                        f"Supervisor (no team) sees {lead_count} leads (should be 0)"
                    )
                    
            elif role == "manager":
                # Manager should see ONLY leads from their team OR no leads if no team
                if user_team_id:
                    # Check if all visible leads belong to manager's team
                    team_leads = [lead for lead in leads if lead.get("team_id") == user_team_id]
                    all_from_team = len(team_leads) == lead_count
                    
                    self.log_result(
                        f"Team Filtering - {role}",
                        all_from_team,
                        f"Manager sees only team leads" if all_from_team else "Manager sees leads from other teams",
                        f"Manager (team: {user_team_id}) sees {lead_count} leads, {len(team_leads)} from their team"
                    )
                else:
                    # Manager without team should see NO leads
                    self.log_result(
                        f"Team Filtering - {role}",
                        lead_count == 0,
                        f"Manager without team sees no leads" if lead_count == 0 else "Manager without team incorrectly sees leads",
                        f"Manager (no team) sees {lead_count} leads (should be 0)"
                    )
                    
            elif role == "agent":
                # Agent should see ONLY leads assigned to them
                assigned_leads = [lead for lead in leads if lead.get("assigned_to") == user_id]
                all_assigned = len(assigned_leads) == lead_count
                
                self.log_result(
                    f"Team Filtering - {role}",
                    all_assigned,
                    f"Agent sees only assigned leads" if all_assigned else "Agent sees unassigned leads",
                    f"Agent (ID: {user_id}) sees {lead_count} leads, {len(assigned_leads)} assigned to them"
                )
    
    def test_lead_detail_permissions(self):
        """Test lead detail access permissions"""
        print("\n=== Testing Lead Detail Access Permissions ===")
        
        # Get all leads as admin to test access
        admin_leads = self.get_leads_for_user("admin")
        if not admin_leads:
            self.log_result("Lead Detail Setup", False, "No leads available for testing")
            return
        
        # Test with first available lead
        test_lead = admin_leads[0]
        test_lead_id = test_lead.get("id")
        test_lead_team = test_lead.get("team_id")
        test_lead_assigned = test_lead.get("assigned_to")
        
        print(f"   Testing with lead: {test_lead_id}")
        print(f"   Lead team: {test_lead_team or 'None'}")
        print(f"   Lead assigned to: {test_lead_assigned or 'None'}")
        
        # Test admin access (should always work)
        self.test_lead_detail_access("admin", test_lead_id, should_have_access=True)
        
        # Test supervisor access
        supervisor_info = self.user_info.get("supervisor", {})
        supervisor_team = supervisor_info.get("team_id")
        
        if supervisor_team and supervisor_team == test_lead_team:
            # Supervisor should have access to leads in their team
            self.test_lead_detail_access("supervisor", test_lead_id, should_have_access=True)
        else:
            # Supervisor should NOT have access to leads outside their team
            self.test_lead_detail_access("supervisor", test_lead_id, should_have_access=False)
        
        # Test manager access
        manager_info = self.user_info.get("manager", {})
        manager_team = manager_info.get("team_id")
        
        if manager_team and manager_team == test_lead_team:
            # Manager should have access to leads in their team
            self.test_lead_detail_access("manager", test_lead_id, should_have_access=True)
        else:
            # Manager should NOT have access to leads outside their team
            self.test_lead_detail_access("manager", test_lead_id, should_have_access=False)
        
        # Test agent access
        agent_info = self.user_info.get("agent", {})
        agent_id = agent_info.get("id")
        
        if agent_id and agent_id == test_lead_assigned:
            # Agent should have access to their assigned leads
            self.test_lead_detail_access("agent", test_lead_id, should_have_access=True)
        else:
            # Agent should NOT have access to leads not assigned to them
            self.test_lead_detail_access("agent", test_lead_id, should_have_access=False)
    
    def run_team_permission_tests(self):
        """Run all team permission tests"""
        print("🚀 Starting Team-Based Permission Tests")
        print("=" * 60)
        
        # Setup test environment
        if not self.setup_test_environment():
            print("❌ Failed to setup test environment")
            return False
        
        # Run tests
        self.test_team_based_filtering()
        self.test_lead_detail_permissions()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEAM PERMISSION TEST SUMMARY")
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
        
        print("\n📋 USER TEAM ASSIGNMENTS:")
        for role, info in self.user_info.items():
            team_id = info.get("team_id", "None")
            user_id = info.get("id", "Unknown")
            print(f"  • {role.title()}: ID={user_id}, Team={team_id}")
        
        return failed_tests == 0

if __name__ == "__main__":
    tester = TeamPermissionTester()
    success = tester.run_team_permission_tests()
    sys.exit(0 if success else 1)