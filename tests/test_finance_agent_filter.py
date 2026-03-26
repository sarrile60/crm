"""
Test Finance Admin Overview - Agent Filter Fix
Tests the fix for agent filter on Financial Overview page.
Bug: Was filtering deposits by 'created_by' instead of 'agent_id' field.
Fix: Changed deposit_query to use agent_id for both agent and team filters.
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fervent-mclaren-2.preview.emergentagent.com')

# Test data - Nicolo Zennaro's agent ID
NICOLO_AGENT_ID = "4f3ff1bf-1d64-47a2-b8d3-7dc84b4c80c3"
AGENTE_AGENT_ID = "c8ee081e-639d-45a5-b46a-ce02a0836cd7"
AUDIT_USER_AGENT_ID = "a50ec2f7-a8b0-4fc0-8239-157d7db7b173"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/crm/auth/login",
        json={
            "username": "admin_f87450ce5d66",
            "password": "zTFjPAcs*-(NL-qbj@AP0TcWt*8)nV4f6K(ZcVP_"
        }
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    """Get authorization headers"""
    return {"Authorization": f"Bearer {admin_token}"}


class TestFinanceAgentFilter:
    """Test agent filter on /api/crm/finance/admin/overview endpoint"""
    
    def test_no_filter_returns_all_deposits(self, auth_headers):
        """Test that no filter returns all deposits for the period"""
        # January 2026 has deposits from multiple agents
        response = requests.get(
            f"{BASE_URL}/api/crm/finance/admin/overview?month=1&year=2026",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have deposits from both Nicolo (approved) and Audit User (pending)
        assert data["deposits"]["approved_count"] >= 1, "Should have at least 1 approved deposit"
        assert data["deposits"]["total_approved"] >= 1400, "Should have at least 1400€ approved"
    
    def test_agent_filter_nicolo_zennaro(self, auth_headers):
        """Test filtering by Nicolo Zennaro's agent_id returns only his deposits"""
        response = requests.get(
            f"{BASE_URL}/api/crm/finance/admin/overview?month=1&year=2026&agent_id={NICOLO_AGENT_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Nicolo has 1 approved deposit of 1400€ in January 2026
        assert data["deposits"]["approved_count"] == 1, "Nicolo should have 1 approved deposit"
        assert data["deposits"]["total_approved"] == 1400.0, "Nicolo's approved amount should be 1400€"
        assert data["deposits"]["pending_count"] == 0, "Nicolo should have 0 pending deposits"
    
    def test_agent_filter_audit_user(self, auth_headers):
        """Test filtering by Audit Test User's agent_id returns only their deposits"""
        response = requests.get(
            f"{BASE_URL}/api/crm/finance/admin/overview?month=1&year=2026&agent_id={AUDIT_USER_AGENT_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Audit User has 1 pending deposit of 500€ in January 2026
        assert data["deposits"]["approved_count"] == 0, "Audit User should have 0 approved deposits"
        assert data["deposits"]["pending_count"] == 1, "Audit User should have 1 pending deposit"
        assert data["deposits"]["total_pending"] == 500.0, "Audit User's pending amount should be 500€"
    
    def test_agent_filter_agente_december(self, auth_headers):
        """Test filtering by 'agente' in December 2025"""
        response = requests.get(
            f"{BASE_URL}/api/crm/finance/admin/overview?month=12&year=2025&agent_id={AGENTE_AGENT_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # 'agente' has multiple approved deposits in December 2025
        assert data["deposits"]["approved_count"] >= 4, "Agente should have at least 4 approved deposits"
        assert data["deposits"]["total_approved"] >= 56300, "Agente's approved amount should be at least 56300€"
    
    def test_agent_filter_nonexistent_agent(self, auth_headers):
        """Test filtering by non-existent agent returns empty results"""
        response = requests.get(
            f"{BASE_URL}/api/crm/finance/admin/overview?month=1&year=2026&agent_id=nonexistent-agent-id",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should return 0 deposits
        assert data["deposits"]["approved_count"] == 0
        assert data["deposits"]["pending_count"] == 0
        assert data["deposits"]["total_approved"] == 0


class TestFinanceDateFilters:
    """Test date range filters on /api/crm/finance/admin/overview endpoint"""
    
    def test_date_range_filter(self, auth_headers):
        """Test date_from and date_to filters"""
        response = requests.get(
            f"{BASE_URL}/api/crm/finance/admin/overview?date_from=2026-01-12T00:00:00&date_to=2026-01-12T23:59:59",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have deposits from January 12, 2026
        assert data["deposits"]["approved_count"] >= 1
    
    def test_date_range_with_agent_filter(self, auth_headers):
        """Test date range combined with agent filter"""
        response = requests.get(
            f"{BASE_URL}/api/crm/finance/admin/overview?date_from=2026-01-12T00:00:00&date_to=2026-01-12T23:59:59&agent_id={NICOLO_AGENT_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Nicolo's deposit was on January 12, 2026
        assert data["deposits"]["approved_count"] == 1
        assert data["deposits"]["total_approved"] == 1400.0
    
    def test_month_year_filter(self, auth_headers):
        """Test month/year filter"""
        response = requests.get(
            f"{BASE_URL}/api/crm/finance/admin/overview?month=12&year=2025",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # December 2025 has multiple deposits
        assert data["deposits"]["approved_count"] >= 5
        assert data["deposits"]["total_approved"] >= 58800


class TestFinanceCommissionCalculations:
    """Test commission calculations with agent filter"""
    
    def test_commission_calculation_with_agent_filter(self, auth_headers):
        """Test that commission calculations are correct when filtering by agent"""
        response = requests.get(
            f"{BASE_URL}/api/crm/finance/admin/overview?month=1&year=2026&agent_id={NICOLO_AGENT_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "deposits" in data
        assert "commissions" in data
        assert "profit_loss" in data
        
        # Revenue should match approved deposits
        assert data["profit_loss"]["total_revenue"] == data["deposits"]["total_approved"]


class TestFinanceResponseStructure:
    """Test response structure of finance admin overview"""
    
    def test_response_structure(self, auth_headers):
        """Test that response has all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/crm/finance/admin/overview?month=1&year=2026",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required top-level fields
        assert "period" in data
        assert "deposits" in data
        assert "staff" in data
        assert "salaries" in data
        assert "commissions" in data
        assert "expenses" in data
        assert "profit_loss" in data
        
        # Check deposits structure
        assert "total_approved" in data["deposits"]
        assert "total_pending" in data["deposits"]
        assert "total_rejected" in data["deposits"]
        assert "approved_count" in data["deposits"]
        assert "pending_count" in data["deposits"]
        assert "rejected_count" in data["deposits"]
        
        # Check profit_loss structure
        assert "total_revenue" in data["profit_loss"]
        assert "total_costs" in data["profit_loss"]
        assert "net_profit" in data["profit_loss"]
        assert "profit_margin" in data["profit_loss"]


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
