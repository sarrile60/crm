# Test Results

## Test Credentials
- Admin: admin_f87450ce5d66 / zTFjPAcs*-(NL-qbj@AP0TcWt*8)nV4f6K(ZcVP_
- Supervisor: maurizio1 / 12345
- Agent: agente / 12345

## Current Test: Deposit Management System

### Feature Description
Testing the complete Deposit Management System workflow:
1. Agent sets lead status to "Deposit 1" -> Supervisor receives notification
2. Supervisor creates deposit from notification (IBAN or Crypto)
3. File upload for IBAN deposits (ID front, ID back, proof of residence, selfie)
4. Admin receives notification and approves/rejects deposit

### Backend Endpoints to Test
1. `POST /api/crm/deposits` - Create deposit (supervisor/admin)
2. `GET /api/crm/deposits` - List deposits (role-filtered)
3. `GET /api/crm/deposits/{id}` - Get deposit details
4. `POST /api/crm/deposits/{id}/attachments/{type}` - Upload attachment
5. `GET /api/crm/deposits/{id}/attachments/{type}/download` - Download attachment
6. `PUT /api/crm/deposits/{id}/approve` - Approve deposit (admin)
7. `PUT /api/crm/deposits/{id}/reject` - Reject deposit (admin)
8. `GET /api/crm/supervisor/deposit-notifications` - Get supervisor notifications
9. `PUT /api/crm/supervisor/deposit-notifications/{id}/processed` - Mark notification processed

### Frontend Components to Test
1. DepositsManager.jsx - Create/view deposits for supervisors/agents
2. DepositApprovals.jsx - Admin approval panel
3. CallbackNotifications.jsx - Notification bell with supervisor deposit notifications

### Test Flow
1. Login as agent (agente/12345)
2. Find a lead and change status to "Deposit 1"
3. Login as supervisor (maurizio1/12345)
4. Check notification bell for deposit request
5. Click notification to create deposit
6. Fill deposit form (IBAN or Crypto)
7. Login as admin
8. Check deposit approvals
9. Approve/reject deposit

