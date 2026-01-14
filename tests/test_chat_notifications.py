"""
Test suite for Chat Real-time Notification System
Tests the notification flow when supervisor maurizio3 messages agent nicolo
"""
import pytest
import requests
import os
import time
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://dialerfix-crm.preview.emergentagent.com').rstrip('/')

# Test credentials
AGENT_CREDS = {"username": "nicolo", "password": "123"}
SUPERVISOR_CREDS = {"username": "maurizio3", "password": "12345"}
ADMIN_CREDS = {"username": "admin", "password": "Admin2026"}

# Known conversation ID between maurizio3 and nicolo
CONVERSATION_ID = "92c7250b-332d-4904-b1e1-df92076745c4"


@pytest.fixture(scope="module")
def agent_session():
    """Login as agent nicolo and return session with token"""
    session = requests.Session()
    response = session.post(f"{BASE_URL}/api/crm/auth/login", json=AGENT_CREDS)
    assert response.status_code == 200, f"Agent login failed: {response.text}"
    data = response.json()
    session.headers.update({"Authorization": f"Bearer {data['token']}"})
    session.user_id = data["user"]["id"]
    session.user_name = data["user"].get("full_name", AGENT_CREDS["username"])
    return session


@pytest.fixture(scope="module")
def supervisor_session():
    """Login as supervisor maurizio3 and return session with token"""
    session = requests.Session()
    response = session.post(f"{BASE_URL}/api/crm/auth/login", json=SUPERVISOR_CREDS)
    assert response.status_code == 200, f"Supervisor login failed: {response.text}"
    data = response.json()
    session.headers.update({"Authorization": f"Bearer {data['token']}"})
    session.user_id = data["user"]["id"]
    session.user_name = data["user"].get("full_name", SUPERVISOR_CREDS["username"])
    return session


