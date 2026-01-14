"""
Test suite for Chat Widget 'Unknown User' bug fix
Bug: When clicking to chat with an agent as supervisor, the name in the chatbox shows 'Unknown User' on first click
Fix: Added populate_conversation_participants helper function that populates participant details for conversations
     This helper is now called in POST /conversations endpoint for both new and existing conversations
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestChatUnknownUserFix:
    """Tests for the 'Unknown User' bug fix in chat widget"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.supervisor_token = None
        self.admin_token = None
        self.supervisor_user_id = None
        self.test_user_id = None
        
        # Login as supervisor (maurizio1)
        login_response = requests.post(
            f"{BASE_URL}/api/crm/auth/login",
            json={"username": "maurizio1", "password": "12345"}
        )
        assert login_response.status_code == 200, f"Supervisor login failed: {login_response.text}"
        data = login_response.json()
        self.supervisor_token = data["token"]
        self.supervisor_user_id = data["user"]["id"]
        
        # Login as admin
        admin_login = requests.post(
            f"{BASE_URL}/api/crm/auth/login",
            json={"username": "admin", "password": "Admin2026"}
        )
        if admin_login.status_code == 200:
            self.admin_token = admin_login.json()["token"]
        
        yield
    
    def get_headers(self, token=None):
        """Get authorization headers"""
        return {"Authorization": f"Bearer {token or self.supervisor_token}"}
    
    # ==================== POST /api/chat/conversations Tests ====================
    
    def test_post_conversations_new_returns_participants_with_full_name(self):
        """POST /api/chat/conversations for NEW conversation should return participants with full_name"""
        # Get available users
        users_response = requests.get(
            f"{BASE_URL}/api/chat/users",
            headers=self.get_headers()
        )
        assert users_response.status_code == 200
        users = users_response.json()["users"]
        
        # Find a user to chat with (not the current user)
        target_user = None
        for user in users:
            if user["id"] != self.supervisor_user_id:
                target_user = user
                break
        
        assert target_user is not None, "No other users available to chat with"
        
        # Create/get conversation
        response = requests.post(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_headers(),
            json={"participant_ids": [target_user["id"]], "is_group": False}
        )
        
        assert response.status_code == 200, f"Failed to create conversation: {response.text}"
        data = response.json()
        
        # Verify participants array exists
        assert "participants" in data, "Response missing 'participants' array"
        assert len(data["participants"]) >= 2, "Participants array should have at least 2 users"
        
        # Verify each participant has full_name
        for participant in data["participants"]:
            assert "full_name" in participant, f"Participant {participant.get('id')} missing 'full_name'"
            assert participant["full_name"] is not None, f"Participant {participant.get('id')} has null full_name"
            assert participant["full_name"] != "Unknown User", f"Participant {participant.get('id')} has 'Unknown User' as name"
            assert "id" in participant, "Participant missing 'id'"
            assert "username" in participant, "Participant missing 'username'"
            assert "role" in participant, "Participant missing 'role'"
        
        print(f"✓ POST /conversations returns participants with full_name for new conversation")
        print(f"  Participants: {[p['full_name'] for p in data['participants']]}")
    
    def test_post_conversations_existing_returns_participants_with_full_name(self):
        """POST /api/chat/conversations for EXISTING conversation should return participants with full_name"""
        # Get existing conversations
        conv_response = requests.get(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_headers()
        )
        assert conv_response.status_code == 200
        conversations = conv_response.json()["conversations"]
        
        # Find an existing private conversation
        existing_conv = None
        for conv in conversations:
            if not conv.get("is_group") and not conv.get("is_system_chat"):
                existing_conv = conv
                break
        
        if existing_conv is None:
            pytest.skip("No existing private conversations to test")
        
        # Get the other participant's ID
        other_participant_id = None
        for pid in existing_conv["participant_ids"]:
            if pid != self.supervisor_user_id:
                other_participant_id = pid
                break
        
        assert other_participant_id is not None, "Could not find other participant"
        
        # POST to get/create conversation (should return existing)
        response = requests.post(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_headers(),
            json={"participant_ids": [other_participant_id], "is_group": False}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Should return the existing conversation
        assert data["id"] == existing_conv["id"], "Should return existing conversation"
        
        # Verify participants array exists with full_name
        assert "participants" in data, "Response missing 'participants' array"
        
        for participant in data["participants"]:
            assert "full_name" in participant, f"Participant {participant.get('id')} missing 'full_name'"
            assert participant["full_name"] is not None, f"Participant has null full_name"
            assert participant["full_name"] != "Unknown User", f"Participant has 'Unknown User' as name"
        
        print(f"✓ POST /conversations returns participants with full_name for existing conversation")
        print(f"  Conversation ID: {data['id']}")
        print(f"  Participants: {[p['full_name'] for p in data['participants']]}")
    
    # ==================== GET /api/chat/conversations Tests ====================
    
    def test_get_conversations_returns_participants_with_full_name(self):
        """GET /api/chat/conversations should return all conversations with participants having full_name"""
        response = requests.get(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_headers()
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "conversations" in data, "Response missing 'conversations' array"
        
        for conv in data["conversations"]:
            assert "participants" in conv, f"Conversation {conv['id']} missing 'participants'"
            
            for participant in conv["participants"]:
                assert "full_name" in participant, f"Participant in conv {conv['id']} missing 'full_name'"
                assert participant["full_name"] is not None, f"Participant has null full_name"
                assert participant["full_name"] != "Unknown User", f"Participant has 'Unknown User' as name"
        
        print(f"✓ GET /conversations returns {len(data['conversations'])} conversations with participants")
    
    # ==================== System Notifications Tests ====================
    
    def test_system_notifications_participant_has_full_name(self):
        """System notifications conversation should have proper participant info"""
        response = requests.get(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_headers()
        )
        
        assert response.status_code == 200
        conversations = response.json()["conversations"]
        
        # Find system notifications conversation
        system_conv = None
        for conv in conversations:
            if conv.get("is_system_chat"):
                system_conv = conv
                break
        
        if system_conv is None:
            pytest.skip("No system notifications conversation found")
        
        # Verify system participant has proper info
        system_participant = None
        for p in system_conv["participants"]:
            if p["id"] == "system_notifications":
                system_participant = p
                break
        
        assert system_participant is not None, "System participant not found"
        assert system_participant["full_name"] == "⚠️ System Alerts", f"System participant has wrong name: {system_participant['full_name']}"
        assert system_participant["role"] == "system", "System participant has wrong role"
        
        print(f"✓ System notifications participant has correct full_name: {system_participant['full_name']}")
    
    # ==================== Chat Widget Flow Tests ====================
    
    def test_new_conversation_flow_no_unknown_user(self):
        """Simulate the chat widget flow: click user -> create conversation -> display name"""
        # Step 1: Get available users (like clicking "New Conversation")
        users_response = requests.get(
            f"{BASE_URL}/api/chat/users",
            headers=self.get_headers()
        )
        assert users_response.status_code == 200
        users = users_response.json()["users"]
        
        # Step 2: Select a user (simulate clicking on a user in the list)
        target_user = users[0]  # First available user
        
        # Step 3: Create/get conversation (this is what happens on click)
        conv_response = requests.post(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_headers(),
            json={"participant_ids": [target_user["id"]], "is_group": False}
        )
        assert conv_response.status_code == 200
        conversation = conv_response.json()
        
        # Step 4: Verify the conversation name can be determined (simulating getConversationName)
        # The frontend function: const otherUser = conv.participants?.find(p => p.id !== currentUser?.id);
        # return otherUser?.full_name || 'Unknown User';
        
        other_user = None
        for p in conversation["participants"]:
            if p["id"] != self.supervisor_user_id:
                other_user = p
                break
        
        assert other_user is not None, "Could not find other user in participants"
        
        # This is the key assertion - the name should NOT be 'Unknown User'
        display_name = other_user.get("full_name") or "Unknown User"
        assert display_name != "Unknown User", f"Bug not fixed! Display name is still 'Unknown User'"
        assert display_name == target_user["full_name"], f"Display name mismatch: {display_name} vs {target_user['full_name']}"
        
        print(f"✓ New conversation flow works correctly")
        print(f"  Selected user: {target_user['full_name']}")
        print(f"  Display name in chat: {display_name}")
    
    def test_existing_conversation_click_no_unknown_user(self):
        """Simulate clicking on an existing conversation - should show correct name"""
        # Get conversations
        response = requests.get(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_headers()
        )
        assert response.status_code == 200
        conversations = response.json()["conversations"]
        
        # Find a private conversation
        private_conv = None
        for conv in conversations:
            if not conv.get("is_group") and not conv.get("is_system_chat"):
                private_conv = conv
                break
        
        if private_conv is None:
            pytest.skip("No private conversations to test")
        
        # Simulate getConversationName function
        other_user = None
        for p in private_conv["participants"]:
            if p["id"] != self.supervisor_user_id:
                other_user = p
                break
        
        display_name = other_user.get("full_name") if other_user else "Unknown User"
        
        assert display_name != "Unknown User", f"Bug! Existing conversation shows 'Unknown User'"
        
        print(f"✓ Existing conversation click shows correct name: {display_name}")
    
    # ==================== Edge Cases ====================
    
    def test_conversation_with_multiple_participants(self):
        """Group conversations should have all participants with full_name"""
        response = requests.get(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_headers()
        )
        assert response.status_code == 200
        conversations = response.json()["conversations"]
        
        # Find a group conversation
        group_conv = None
        for conv in conversations:
            if conv.get("is_group") or conv.get("is_team_chat"):
                group_conv = conv
                break
        
        if group_conv is None:
            pytest.skip("No group conversations to test")
        
        # All participants should have full_name
        for p in group_conv["participants"]:
            assert "full_name" in p, f"Participant {p.get('id')} missing full_name"
            assert p["full_name"] is not None, f"Participant {p.get('id')} has null full_name"
        
        print(f"✓ Group conversation '{group_conv.get('name')}' has {len(group_conv['participants'])} participants with names")


class TestChatBasicFunctionality:
    """Basic chat functionality tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        login_response = requests.post(
            f"{BASE_URL}/api/crm/auth/login",
            json={"username": "maurizio1", "password": "12345"}
        )
        assert login_response.status_code == 200
        self.token = login_response.json()["token"]
        self.user_id = login_response.json()["user"]["id"]
        yield
    
    def get_headers(self):
        return {"Authorization": f"Bearer {self.token}"}
    
    def test_get_chat_users(self):
        """GET /api/chat/users should return list of users"""
        response = requests.get(
            f"{BASE_URL}/api/chat/users",
            headers=self.get_headers()
        )
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        assert len(data["users"]) > 0
        
        # Each user should have required fields
        for user in data["users"]:
            assert "id" in user
            assert "full_name" in user
            assert "username" in user
            assert "role" in user
        
        print(f"✓ GET /chat/users returns {len(data['users'])} users")
    
    def test_get_conversations(self):
        """GET /api/chat/conversations should return conversations"""
        response = requests.get(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_headers()
        )
        assert response.status_code == 200
        data = response.json()
        assert "conversations" in data
        print(f"✓ GET /chat/conversations returns {len(data['conversations'])} conversations")
    
    def test_send_message(self):
        """POST /api/chat/conversations/{id}/messages should send a message"""
        # Get a conversation
        conv_response = requests.get(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_headers()
        )
        assert conv_response.status_code == 200
        conversations = conv_response.json()["conversations"]
        
        if not conversations:
            pytest.skip("No conversations to test message sending")
        
        conv_id = conversations[0]["id"]
        
        # Send a test message
        response = requests.post(
            f"{BASE_URL}/api/chat/conversations/{conv_id}/messages",
            headers=self.get_headers(),
            json={"content": "Test message from pytest", "message_type": "text"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["content"] == "Test message from pytest"
        assert "sender" in data
        assert data["sender"]["full_name"] is not None
        
        print(f"✓ Message sent successfully to conversation {conv_id}")
    
    def test_get_messages(self):
        """GET /api/chat/conversations/{id}/messages should return messages"""
        # Get a conversation
        conv_response = requests.get(
            f"{BASE_URL}/api/chat/conversations",
            headers=self.get_headers()
        )
        assert conv_response.status_code == 200
        conversations = conv_response.json()["conversations"]
        
        if not conversations:
            pytest.skip("No conversations to test")
        
        conv_id = conversations[0]["id"]
        
        # Get messages
        response = requests.get(
            f"{BASE_URL}/api/chat/conversations/{conv_id}/messages",
            headers=self.get_headers()
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "messages" in data
        
        # Each message should have sender info
        for msg in data["messages"]:
            assert "sender" in msg
            if msg["sender"]:
                assert "full_name" in msg["sender"]
        
        print(f"✓ GET /chat/conversations/{conv_id}/messages returns {len(data['messages'])} messages")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
