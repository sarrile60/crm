# 🚀 PRODUCTION DEPLOYMENT GUIDE
## 1 LAW SOLICITORS CRM - Secured Production Version

---

## ⚠️ CRITICAL: READ BEFORE DEPLOYING

This system has been fully hardened and restructured for production. **DO NOT** deploy until you have:

1. ✅ Verified all secrets are correctly set
2. ✅ Tested MongoDB authentication
3. ✅ Built frontend production bundles
4. ✅ Reviewed NGINX configuration
5. ✅ Completed the security checklist

---

## 📋 PRE-DEPLOYMENT CHECKLIST

### 1. Environment Variables
```bash
# Verify .env.production exists and has correct permissions
ls -la /app/production/.env.production
# Should show: -rw------- (600)

# Verify all secrets are set
cat /app/production/.env.production | grep -E "USERNAME|PASSWORD|SECRET|URI"
# All values should be long, random strings (NOT defaults)
```

### 2. MongoDB Security
```bash
# Run MongoDB setup script
cd /app/production
sudo bash scripts/setup_mongodb.sh

# Verify MongoDB is bound to localhost only
sudo netstat -tlnp | grep 27017
# Should show: 127.0.0.1:27017 (NOT 0.0.0.0)

# Test authentication works
mongosh "mongodb://crm_db_user_c7786bcf:WIE7TaP#QzUhdhpNJ7@N#CPiS*SFgzQCZ%5gq*xP@127.0.0.1:27017/legal_crm_production?authSource=admin" --eval "db.runCommand({ ping: 1 })"
# Should return: { ok: 1 }
```

### 3. Backend Security
```bash
# Verify no hardcoded credentials in code
grep -r "password.*=.*['\"]" /app/production/backend/
# Should return: NOTHING (or only comments)

# Verify JWT secret is from environment
grep -r "your-secret-key-change" /app/production/backend/
# Should return: NOTHING

# Check file permissions
ls -la /app/production/backend/internal/
# All .py files should be 644 or more restrictive
```

### 4. Frontend Production Builds
```bash
# Build public frontend
cd /app/production/frontend-public
yarn install
yarn build
# Should create: /app/production/frontend-public/build/

# Build admin panel (CRM)
cd /app/production/admin-panel
yarn install
yarn build
# Should create: /app/production/admin-panel/build/

# Verify source maps are NOT generated
find /app/production/*/build -name "*.map"
# Should return: NOTHING
```

### 5. NGINX Configuration
```bash
# Test NGINX configuration
sudo nginx -t -c /app/production/config/nginx-production.conf

# Verify sensitive files are blocked
curl -I https://onelaw-crm.preview.emergentagent.com/backend/.env
# Should return: 404

curl -I https://onelaw-crm.preview.emergentagent.com/backend/main.py
# Should return: 404
```

---

## 🔧 DEPLOYMENT STEPS

### Step 1: Stop Current Services
```bash
sudo supervisorctl stop all
```

### Step 2: Secure MongoDB
```bash
cd /app/production
sudo bash scripts/setup_mongodb.sh
```

### Step 3: Install Backend Dependencies
```bash
cd /app/production/backend
pip install -r requirements.txt
```

### Step 4: Build Frontend Applications
```bash
# Public frontend
cd /app/production/frontend-public
yarn install --production
yarn build

# Admin panel
cd /app/production/admin-panel
yarn install --production
yarn build
```

### Step 5: Configure NGINX
```bash
# Backup current config
sudo cp /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/default.backup

# Install production config
sudo cp /app/production/config/nginx-production.conf /etc/nginx/sites-available/production
sudo ln -sf /etc/nginx/sites-available/production /etc/nginx/sites-enabled/default

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### Step 6: Start Backend with Gunicorn
```bash
# Create log directory
sudo mkdir -p /var/log/gunicorn
sudo chown $USER:$USER /var/log/gunicorn

# Start backend
cd /app/production
bash scripts/start_backend.sh &

# Verify it's running
curl http://127.0.0.1:8001/health
# Should return: {"status":"healthy","environment":"production"}
```

### Step 7: Update Supervisor Configuration (Optional)
```bash
# Create supervisor config for production backend
sudo tee /etc/supervisor/conf.d/production_backend.conf > /dev/null <<EOF
[program:production_backend]
command=/app/production/scripts/start_backend.sh
directory=/app/production/backend
autostart=true
autorestart=true
stderr_logfile=/var/log/production_backend.err.log
stdout_logfile=/var/log/production_backend.out.log
environment=PATH="/root/.venv/bin:/usr/local/bin:/usr/bin:/bin"
user=root
EOF

sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start production_backend
```

---

## 🔍 POST-DEPLOYMENT VERIFICATION

### 1. Backend API Tests
```bash
# Health check
curl https://onelaw-crm.preview.emergentagent.com/health
# Expected: {"status":"healthy"}

# Try to access blocked files (should all be 404)
curl -I https://onelaw-crm.preview.emergentagent.com/backend/.env
curl -I https://onelaw-crm.preview.emergentagent.com/backend/main.py
curl -I https://onelaw-crm.preview.emergentagent.com/.git/config

# Test public lead submission (should work)
curl -X POST https://onelaw-crm.preview.emergentagent.com/api/leads/submit \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Test User",
    "email": "test@example.com",
    "phone": "1234567890",
    "scammerCompany": "Test Co",
    "amountLost": "1000",
    "caseDetails": "Test case"
  }'
# Expected: {"success":true,"message":"..."}

# Test admin login with NEW credentials
curl -X POST https://onelaw-crm.preview.emergentagent.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "crm_admin_1cacbbfa",
    "password": "SZNBgcmU61#rlNgVsFhHCrzb&D6RFhTyJpjUIoCP"
  }'
# Expected: {"token":"...","user":{...}}
```

### 2. Frontend Tests
```bash
# Check public homepage
curl -I https://onelaw-crm.preview.emergentagent.com/
# Expected: 200 OK

# Check admin panel
curl -I https://onelaw-crm.preview.emergentagent.com/admin
# Expected: 200 OK

# Check static assets are cached
curl -I https://onelaw-crm.preview.emergentagent.com/static/js/main.*.js
# Expected: Cache-Control: public, immutable
```

### 3. Security Headers Verification
```bash
curl -I https://onelaw-crm.preview.emergentagent.com/ | grep -E "X-Frame-Options|X-Content-Type|Strict-Transport"

# Expected to see:
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
# Strict-Transport-Security: max-age=31536000
```

### 4. MongoDB Connection Test
```bash
# From backend, test database connection
cd /app/production/backend
python3 << EOF
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

async def test_connection():
    uri = "mongodb://crm_db_user_c7786bcf:WIE7TaP#QzUhdhpNJ7@N#CPiS*SFgzQCZ%5gq*xP@127.0.0.1:27017/legal_crm_production?authSource=admin"
    client = AsyncIOMotorClient(uri)
    try:
        await client.admin.command('ping')
        print("✅ MongoDB connection successful")
    except Exception as e:
        print(f"❌ MongoDB connection failed: {e}")
    finally:
        client.close()

asyncio.run(test_connection())
EOF
```

### 5. Rate Limiting Test
```bash
# Try to hit login endpoint rapidly (should get rate limited)
for i in {1..10}; do
  curl -X POST https://onelaw-crm.preview.emergentagent.com/api/crm/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}' &
done
wait

# Some requests should return: 429 Too Many Requests
```

---

## 🚨 SECURITY VERIFICATION CHECKLIST

Run through this checklist and mark each item:

### Critical Security Checks
- [ ] MongoDB is NOT accessible from internet (port 27017 blocked)
- [ ] MongoDB authentication is ENABLED
- [ ] All .env files return 404 when accessed via browser
- [ ] All .py files return 404 when accessed via browser
- [ ] /backend/* routes return 404
- [ ] JWT secret is NOT the default value
- [ ] Admin password is NOT the default value
- [ ] No hardcoded credentials in source code
- [ ] Security headers are present on all responses
- [ ] CORS is restricted to specific domains (not *)
- [ ] Rate limiting is working on login endpoints
- [ ] Source maps are NOT included in production builds
- [ ] Server version is hidden (no "Server: FastAPI" header)

### Functional Checks
- [ ] Public homepage loads correctly
- [ ] Admin panel loads correctly  
- [ ] Lead submission form works
- [ ] Admin login works with NEW credentials
- [ ] CRM login works for existing users
- [ ] Role-based access control is enforced
- [ ] Phone masking works for non-admin users
- [ ] Notifications system works
- [ ] Lead creation auto-assigns to user

### Performance Checks
- [ ] Static assets are cached (1 year cache headers)
- [ ] HTML is not cached
- [ ] Backend responds in < 200ms for simple queries
- [ ] NGINX is compressing responses (gzip)
- [ ] Database queries use indexes

---

## 📊 MONITORING & MAINTENANCE

### Log Locations
```
Backend Logs:
- /var/log/gunicorn/access.log
- /var/log/gunicorn/error.log
- /var/log/production_backend.out.log

