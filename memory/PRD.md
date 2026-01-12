# CRM Lead Management System - Product Requirements Document

## Original Problem Statement
A full-fledged CRM (Deposit Management System) for lead management, with features for:
- Lead tracking and management
- Team and user management
- Click-to-call via FreePBX integration
- Multi-language support (EN/IT)
- Role-based access control

## Current State
The application is a production-ready CRM with robust lead management capabilities.

## What's Been Implemented

### Core Features (Completed)
- ✅ Lead CRUD operations with server-side pagination
- ✅ Team and user management
- ✅ Role-based permissions (Admin, Supervisor, Agent)
- ✅ Multi-language support (English/Italian)
- ✅ Click-to-call FreePBX integration
- ✅ Activity logging and audit trails
- ✅ Callback reminders and notifications
- ✅ Import/Export CSV functionality

### Recent Implementations (Jan 10, 2026)
1. **Mass Delete Feature** (P0) ✅
   - Integrated into Mass Update modal as a separate "Delete" tab
   - Two-step confirmation process (warning → confirm)
   - Backend endpoint: POST /api/crm/leads/mass-delete
   - Proper permission checking before deletion

2. **Export All CSV** (P1) ✅
   - Export CSV now fetches ALL leads matching current filters
   - Uses limit=50000 to bypass pagination
   - Properly handles async operation with loading toast

3. **Default Page Size 100** (P1) ✅
   - Changed default from 200 to 100 rows per page
   - Available options: 50, 100, 200, 500 (admin only)

4. **Scalable Select All** (P1) ✅
   - Modal appears when clicking "Select All" checkbox
   - Option 1: Select Current Page (e.g., 100 leads)
   - Option 2: Select All Matching (e.g., all 909 leads matching filters)
   - Uses backend endpoint POST /api/crm/leads/select-all for scalable selection

5. **Bug Fixes** (P0) ✅
   - Fixed Deposits page blank white page (API response format handling)
   - Fixed Leads page double-loading issue (debounce optimization)
   - Fixed multiple components to handle paginated API response format
   - Removed Priority field from all leads views
   - Removed clickable phone numbers (tel: links)

6. **Callback Reminder System Overhaul** (P0) ✅
   - **Queue System**: Multiple callbacks stack properly without glitching
   - **Call Now clears callback**: Pressing "Call Now" removes callback from backend
   - **Trigger on ANY callback_date**: Reminders work regardless of lead status
   - **3rd Postpone**: "Later" replaced with "Remove Callback" (calls backend to clear)
   - **Quick Reminder Button**: Clock icon in list view to set/edit/clear reminders
   - **Reminder Modal**: Set date/time and notes for any lead
   - **Backend endpoint**: POST /api/crm/leads/{lead_id}/clear-callback

7. **Phone Visibility Fix in Callback Popup** (P0) ✅
   - Fixed urgent callback popup to respect phone number visibility rules
   - Agents now see "Hidden" text instead of full phone numbers
   - Admins continue to see full phone numbers (as intended)
   - Fixed both urgent popup and overdue callbacks list
   - File: `/app/frontend/src/components/crm/CallbackNotifications.jsx`

8. **Supervisor Commission Tiers Fix** (P0) ✅
   - Fixed commission tiers not showing for supervisors in Earnings page
   - Updated `get_user_team_ids` to include user's assigned team
   - Added `commission_tiers` to early return response
   - File: `/app/backend/finance_routes.py`

9. **Create Deposit - Phone Visibility & Search** (P0) ✅
   - Fixed phone visibility in Create Deposit client dropdown
   - Supervisors now see masked phone numbers (e.g., `*******7898`)
   - Admins see full phone numbers (as intended)
   - Added searchable combobox for client selection
   - Clients can be searched by name for 1000+ leads
   - File: `/app/frontend/src/components/crm/DepositsManager.jsx`

10. **Supervisor Team Assignment Fix** (P0) ✅
    - Fixed "No Team Assigned" showing for supervisors who are ASSIGNED to a team
    - Updated `/api/chat/teams` to include teams where user is member (not just supervisor)
    - Updated `/api/crm/team-members-status` to include member's assigned team
    - Files: `/app/backend/chat_routes.py`, `/app/backend/crm_routes.py`

### Recent Implementations (Jan 12, 2026)
11. **Sortable Column Headers** (P0) ✅
    - Implemented server-side sorting for the leads table
    - Clickable column headers: Date, Name, Phone, Email, Amount, Status, Team, Assigned To
    - Sort indicators: ArrowUp (ASC), ArrowDown (DESC), ArrowUpDown (not sorted)
    - Toggle behavior: click toggles between ASC and DESC
    - Pagination resets to page 1 on sort change
    - Allowed sort fields: `created_at`, `fullName`, `status`, `priority`, `email`, `phone`, `amountLost`, `team_id`, `assigned_to`
    - Backend: Updated `GET /api/crm/leads` to handle `sort` and `order` query params
    - Frontend: Added sortConfig state, handleSort function, and sortable header UI
    - Files: `/app/backend/crm_routes.py`, `/app/frontend/src/components/crm/LeadsTable.jsx`
    - Tests: 11 backend tests + 8 frontend tests (100% pass rate)

## API Endpoints

### Lead Management
- `GET /api/crm/leads` - Get leads with pagination, filtering, sorting
- `POST /api/crm/leads/create` - Create new lead
- `PUT /api/crm/leads/{lead_id}` - Update lead
- `DELETE /api/crm/leads/{lead_id}` - Delete single lead
- `POST /api/crm/leads/mass-update` - Mass update multiple leads
- `POST /api/crm/leads/mass-delete` - Mass delete multiple leads
- `POST /api/crm/leads/select-all` - Get all lead IDs matching filters

### Authentication
- `POST /api/crm/auth/login` - User login

## Tech Stack
- **Frontend**: React + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Internationalization**: react-i18next

## Key Files
- `/app/frontend/src/components/crm/LeadsTable.jsx` - Main leads table component (~1700 lines)
- `/app/backend/crm_routes.py` - CRM API routes
- `/app/backend/crm_models.py` - Pydantic models

## Test Credentials
- **Admin**: admin_f87450ce5d66 / zTFjPAcs*-(NL-qbj@AP0TcWt*8)nV4f6K(ZcVP_

## Known External Blockers
- **Click-to-Call**: Requires user's FreePBX server configuration (dialplan context)

## Prioritized Backlog

### P2 - Medium Priority
- [ ] Add Italian translations for expense management UI

### P3 - Low Priority
- [ ] Refactor large components (FinancialDashboard.jsx, AnalyticsDashboard.jsx)
- [ ] Break down LeadsTable.jsx into smaller components

## Testing
- Backend: 11/11 tests passing
- Frontend: All UI flows verified
- Test file: `/app/tests/test_crm_mass_actions.py`
