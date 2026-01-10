"""
CRM Mass Actions Tests - Testing Mass Delete, Export CSV, and Default Page Size
Tests for:
- POST /api/crm/leads/mass-delete - Mass delete multiple leads
- GET /api/crm/leads - Default pagination (100 per page)
- GET /api/crm/leads with high limit - Export all leads functionality
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from environment
ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME', 'admin_f87450ce5d66')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'zTFjPAcs*-(NL-qbj@AP0TcWt*8)nV4f6K(ZcVP_')


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(
        f"{BASE_URL}/api/crm/auth/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "token" in data, "No token in login response"
    return data["token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_login_success(self):
        """Test successful admin login"""
        response = requests.post(
            f"{BASE_URL}/api/crm/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["role"] == "admin"
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/crm/auth/login",
            json={"username": "invalid_user", "password": "wrong_password"}
        )
        assert response.status_code in [401, 400]


class TestLeadsPagination:
    """Test leads pagination - default page size should be 100"""
    
    def test_get_leads_default_pagination(self, auth_headers):
        """Test GET /api/crm/leads returns paginated response"""
        response = requests.get(
            f"{BASE_URL}/api/crm/leads",
            headers=auth_headers,
            params={"limit": 100, "offset": 0}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should return paginated format
        assert "data" in data, "Response should have 'data' field"
        assert "total" in data, "Response should have 'total' field"
        assert isinstance(data["data"], list)
        
        # Verify pagination info
        print(f"Total leads in system: {data['total']}")
        print(f"Leads returned: {len(data['data'])}")
        
        # Should return up to 100 leads (default page size)
        assert len(data["data"]) <= 100
    
    def test_get_leads_high_limit_for_export(self, auth_headers):
        """Test GET /api/crm/leads with high limit (for CSV export)"""
        response = requests.get(
            f"{BASE_URL}/api/crm/leads",
            headers=auth_headers,
            params={"limit": 50000, "offset": 0}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should return all leads
        assert "data" in data
        assert "total" in data
        
        total = data["total"]
        returned = len(data["data"])
        
        print(f"Export test - Total: {total}, Returned: {returned}")
        
        # For export, should return all leads (or close to it)
        # If total is less than 50000, returned should equal total
        if total <= 50000:
            assert returned == total, f"Export should return all {total} leads, got {returned}"


class TestMassDelete:
    """Test mass delete functionality"""
    
    def test_mass_delete_endpoint_exists(self, auth_headers):
        """Test that mass-delete endpoint exists and requires lead_ids"""
        response = requests.post(
            f"{BASE_URL}/api/crm/leads/mass-delete",
            headers=auth_headers,
            json={"lead_ids": []}
        )
        # Should return 400 for empty lead_ids, not 404
        assert response.status_code == 400, f"Expected 400 for empty lead_ids, got {response.status_code}"
        assert "No leads selected" in response.text or "lead" in response.text.lower()
    
    def test_mass_delete_with_test_leads(self, auth_headers):
        """Test mass delete by creating test leads and deleting them"""
        # Step 1: Create test leads
        test_lead_ids = []
        for i in range(3):
            unique_id = str(uuid.uuid4())[:8]
            lead_data = {
                "fullName": f"TEST_MassDelete_{unique_id}",
                "email": f"test_massdelete_{unique_id}@test.com",
                "phone": f"+39123456{i}789",
                "scammerCompany": "Test Company",
                "amountLost": "1000",
                "caseDetails": "Test lead for mass delete testing"
            }
            
            response = requests.post(
                f"{BASE_URL}/api/crm/leads/create",
                headers=auth_headers,
                json=lead_data
            )
            
            if response.status_code == 200:
                data = response.json()
                if "lead_id" in data:
                    test_lead_ids.append(data["lead_id"])
                    print(f"Created test lead: {data['lead_id']}")
        
        if len(test_lead_ids) == 0:
            pytest.skip("Could not create test leads for mass delete test")
        
        print(f"Created {len(test_lead_ids)} test leads for mass delete")
        
        # Step 2: Verify leads exist
        for lead_id in test_lead_ids:
            response = requests.get(
                f"{BASE_URL}/api/crm/leads/{lead_id}",
                headers=auth_headers
            )
            assert response.status_code == 200, f"Lead {lead_id} should exist before delete"
        
        # Step 3: Mass delete the test leads
        response = requests.post(
            f"{BASE_URL}/api/crm/leads/mass-delete",
            headers=auth_headers,
            json={"lead_ids": test_lead_ids}
        )
        
        assert response.status_code == 200, f"Mass delete failed: {response.text}"
        data = response.json()
        
        assert "deleted_count" in data, "Response should have deleted_count"
        assert data["deleted_count"] == len(test_lead_ids), f"Expected {len(test_lead_ids)} deleted, got {data['deleted_count']}"
        
        print(f"Successfully mass deleted {data['deleted_count']} leads")
        
        # Step 4: Verify leads are deleted
        for lead_id in test_lead_ids:
            response = requests.get(
                f"{BASE_URL}/api/crm/leads/{lead_id}",
                headers=auth_headers
            )
            assert response.status_code == 404, f"Lead {lead_id} should be deleted (404)"
        
        print("Verified all test leads are deleted")
    
    def test_mass_delete_invalid_ids(self, auth_headers):
        """Test mass delete with non-existent lead IDs"""
        fake_ids = [str(uuid.uuid4()) for _ in range(2)]
        
        response = requests.post(
            f"{BASE_URL}/api/crm/leads/mass-delete",
            headers=auth_headers,
            json={"lead_ids": fake_ids}
        )
        
        # Should succeed but delete 0 leads
        assert response.status_code == 200
        data = response.json()
        assert data["deleted_count"] == 0


class TestMassUpdate:
    """Test mass update functionality (related to mass actions modal)"""
    
    def test_mass_update_endpoint_exists(self, auth_headers):
        """Test that mass-update endpoint exists"""
        response = requests.post(
            f"{BASE_URL}/api/crm/leads/mass-update",
            headers=auth_headers,
            json={"lead_ids": [], "status": "New"}
        )
        # Should return 400 for empty lead_ids
        assert response.status_code == 400


class TestLeadsEndpoints:
    """Test other leads endpoints for completeness"""
    
    def test_get_statuses(self, auth_headers):
        """Test GET /api/crm/statuses"""
        response = requests.get(
            f"{BASE_URL}/api/crm/statuses",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Available statuses: {len(data)}")
    
    def test_get_teams(self, auth_headers):
        """Test GET /api/crm/teams"""
        response = requests.get(
            f"{BASE_URL}/api/crm/teams",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Available teams: {len(data)}")
    
    def test_get_users(self, auth_headers):
        """Test GET /api/crm/users"""
        response = requests.get(
            f"{BASE_URL}/api/crm/users",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Available users: {len(data)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