NGINX Logs:
- /var/log/nginx/access.log
- /var/log/nginx/error.log

MongoDB Logs:
- /var/log/mongodb/mongod.log
```

### Monitoring Commands
```bash
# Check backend health
curl http://127.0.0.1:8001/health

# Check NGINX status
sudo systemctl status nginx

# Check backend processes
ps aux | grep gunicorn

# Check MongoDB status
sudo systemctl status mongod

# Monitor real-time logs
tail -f /var/log/gunicorn/error.log
```

### Backup Procedures
```bash
# Backup MongoDB
mongodump --uri="mongodb://crm_db_user_c7786bcf:WIE7TaP#QzUhdhpNJ7@N#CPiS*SFgzQCZ%5gq*xP@127.0.0.1:27017/legal_crm_production?authSource=admin" --out=/backups/mongo-$(date +%Y%m%d)

# Backup environment file
cp /app/production/.env.production /backups/env-$(date +%Y%m%d).backup
chmod 600 /backups/env-$(date +%Y%m%d).backup
```

---

## 🆘 TROUBLESHOOTING

### Issue: Backend won't start
```bash
# Check logs
tail -50 /var/log/gunicorn/error.log

# Common causes:
# 1. MongoDB not running: sudo systemctl start mongod
# 2. Wrong MongoDB credentials: Check .env.production
# 3. Port already in use: lsof -i :8001
```

### Issue: 502 Bad Gateway
```bash
# Check if backend is running
curl http://127.0.0.1:8001/health

# Check NGINX error log
tail -50 /var/log/nginx/error.log

# Restart backend
sudo supervisorctl restart production_backend
```

### Issue: Cannot login
```bash
# Verify credentials in .env.production
cat /app/production/.env.production | grep ADMIN

# Check if MongoDB authentication is working
mongosh "mongodb://crm_db_user_c7786bcf:WIE7TaP#QzUhdhpNJ7@N#CPiS*SFgzQCZ%5gq*xP@127.0.0.1:27017/legal_crm_production?authSource=admin"

# Check backend logs for authentication errors
grep -i "auth\|login" /var/log/gunicorn/error.log | tail -20
```

### Issue: Static files not loading
```bash
# Verify build directories exist
ls -la /app/production/frontend-public/build/
ls -la /app/production/admin-panel/build/

# Check NGINX configuration
sudo nginx -t

# Check NGINX access logs
tail -50 /var/log/nginx/access.log | grep -E ".js|.css"
```

---

## 🔄 ROLLBACK PROCEDURE

If something goes wrong, rollback to previous setup:

```bash
# Stop production backend
sudo supervisorctl stop production_backend

# Restore original NGINX config
sudo cp /etc/nginx/sites-enabled/default.backup /etc/nginx/sites-enabled/default
sudo systemctl reload nginx

# Restart original services
sudo supervisorctl restart backend
sudo supervisorctl restart frontend
sudo supervisorctl restart mongodb

# Check status
sudo supervisorctl status
```

---

## ✅ FINAL DEPLOYMENT CONFIRMATION

Before marking deployment as complete, ensure:

1. [ ] All checklist items above are marked
2. [ ] All tests pass
3. [ ] Security headers are present
4. [ ] MongoDB is secured
5. [ ] Old admin credentials don't work
6. [ ] New admin credentials work
7. [ ] No sensitive files are accessible
8. [ ] Logs show no errors
9. [ ] Application is performant
10. [ ] Backup procedures are in place

---

## 📞 SUPPORT

For issues or questions:
1. Check logs first (locations above)
2. Review troubleshooting section
3. Verify checklist items
4. Check SECURITY_AUDIT_REPORT.md for reference

**Remember: This is a production system handling sensitive customer data. Take security seriously.**
