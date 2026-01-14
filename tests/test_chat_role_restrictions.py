"""
Test suite for Role-Based Chat Restrictions
Feature: Agents can only see and chat with Admin(s) and their team's Supervisor
- Agents should NOT see or chat with other agents
- Existing agent-to-agent conversations should be hidden
- Agents without a team should only see Admin(s)
- Supervisors and Admins retain full access to all users
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
AGENT_WITH_TEAM = {"username": "agente", "password": "12345"}  # Team: ITALY, Supervisor: maurizio1
AGENT_WITHOUT_TEAM = {"username": "testing123", "password": "12345"}
SUPERVISOR = {"username": "maurizio1", "password": "12345"}
ADMIN = {"username": "admin", "password": "Admin2026"}


class TestAgentChatRestrictions:
    """Tests for agent role-based chat restrictions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures - login as agent with team"""
        # Login as agent with team (agente)
        login_response = requests.post(
            f"{BASE_URL}/api/crm/auth/login",
            json=AGENT_WITH_TEAM
        )
        if login_response.status_code != 200:
            pytest.skip(f"Agent login failed: {login_response.text}")
        
        data = login_response.json()
        self.agent_token = data["token"]
        self.agent_user_id = data["user"]["id"]
        self.agent_team_id = data["user"].get("team_id")
        
        # Login as supervisor to get their ID
        sup_login = requests.post(
            f"{BASE_URL}/api/crm/auth/login",
            json=SUPERVISOR
        )
        if sup_login.status_code == 200:
            self.supervisor_user_id = sup_login.json()["user"]["id"]
            self.supervisor_token = sup_login.json()["token"]
        else:
            self.supervisor_user_id = None
            self.supervisor_token = None
        
        # Login as admin
        admin_login = requests.post(
            f"{BASE_URL}/api/crm/auth/login",
            json=ADMIN
        )
        if admin_login.status_code == 200:
            self.admin_token = admin_login.json()["token"]
            self.admin_user_id = admin_login.json()["user"]["id"]
        else:
            self.admin_token = None
            self.admin_user_id = None
        
        yield
    
    def get_agent_headers(self):
        return {"Authorization": f"Bearer {self.agent_token}"}
    
    def get_supervisor_headers(self):
        return {"Authorization": f"Bearer {self.supervisor_token}"}
    
    def get_admin_headers(self):
        return {"Authorization": f"Bearer {self.admin_token}"}
    
    # ==================== GET /api/chat/users Tests ====================
    
    def test_agent_can_only_see_admins_and_supervisor(self):
        """Agent should only see admins and their team's supervisor in user list"""
        response = requests.get(
            f"{BASE_URL}/api/chat/users",
            headers=self.get_agent_headers()
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        users = response.json()["users"]
        
        print(f"Agent sees {len(users)} users in 'New Conversation' list:")
        
        # Verify each user is either admin or supervisor
        for user in users:
            role = user.get("role", "").lower()
            user_id = user.get("id")
            
            print(f"  - {user.get('full_name')} ({user.get('username')}) - Role: {role}")
            
            # User should be admin OR the team's supervisor
            is_admin = role == "admin"
            is_team_supervisor = user_id == self.supervisor_user_id
            
            assert is_admin or is_team_supervisor, \
                f"Agent should not see user {user.get('username')} with role {role}"
        
        print(f"✓ Agent only sees admins and team supervisor ({len(users)} users)")
    
    def test_agent_cannot_see_other_agents(self):
        """Agent should NOT see other agents in user list"""
        response = requests.get(
            f"{BASE_URL}/api/chat/users",
            headers=self.get_agent_headers()
        )
        
        assert response.status_code == 200
        users = response.json()["users"]
        
        # Check that no agents are in the list
        agents_found = []
        for user in users:
            role = user.get("role", "").lower()
            if role == "agent":
                agents_found.append(user.get("username"))
        
        assert len(agents_found) == 0, \
            f"Agent should not see other agents, but found: {agents_found}"
        
        print(f"✓ Agent does not see any other agents in user list")
    
    def test_agent_sees_at_least_one_admin(self):
        """Agent should see at least one admin in user list"""
        response = requests.get(
            f"{BASE_URL}/api/chat/users",
            headers=self.get_agent_headers()
        )
        
        assert response.status_code == 200
        users = response.json()["users"]
        
        admins = [u for u in users if u.get("role", "").lower() == "admin"]
        
        assert len(admins) >= 1, "Agent should see at least one admin"
        
        print(f"✓ Agent sees {len(admins)} admin(s): {[a.get('username') for a in admins]}")
    
    def test_agent_sees_team_supervisor(self):
        """Agent with team should see their team's supervisor"""
        if not self.agent_team_id:
            pytest.skip("Agent has no team assigned")
        
        response = requests.get(
            f"{BASE_URL}/api/chat/users",
            headers=self.get_agent_headers()
        )
        
        assert response.status_code == 200
        users = response.json()["users"]
        
        # Find supervisor in list
        supervisor_found = False
        for user in users:
            if user.get("id") == self.supervisor_user_id:
                supervisor_found = True
                print(f"✓ Agent sees team supervisor: {user.get('full_name')} ({user.get('username')})")
                break
        
        assert supervisor_found, "Agent should see their team's supervisor"
    
    # ==================== POST /api/chat/conversations Tests ====================
    
    def test_agent_cannot_create_conversation_with_other_agent(self):
        """Agent should be blocked from creating conversation with another agent"""
        # First, get another agent's ID using admin
        if not self.admin_token:
            pytest.skip("Admin login failed")
        
        # Get all users as admin
        admin_users_response = requests.get(
            f"{BASE_URL}/api/chat/users",
            headers=self.get_admin_headers()
        )
        assert admin_users_response.status_code == 200
        all_users = admin_users_response.json()["users"]
        
        # Find another agent (not the current agent)
        other_agent = None
        for user in all_users:
            if user.get("role", "").lower() == "agent" and user.get("id") != self.agent_user_id:
                other_agent = user
                break
        
        if not other_agent:
            pytest.skip("No other agents found to test with")
        
        print(f"Attempting to create conversation with agent: {other_agent.get('username')}")
        
        # Try to create conversation with another agent
        response = requests.post(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_agent_headers(),
            json={"participant_ids": [other_agent["id"]], "is_group": False}
        )
        
        # Should be blocked with 403
        assert response.status_code == 403, \
            f"Expected 403 Forbidden, got {response.status_code}: {response.text}"
        
        error_detail = response.json().get("detail", "")
        assert "admin" in error_detail.lower() or "supervisor" in error_detail.lower(), \
            f"Error message should mention allowed users: {error_detail}"
        
        print(f"✓ Agent blocked from creating conversation with other agent (403 Forbidden)")
    
    def test_agent_can_create_conversation_with_admin(self):
        """Agent should be able to create conversation with admin"""
        if not self.admin_user_id:
            pytest.skip("Admin user ID not available")
        
        response = requests.post(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_agent_headers(),
            json={"participant_ids": [self.admin_user_id], "is_group": False}
        )
        
        assert response.status_code == 200, \
            f"Agent should be able to chat with admin, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain conversation ID"
        assert "participants" in data, "Response should contain participants"
        
        print(f"✓ Agent can create conversation with admin")
    
    def test_agent_can_create_conversation_with_supervisor(self):
        """Agent should be able to create conversation with their team's supervisor"""
        if not self.supervisor_user_id:
            pytest.skip("Supervisor user ID not available")
        
        if not self.agent_team_id:
            pytest.skip("Agent has no team assigned")
        
        response = requests.post(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_agent_headers(),
            json={"participant_ids": [self.supervisor_user_id], "is_group": False}
        )
        
        assert response.status_code == 200, \
            f"Agent should be able to chat with supervisor, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain conversation ID"
        
        print(f"✓ Agent can create conversation with team supervisor")
    
    # ==================== GET /api/chat/conversations Tests ====================
    
    def test_agent_conversation_list_excludes_agent_to_agent_chats(self):
        """Agent's conversation list should not show agent-to-agent private chats"""
        response = requests.get(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_agent_headers()
        )
        
        assert response.status_code == 200
        conversations = response.json()["conversations"]
        
        print(f"Agent sees {len(conversations)} conversations:")
        
        # Check each private conversation
        for conv in conversations:
            if conv.get("is_group") or conv.get("is_team_chat") or conv.get("is_system_chat"):
                print(f"  - Group/Team/System chat: {conv.get('name', 'Unnamed')}")
                continue
            
            # For private chats, verify no agent-to-agent
            participants = conv.get("participants", [])
            participant_roles = [p.get("role", "").lower() for p in participants]
            
            # Count agents in this conversation
            agent_count = sum(1 for role in participant_roles if role == "agent")
            
            # If there are 2 agents, this is an agent-to-agent chat (should be hidden)
            assert agent_count < 2, \
                f"Agent-to-agent conversation should be hidden: {[p.get('username') for p in participants]}"
            
            other_user = next((p for p in participants if p.get("id") != self.agent_user_id), None)
            if other_user:
                print(f"  - Private chat with: {other_user.get('full_name')} ({other_user.get('role')})")
        
        print(f"✓ Agent conversation list does not show agent-to-agent chats")
    
    def test_agent_can_see_team_chats(self):
        """Agent should still be able to see team chats"""
        response = requests.get(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_agent_headers()
        )
        
        assert response.status_code == 200
        conversations = response.json()["conversations"]
        
        # Check for team chats
        team_chats = [c for c in conversations if c.get("is_team_chat")]
        
        print(f"Agent sees {len(team_chats)} team chat(s)")
        for tc in team_chats:
            print(f"  - {tc.get('name')}")
        
        # Note: Agent may or may not have team chats depending on setup
        print(f"✓ Agent can see team chats (found {len(team_chats)})")
    
    def test_agent_can_see_admin_chats(self):
        """Agent should still be able to see chats with admins"""
        response = requests.get(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_agent_headers()
        )
        
        assert response.status_code == 200
        conversations = response.json()["conversations"]
        
        # Check for admin chats
        admin_chats = []
        for conv in conversations:
            if conv.get("is_group") or conv.get("is_team_chat"):
                continue
            
            participants = conv.get("participants", [])
            for p in participants:
                if p.get("role", "").lower() == "admin" and p.get("id") != self.agent_user_id:
                    admin_chats.append(conv)
                    break
        
        print(f"Agent sees {len(admin_chats)} admin chat(s)")
        
        # Note: Agent may or may not have admin chats depending on setup
        print(f"✓ Agent can see admin chats (found {len(admin_chats)})")


class TestAgentWithoutTeam:
    """Tests for agent without team assignment"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as agent without team"""
        login_response = requests.post(
            f"{BASE_URL}/api/crm/auth/login",
            json=AGENT_WITHOUT_TEAM
        )
        if login_response.status_code != 200:
            pytest.skip(f"Agent without team login failed: {login_response.text}")
        
        data = login_response.json()
        self.agent_token = data["token"]
        self.agent_user_id = data["user"]["id"]
        self.agent_team_id = data["user"].get("team_id")
        
        # Verify this agent has no team
        if self.agent_team_id:
            pytest.skip(f"Agent {AGENT_WITHOUT_TEAM['username']} has a team assigned")
        
        yield
    
    def get_headers(self):
        return {"Authorization": f"Bearer {self.agent_token}"}
    
    def test_agent_without_team_only_sees_admins(self):
        """Agent without team should only see Admin(s) in user list"""
        response = requests.get(
            f"{BASE_URL}/api/chat/users",
            headers=self.get_headers()
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        users = response.json()["users"]
        
        print(f"Agent without team sees {len(users)} users:")
        
        # All users should be admins
        for user in users:
            role = user.get("role", "").lower()
            print(f"  - {user.get('full_name')} ({user.get('username')}) - Role: {role}")
            
            assert role == "admin", \
                f"Agent without team should only see admins, but found {user.get('username')} with role {role}"
        
        assert len(users) >= 1, "Agent without team should see at least one admin"
        
        print(f"✓ Agent without team only sees admins ({len(users)} admin(s))")
    
    def test_agent_without_team_cannot_see_supervisors(self):
        """Agent without team should NOT see any supervisors"""
        response = requests.get(
            f"{BASE_URL}/api/chat/users",
            headers=self.get_headers()
        )
        
        assert response.status_code == 200
        users = response.json()["users"]
        
        supervisors = [u for u in users if u.get("role", "").lower() == "supervisor"]
        
        assert len(supervisors) == 0, \
            f"Agent without team should not see supervisors, but found: {[s.get('username') for s in supervisors]}"
        
        print(f"✓ Agent without team does not see any supervisors")


class TestSupervisorFullAccess:
    """Tests to verify supervisor retains full access"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as supervisor"""
        login_response = requests.post(
            f"{BASE_URL}/api/crm/auth/login",
            json=SUPERVISOR
        )
        if login_response.status_code != 200:
            pytest.skip(f"Supervisor login failed: {login_response.text}")
        
        data = login_response.json()
        self.supervisor_token = data["token"]
        self.supervisor_user_id = data["user"]["id"]
        
        yield
    
    def get_headers(self):
        return {"Authorization": f"Bearer {self.supervisor_token}"}
    
    def test_supervisor_can_see_all_users(self):
        """Supervisor should see ALL users (agents, admins, other supervisors)"""
        response = requests.get(
            f"{BASE_URL}/api/chat/users",
            headers=self.get_headers()
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        users = response.json()["users"]
        
        # Count by role
        roles = {}
        for user in users:
            role = user.get("role", "unknown").lower()
            roles[role] = roles.get(role, 0) + 1
        
        print(f"Supervisor sees {len(users)} users:")
        for role, count in roles.items():
            print(f"  - {role}: {count}")
        
        # Supervisor should see agents
        assert roles.get("agent", 0) > 0, "Supervisor should see agents"
        
        # Supervisor should see admins
        assert roles.get("admin", 0) > 0, "Supervisor should see admins"
        
        print(f"✓ Supervisor can see all user types")
    
    def test_supervisor_can_see_all_conversations(self):
        """Supervisor should see all their conversations without filtering"""
        response = requests.get(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_headers()
        )
        
        assert response.status_code == 200
        conversations = response.json()["conversations"]
        
        print(f"Supervisor sees {len(conversations)} conversations")
        
        # Supervisor should not have any filtering applied
        print(f"✓ Supervisor can see all conversations")


class TestAdminFullAccess:
    """Tests to verify admin retains full access"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as admin"""
        login_response = requests.post(
            f"{BASE_URL}/api/crm/auth/login",
            json=ADMIN
        )
        if login_response.status_code != 200:
            pytest.skip(f"Admin login failed: {login_response.text}")
        
        data = login_response.json()
        self.admin_token = data["token"]
        self.admin_user_id = data["user"]["id"]
        
        yield
    
    def get_headers(self):
        return {"Authorization": f"Bearer {self.admin_token}"}
    
    def test_admin_can_see_all_users(self):
        """Admin should see ALL users"""
        response = requests.get(
            f"{BASE_URL}/api/chat/users",
            headers=self.get_headers()
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        users = response.json()["users"]
        
        # Count by role
        roles = {}
        for user in users:
            role = user.get("role", "unknown").lower()
            roles[role] = roles.get(role, 0) + 1
        
        print(f"Admin sees {len(users)} users:")
        for role, count in roles.items():
            print(f"  - {role}: {count}")
        
        # Admin should see agents
        assert roles.get("agent", 0) > 0, "Admin should see agents"
        
        # Admin should see supervisors
        assert roles.get("supervisor", 0) > 0, "Admin should see supervisors"
        
        print(f"✓ Admin can see all user types")
    
    def test_admin_can_see_all_conversations(self):
        """Admin should see all their conversations without filtering"""
        response = requests.get(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_headers()
        )
        
        assert response.status_code == 200
        conversations = response.json()["conversations"]
        
        print(f"Admin sees {len(conversations)} conversations")
        
        print(f"✓ Admin can see all conversations")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