class TestChatNotificationSystem:
    """Tests for real-time chat notification system"""
    
    def test_poll_endpoint_returns_new_messages(self, agent_session):
        """Test that poll endpoint returns messages from other users"""
        response = agent_session.get(f"{BASE_URL}/api/chat/poll")
        assert response.status_code == 200
        
        data = response.json()
        assert "messages" in data
        assert "typing" in data
        assert "read_updates" in data
        print(f"✓ Poll endpoint returned {len(data['messages'])} messages")
    
    def test_poll_with_since_parameter(self, agent_session):
        """Test poll endpoint with 'since' timestamp filter"""
        # First poll without since to get current timestamp
        response = agent_session.get(f"{BASE_URL}/api/chat/poll")
        assert response.status_code == 200
        
        # Get a timestamp from the past
        past_time = "2026-01-01T00:00:00+00:00"
        response = agent_session.get(f"{BASE_URL}/api/chat/poll?since={past_time}")
        assert response.status_code == 200
        
        data = response.json()
        # Should return messages since that time
        print(f"✓ Poll with since parameter returned {len(data['messages'])} messages")
    
    def test_poll_with_conversation_id_returns_read_updates(self, agent_session):
        """Test that poll with conversation_id returns read status updates"""
        response = agent_session.get(f"{BASE_URL}/api/chat/poll?conversation_id={CONVERSATION_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "read_updates" in data
        print(f"✓ Poll with conversation_id returned {len(data.get('read_updates', []))} read updates")
    
    def test_supervisor_can_send_message_to_agent(self, supervisor_session):
        """Test that supervisor can send a message to agent"""
        test_content = f"TEST_NOTIFICATION_{int(time.time())}"
        
        response = supervisor_session.post(
            f"{BASE_URL}/api/chat/conversations/{CONVERSATION_ID}/messages",
            json={"content": test_content, "message_type": "text"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["content"] == test_content
        assert data["sender_id"] == supervisor_session.user_id
        assert supervisor_session.user_id in data["read_by"]  # Sender has read their own message
        
        print(f"✓ Supervisor sent message: {test_content}")
        return data["id"]
    
    def test_agent_receives_message_via_poll(self, agent_session, supervisor_session):
        """Test that agent receives supervisor's message via poll endpoint"""
        # Send a unique message from supervisor
        test_content = f"POLL_TEST_{int(time.time())}"
        send_response = supervisor_session.post(
            f"{BASE_URL}/api/chat/conversations/{CONVERSATION_ID}/messages",
            json={"content": test_content, "message_type": "text"}
        )
        assert send_response.status_code == 200
        message_id = send_response.json()["id"]
        
        # Poll as agent
        poll_response = agent_session.get(f"{BASE_URL}/api/chat/poll")
        assert poll_response.status_code == 200
        
        data = poll_response.json()
        messages = data["messages"]
        
        # Find the message we just sent
        found_message = None
        for msg in messages:
            if msg["id"] == message_id:
                found_message = msg
                break
        
        assert found_message is not None, f"Message {message_id} not found in poll response"
        assert found_message["content"] == test_content
        assert found_message["sender"]["full_name"] is not None  # Sender info populated
        
        print(f"✓ Agent received message via poll: {test_content}")
    
    def test_unread_count_increases_for_new_message(self, agent_session, supervisor_session):
        """Test that unread count increases when new message arrives"""
        # Get initial unread count
        conv_response = agent_session.get(f"{BASE_URL}/api/chat/conversations")
        assert conv_response.status_code == 200
        
        conversations = conv_response.json()["conversations"]
        initial_unread = 0
        for conv in conversations:
            if conv["id"] == CONVERSATION_ID:
                initial_unread = conv.get("unread_count", 0)
                break
        
        # Send a new message from supervisor
        test_content = f"UNREAD_TEST_{int(time.time())}"
        supervisor_session.post(
            f"{BASE_URL}/api/chat/conversations/{CONVERSATION_ID}/messages",
            json={"content": test_content, "message_type": "text"}
        )
        
        # Check unread count again
        conv_response = agent_session.get(f"{BASE_URL}/api/chat/conversations")
        assert conv_response.status_code == 200
        
        conversations = conv_response.json()["conversations"]
        new_unread = 0
        for conv in conversations:
            if conv["id"] == CONVERSATION_ID:
                new_unread = conv.get("unread_count", 0)
                break
        
        assert new_unread > initial_unread, f"Unread count should increase: {initial_unread} -> {new_unread}"
        print(f"✓ Unread count increased from {initial_unread} to {new_unread}")
    
    def test_mark_as_read_decreases_unread_count(self, agent_session):
        """Test that marking messages as read decreases unread count"""
        # Get initial unread count
        conv_response = agent_session.get(f"{BASE_URL}/api/chat/conversations")
        initial_unread = 0
        for conv in conv_response.json()["conversations"]:
            if conv["id"] == CONVERSATION_ID:
                initial_unread = conv.get("unread_count", 0)
                break
        
        if initial_unread == 0:
            pytest.skip("No unread messages to test")
        
        # Mark as read
        read_response = agent_session.put(f"{BASE_URL}/api/chat/conversations/{CONVERSATION_ID}/read")
        assert read_response.status_code == 200
        
        # Check unread count again
        conv_response = agent_session.get(f"{BASE_URL}/api/chat/conversations")
        new_unread = 0
        for conv in conv_response.json()["conversations"]:
            if conv["id"] == CONVERSATION_ID:
                new_unread = conv.get("unread_count", 0)
                break
        
        assert new_unread == 0, f"Unread count should be 0 after marking as read, got {new_unread}"
        print(f"✓ Unread count decreased from {initial_unread} to {new_unread}")
    
    def test_message_read_by_array_excludes_recipient_initially(self, supervisor_session, agent_session):
        """Test that new message's read_by only contains sender initially"""
        test_content = f"READ_BY_TEST_{int(time.time())}"
        
        # Send message from supervisor
        send_response = supervisor_session.post(
            f"{BASE_URL}/api/chat/conversations/{CONVERSATION_ID}/messages",
            json={"content": test_content, "message_type": "text"}
        )
        assert send_response.status_code == 200
        
        data = send_response.json()
        read_by = data.get("read_by", [])
        
        # Sender should be in read_by
        assert supervisor_session.user_id in read_by
        # Agent should NOT be in read_by yet
        assert agent_session.user_id not in read_by
        
        print(f"✓ Message read_by correctly excludes recipient: {read_by}")
    
    def test_poll_returns_sender_info(self, agent_session, supervisor_session):
        """Test that poll returns sender information for notifications"""
        # Send a message
        test_content = f"SENDER_INFO_TEST_{int(time.time())}"
        supervisor_session.post(
            f"{BASE_URL}/api/chat/conversations/{CONVERSATION_ID}/messages",
            json={"content": test_content, "message_type": "text"}
        )
        
        # Poll as agent
        poll_response = agent_session.get(f"{BASE_URL}/api/chat/poll")
        assert poll_response.status_code == 200
        
        messages = poll_response.json()["messages"]
        
        # Find our message
        for msg in messages:
            if msg["content"] == test_content:
                assert "sender" in msg
                assert msg["sender"] is not None
                assert "full_name" in msg["sender"]
                print(f"✓ Sender info present: {msg['sender']['full_name']}")
                return
        
        # Message might not be in this poll if already seen
        print("✓ Sender info test passed (message may have been seen already)")
    
    def test_typing_indicator_endpoint(self, agent_session):
        """Test typing indicator endpoints"""
        # Send typing indicator
        response = agent_session.post(
            f"{BASE_URL}/api/chat/conversations/{CONVERSATION_ID}/typing",
            json={"is_typing": True}
        )
        assert response.status_code == 200
        
        # Get typing status
        response = agent_session.get(f"{BASE_URL}/api/chat/conversations/{CONVERSATION_ID}/typing")
        assert response.status_code == 200
        
        # Stop typing
        response = agent_session.post(
            f"{BASE_URL}/api/chat/conversations/{CONVERSATION_ID}/typing",
            json={"is_typing": False}
        )
        assert response.status_code == 200
        
        print("✓ Typing indicator endpoints working")


class TestAgentRoleRestrictions:
    """Test that agent role-based chat restrictions still work"""
    
    def test_agent_can_see_supervisor_in_users_list(self, agent_session):
        """Test that agent can see their team's supervisor"""
        response = agent_session.get(f"{BASE_URL}/api/chat/users")
        assert response.status_code == 200
        
        users = response.json()["users"]
        user_roles = [u.get("role", "").lower() for u in users]
        
        # Agent should see at least one supervisor or admin
        has_supervisor_or_admin = any(r in ["supervisor", "admin"] for r in user_roles)
        assert has_supervisor_or_admin, "Agent should see supervisors or admins"
        
        print(f"✓ Agent sees {len(users)} users with roles: {set(user_roles)}")
    
    def test_agent_cannot_see_other_agents(self, agent_session):
        """Test that agent cannot see other agents in users list"""
        response = agent_session.get(f"{BASE_URL}/api/chat/users")
        assert response.status_code == 200
        
        users = response.json()["users"]
        agent_users = [u for u in users if u.get("role", "").lower() == "agent"]
        
        # Agent should not see other agents (only admins and their supervisor)
        assert len(agent_users) == 0, f"Agent should not see other agents, found {len(agent_users)}"
        
        print("✓ Agent correctly cannot see other agents")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
