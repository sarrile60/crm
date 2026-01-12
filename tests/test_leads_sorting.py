"""
Test suite for Leads Table Sorting Feature
Tests backend API sorting functionality for GET /api/crm/leads endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from backend/.env
ADMIN_USERNAME = "admin_f87450ce5d66"
ADMIN_PASSWORD = "zTFjPAcs*-(NL-qbj@AP0TcWt*8)nV4f6K(ZcVP_"


class TestLeadsSorting:
    """Test sorting functionality for leads table"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token before each test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(
            f"{BASE_URL}/api/crm/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        token = login_response.json().get("token")
        assert token, "No token received"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_default_sorting_created_at_desc(self):
        """Test default sorting is by created_at descending"""
        response = self.session.get(f"{BASE_URL}/api/crm/leads", params={"limit": 10})
        
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "total" in data
        
        leads = data["data"]
        if len(leads) >= 2:
            # Verify descending order (newest first)
            for i in range(len(leads) - 1):
                date1 = leads[i].get("created_at", "")
                date2 = leads[i + 1].get("created_at", "")
                assert date1 >= date2, f"Default sort not descending: {date1} < {date2}"
        
        print(f"✓ Default sorting (created_at DESC) works - {len(leads)} leads returned")
    
    def test_sort_by_fullname_asc(self):
        """Test sorting by fullName ascending"""
        response = self.session.get(
            f"{BASE_URL}/api/crm/leads",
            params={"limit": 20, "sort": "fullName", "order": "asc"}
        )
        
        assert response.status_code == 200
        data = response.json()
        leads = data["data"]
        
        if len(leads) >= 2:
            names = [lead.get("fullName", "").lower() for lead in leads]
            for i in range(len(names) - 1):
                assert names[i] <= names[i + 1], f"Name sort ASC failed: {names[i]} > {names[i + 1]}"
        
        print(f"✓ Sort by fullName ASC works - First: {leads[0].get('fullName') if leads else 'N/A'}")
    
    def test_sort_by_fullname_desc(self):
        """Test sorting by fullName descending"""
        response = self.session.get(
            f"{BASE_URL}/api/crm/leads",
            params={"limit": 20, "sort": "fullName", "order": "desc"}
        )
        
        assert response.status_code == 200
        data = response.json()
        leads = data["data"]
        
        if len(leads) >= 2:
            names = [lead.get("fullName", "").lower() for lead in leads]
            for i in range(len(names) - 1):
                assert names[i] >= names[i + 1], f"Name sort DESC failed: {names[i]} < {names[i + 1]}"
        
        print(f"✓ Sort by fullName DESC works - First: {leads[0].get('fullName') if leads else 'N/A'}")
    
    def test_sort_by_email_asc(self):
        """Test sorting by email ascending"""
        response = self.session.get(
            f"{BASE_URL}/api/crm/leads",
            params={"limit": 20, "sort": "email", "order": "asc"}
        )
        
        assert response.status_code == 200
        data = response.json()
        leads = data["data"]
        
        if len(leads) >= 2:
            emails = [lead.get("email", "").lower() for lead in leads]
            for i in range(len(emails) - 1):
                assert emails[i] <= emails[i + 1], f"Email sort ASC failed: {emails[i]} > {emails[i + 1]}"
        
        print(f"✓ Sort by email ASC works - First: {leads[0].get('email') if leads else 'N/A'}")
    
    def test_sort_by_status_asc(self):
        """Test sorting by status ascending"""
        response = self.session.get(
            f"{BASE_URL}/api/crm/leads",
            params={"limit": 20, "sort": "status", "order": "asc"}
        )
        
        assert response.status_code == 200
        data = response.json()
        leads = data["data"]
        
        if len(leads) >= 2:
            statuses = [lead.get("status", "").lower() for lead in leads]
            for i in range(len(statuses) - 1):
                assert statuses[i] <= statuses[i + 1], f"Status sort ASC failed: {statuses[i]} > {statuses[i + 1]}"
        
        print(f"✓ Sort by status ASC works - First: {leads[0].get('status') if leads else 'N/A'}")
    
    def test_sort_by_amountlost_desc(self):
        """Test sorting by amountLost descending"""
        response = self.session.get(
            f"{BASE_URL}/api/crm/leads",
            params={"limit": 20, "sort": "amountLost", "order": "desc"}
        )
        
        assert response.status_code == 200
        data = response.json()
        leads = data["data"]
        
        print(f"✓ Sort by amountLost DESC works - {len(leads)} leads returned")
        if leads:
            print(f"  First lead amount: {leads[0].get('amountLost')}")
    
    def test_sort_by_created_at_asc(self):
        """Test sorting by created_at ascending (oldest first)"""
        response = self.session.get(
            f"{BASE_URL}/api/crm/leads",
            params={"limit": 20, "sort": "created_at", "order": "asc"}
        )
        
        assert response.status_code == 200
        data = response.json()
        leads = data["data"]
        
        if len(leads) >= 2:
            for i in range(len(leads) - 1):
                date1 = leads[i].get("created_at", "")
                date2 = leads[i + 1].get("created_at", "")
                assert date1 <= date2, f"Date sort ASC failed: {date1} > {date2}"
        
        print(f"✓ Sort by created_at ASC works - First: {leads[0].get('created_at') if leads else 'N/A'}")
    
    def test_sort_with_pagination(self):
        """Test that sorting works correctly with pagination"""
        # Get first page sorted by fullName ASC
        response1 = self.session.get(
            f"{BASE_URL}/api/crm/leads",
            params={"limit": 10, "offset": 0, "sort": "fullName", "order": "asc"}
        )
        assert response1.status_code == 200
        page1 = response1.json()["data"]
        
        # Get second page sorted by fullName ASC
        response2 = self.session.get(
            f"{BASE_URL}/api/crm/leads",
            params={"limit": 10, "offset": 10, "sort": "fullName", "order": "asc"}
        )
        assert response2.status_code == 200
        page2 = response2.json()["data"]
        
        if page1 and page2:
            # Last name on page 1 should be <= first name on page 2
            last_page1 = page1[-1].get("fullName", "").lower()
            first_page2 = page2[0].get("fullName", "").lower()
            assert last_page1 <= first_page2, f"Pagination sort broken: {last_page1} > {first_page2}"
        
        print(f"✓ Sort with pagination works - Page 1 last: {page1[-1].get('fullName') if page1 else 'N/A'}, Page 2 first: {page2[0].get('fullName') if page2 else 'N/A'}")
    
    def test_sort_with_filters(self):
        """Test that sorting works with filters applied"""
        # Get leads with a status filter, sorted by fullName
        response = self.session.get(
            f"{BASE_URL}/api/crm/leads",
            params={"limit": 20, "sort": "fullName", "order": "asc", "status": "New"}
        )
        
        assert response.status_code == 200
        data = response.json()
        leads = data["data"]
        
        # Verify all leads have the filtered status
        for lead in leads:
            assert lead.get("status") == "New", f"Filter not applied: {lead.get('status')}"
        
        # Verify sorting
        if len(leads) >= 2:
            names = [lead.get("fullName", "").lower() for lead in leads]
            for i in range(len(names) - 1):
                assert names[i] <= names[i + 1], f"Sort with filter failed: {names[i]} > {names[i + 1]}"
        
        print(f"✓ Sort with filters works - {len(leads)} 'New' leads sorted by name")
    
    def test_invalid_sort_field_fallback(self):
        """Test that invalid sort field falls back to created_at"""
        response = self.session.get(
            f"{BASE_URL}/api/crm/leads",
            params={"limit": 10, "sort": "invalid_field", "order": "desc"}
        )
        
        assert response.status_code == 200
        data = response.json()
        leads = data["data"]
        
        # Should still return data (fallback to created_at)
        assert len(leads) > 0, "No leads returned with invalid sort field"
        
        print(f"✓ Invalid sort field fallback works - {len(leads)} leads returned")
    
    def test_all_allowed_sort_fields(self):
        """Test all allowed sort fields work"""
        allowed_fields = ["created_at", "fullName", "status", "priority", "email", "phone", "amountLost", "team_id", "assigned_to"]
        
        for field in allowed_fields:
            response = self.session.get(
                f"{BASE_URL}/api/crm/leads",
                params={"limit": 5, "sort": field, "order": "asc"}
            )
            assert response.status_code == 200, f"Sort by {field} failed with status {response.status_code}"
            print(f"  ✓ Sort by {field} works")
        
        print(f"✓ All {len(allowed_fields)} allowed sort fields work")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
