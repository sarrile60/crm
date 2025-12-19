# Live Login Request Notifications - Testing

## Test Credentials
- Admin: admin_f87450ce5d66 / zTFjPAcs*-(NL-qbj@AP0TcWt*8)nV4f6K(ZcVP_
- Agent: agente / 12345

## Features Implemented

### 1. Live Notification Bell for Admins
- Admin receives live notifications when agents/supervisors try to login after work hours
- Bell icon shows red badge with count of pending login requests
- Notifications poll every 10 seconds
- Sound alert and toast notification when new login request arrives

### 2. Notification Modal
- Shows "Login Requests (X)" section for admins
- Displays: User name, role badge, username, reason, request time (with "X min ago")
- Approve and Deny buttons for each request

### 3. Approve/Deny Flow
- Clicking Approve grants 30-minute access
- Clicking Deny removes the request
- Success toast appears after action
- Login requests list updates immediately

## Test Completed
- ✅ Agent blocked when trying to login after work hours
- ✅ Login request appears in admin notification bell
- ✅ Bell shows badge count
- ✅ Admin can see login request details
- ✅ Admin can approve the request
- ✅ Success toast appears
- ✅ Agent can login after approval
- ✅ Session remains valid with approval

## Files Modified
- `/app/frontend/src/components/crm/CallbackNotifications.jsx` - Added login request notifications
- `/app/frontend/src/i18n/locales/*.json` - Added translations for login requests

## Current Session Settings
- Session end: 15:00 (Europe/Rome timezone)  
- We are testing in after-hours mode
