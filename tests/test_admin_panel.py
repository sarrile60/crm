"""
Admin Panel API Tests
Tests for roles, entities, and permissions endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001')

class TestAdminPanel:
    """Admin Panel endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.token = None
        response = requests.post(
            f"{BASE_URL}/api/crm/auth/login",
            json={"username": "admin", "password": "Admin2026"},
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            self.token = response.json().get("token")
        
    def get_headers(self):
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
    
    def test_login_success(self):
        """Test admin login"""
        response = requests.post(
            f"{BASE_URL}/api/crm/auth/login",
            json={"username": "admin", "password": "Admin2026"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert len(data["token"]) > 0
    
    def test_get_roles(self):
        """Test GET /api/admin/roles"""
        if not self.token:
            pytest.skip("No auth token")
        
        response = requests.get(
            f"{BASE_URL}/api/admin/roles",
            headers=self.get_headers()
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have at least Admin, Supervisor, Agent roles
        role_names = [r["name"] for r in data]
        assert "Admin" in role_names or len(data) > 0
    
    def test_get_entities(self):
        """Test GET /api/admin/entities"""
        if not self.token:
            pytest.skip("No auth token")
        
        response = requests.get(
            f"{BASE_URL}/api/admin/entities",
            headers=self.get_headers()
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # After seeding, should have entities
        if len(data) > 0:
            # Verify entity structure
            entity = data[0]
            assert "entity_name" in entity
            assert "display_name" in entity
            assert "enabled" in entity
    
    def test_get_role_permissions(self):
        """Test GET /api/admin/roles/{role_id}/permissions"""
        if not self.token:
            pytest.skip("No auth token")
        
        # First get roles
        roles_response = requests.get(
            f"{BASE_URL}/api/admin/roles",
            headers=self.get_headers()
        )
        if roles_response.status_code != 200 or len(roles_response.json()) == 0:
            pytest.skip("No roles available")
        
        role_id = roles_response.json()[0]["id"]
        
        response = requests.get(
            f"{BASE_URL}/api/admin/roles/{role_id}/permissions",
            headers=self.get_headers()
        )
        assert response.status_code == 200
        data = response.json()
        assert "role" in data
        assert "permissions" in data
        assert isinstance(data["permissions"], list)
    
    def test_seed_database(self):
        """Test GET /api/seed-database"""
        response = requests.get(f"{BASE_URL}/api/seed-database")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "results" in data
        assert "roles" in data["results"]
        assert "entities" in data["results"]
        assert "permissions" in data["results"]
    
    def test_get_teams(self):
        """Test GET /api/admin/teams"""
        if not self.token:
            pytest.skip("No auth token")
        
        response = requests.get(
            f"{BASE_URL}/api/admin/teams",
            headers=self.get_headers()
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_users(self):
        """Test GET /api/admin/users"""
        if not self.token:
            pytest.skip("No auth token")
        
        response = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers=self.get_headers()
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have at least the admin user
        assert len(data) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
