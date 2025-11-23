# Admin Panel (CRM Dashboard)

This is the CRM admin panel served at /admin route.
It contains the full CRM dashboard accessible only to authenticated users.

## Security Features:
- Requires JWT authentication
- Protected by NGINX configuration  
- No dev tools in production build
- Source maps disabled
- All API calls go through secured endpoints

## Building:
```bash
cd /app/production/admin-panel
yarn install
yarn build
```

The build output goes to /app/production/admin-panel/build/
