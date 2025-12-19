# 🛡️ EMERGENT-SPECIFIC PRODUCTION HARDENING PLAN
## 1 LAW SOLICITORS CRM - Emergent Platform

---

## 🎯 PLATFORM UNDERSTANDING

### Emergent's Managed Infrastructure:
- **Process Management:** Supervisor handles backend/frontend/MongoDB
- **Routing:** Internal NGINX proxy routes traffic
- **Ports:** Backend (8001), Frontend (3000), MongoDB (27017)
- **Networking:** All services on internal container network
- **Environment:** Variables injected via .env files

### Your Control:
- Application code security
- .env file management
- Backend logic (server.py)
- Frontend build process
- MongoDB authentication setup
- API security middleware

---

## 🔐 CRITICAL VULNERABILITIES (Emergent Context)

### 1. MongoDB Authentication (CRITICAL)
**Current State:**
- MongoDB running with `--bind_ip_all` (line 29 in supervisor config)
- No authentication enabled
- Accessible from anywhere in container network

**Fix Available:**
- Enable MongoDB authentication
- Update connection strings in backend/.env
- No system-level changes needed

### 2. Source Code Exposure (CRITICAL)
**Current State:**
- All .py files are served by React dev server's public folder fallback
- .env files may be accessible via direct URL paths
- Backend code visible at certain paths

**Fix Available:**
- Update backend routing to block sensitive files
- Add middleware to reject requests to .py/.env files
- Configure frontend to not serve backend files

### 3. Hardcoded Credentials (CRITICAL)
**Current State:**
- Admin credentials in server.py: `ADMIN_USERNAME = 'admin'`, `ADMIN_PASSWORD = 'Satoshi@10benz'`
- JWT secret: `'your-secret-key-change-in-production'`
- Publicly visible in code

**Fix Available:**
- Move to backend/.env and frontend/.env
- Generate strong secrets
- Load via os.environ.get()

### 4. Development Mode (HIGH)
**Current State:**
- Backend: `--reload` flag enabled
- Frontend: `yarn start` (dev server)
- No production optimizations

**Fix Available:**
- Backend: Remove --reload, add production settings
- Frontend: Use `yarn build` + serve static
- Keep supervisor managing processes

---

## ✅ EMERGENT-COMPATIBLE HARDENING STEPS

### STEP 1: Secure Environment Variables

**File: `/app/backend/.env`**
```env
# MongoDB Configuration
MONGO_URL=mongodb://crm_user:STRONG_PASSWORD_HERE@localhost:27017/legal_crm_production?authSource=admin
DB_NAME=legal_crm_production

# Admin Credentials
ADMIN_USERNAME=admin_RANDOM_STRING
ADMIN_PASSWORD=STRONG_GENERATED_PASSWORD_40_CHARS

# JWT Configuration
JWT_SECRET=CRYPTO_STRONG_SECRET_86_CHARS
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24

# Application Settings
DEBUG=false
ENVIRONMENT=production
LOG_LEVEL=WARNING

# Security Settings
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=30
RATE_LIMIT_ENABLED=true
```

**File: `/app/frontend/.env`**
```env
REACT_APP_BACKEND_URL=https://i18n-dashboard-6.preview.emergentagent.com
REACT_APP_ENV=production
GENERATE_SOURCEMAP=false
```

**Action:**
1. Generate strong secrets using Python
2. Update both .env files
3. Modify code to load from environment
4. Restart services via supervisor

---

### STEP 2: Backend Security Hardening

**File: `/app/backend/server.py` - Remove Hardcoded Credentials**

**Current (INSECURE):**
```python
ADMIN_USERNAME = 'admin'
ADMIN_PASSWORD = 'Satoshi@10benz'
```

**Change To (SECURE):**
```python
ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD')
```

**Add Security Middleware:**
```python
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Request, HTTPException
import time

# Rate limiting storage
rate_limit_storage = {}

@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # Block access to sensitive files
    path = request.url.path
    
    if any(path.endswith(ext) for ext in ['.env', '.py', '.pyc', '.pyo']):
        raise HTTPException(status_code=404, detail="Not found")
    
    if '/backend/' in path or '/internal/' in path:
        raise HTTPException(status_code=404, detail="Not found")
    
    # Rate limiting
    client_ip = request.client.host
    current_time = time.time()
    
    if client_ip not in rate_limit_storage:
        rate_limit_storage[client_ip] = []
    
    # Clean old requests
    rate_limit_storage[client_ip] = [
        t for t in rate_limit_storage[client_ip] 
        if current_time - t < 60
    ]
    
    # Check limit (100 requests per minute)
    if len(rate_limit_storage[client_ip]) >= 100:
        raise HTTPException(status_code=429, detail="Too many requests")
    
    rate_limit_storage[client_ip].append(current_time)
    
    # Add security headers
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "no-referrer"
    
    return response

# Restrict CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://i18n-dashboard-6.preview.emergentagent.com",
        "http://localhost:3000"  # For development only
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)
```

---

### STEP 3: JWT Security

**File: `/app/backend/auth_utils.py`**

**Current (INSECURE):**
```python
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
```

**Change To (SECURE):**
```python
JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET or JWT_SECRET == 'your-secret-key-change-in-production':
    raise ValueError("JWT_SECRET must be set to a strong value")

JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
```

**Add Token Validation:**
```python
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=24)
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": secrets.token_hex(16)  # Unique token ID
    })
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        # Validate required fields
        if not all(k in payload for k in ['id', 'email', 'role']):
            raise HTTPException(status_code=401, detail="Invalid token")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
```

---

### STEP 4: MongoDB Authentication (Emergent-Safe)

**Enable MongoDB Auth (Without System Commands):**

Since MongoDB is managed by supervisor, we can enable authentication by:

1. **Connect to MongoDB shell:**
```bash
mongosh
```

2. **Create admin user:**
```javascript
use admin
db.createUser({
  user: "admin",
  pwd: "STRONG_ADMIN_PASSWORD",
  roles: [ { role: "root", db: "admin" } ]
})
```

3. **Create application user:**
```javascript
use admin
db.createUser({
  user: "crm_user",
  pwd: "STRONG_APP_PASSWORD",
  roles: [
    { role: "readWrite", db: "legal_crm_production" }
  ]
})
```

4. **Update backend/.env:**
```env
MONGO_URL=mongodb://crm_user:STRONG_APP_PASSWORD@localhost:27017/legal_crm_production?authSource=admin
```

5. **Restart backend** (MongoDB auth is now active)

**Note:** The supervisor config shows `--bind_ip_all` which is OK since we're in a container. The authentication layer is what protects access.

---

### STEP 5: Production Frontend Build

**Instead of dev server, serve production build:**

**File: `/app/frontend/package.json` - Add build script:**
```json
{
  "scripts": {
    "start": "react-scripts start",
    "build": "GENERATE_SOURCEMAP=false react-scripts build",
    "serve": "serve -s build -l 3000"
  }
}
```

**Build the frontend:**
```bash
cd /app/frontend
yarn build
```

**Supervisor will serve the build folder** (update command to use `serve` instead of `start`)

**OR** keep `yarn start` but ensure .env has production settings.

---

### STEP 6: Password Hashing Strengthening

**File: `/app/backend/auth_utils.py`**

**Current:**
```python
salt = bcrypt.gensalt()
return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
```

**Improve:**
```python
# Use configurable rounds from environment
BCRYPT_ROUNDS = int(os.environ.get('BCRYPT_ROUNDS', 12))

def hash_password(password: str) -> str:
    """Hash password with bcrypt using configured rounds"""
    if len(password) < 12:
        raise ValueError("Password must be at least 12 characters")
    salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password with timing-attack protection"""
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    except Exception:
        # Timing-attack protection: always take same time
        bcrypt.checkpw(b"dummy", bcrypt.gensalt())
        return False
```

---

### STEP 7: Input Validation

**Add Pydantic validation to all routes:**

**File: `/app/backend/server.py` - Strengthen models:**

```python
from pydantic import BaseModel, EmailStr, Field, validator

class LeadCreate(BaseModel):
    fullName: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone: str = Field(..., regex=r'^\+?[0-9]{10,15}$')
    scammerCompany: str = Field(..., min_length=1, max_length=100)
    amountLost: str = Field(..., min_length=1, max_length=50)
    caseDetails: str = Field(..., min_length=1, max_length=5000)
    
    @validator('phone')
    def validate_phone(cls, v):
        # Remove spaces and validate
        cleaned = v.replace(' ', '').replace('-', '')
        if not cleaned.isdigit():
            raise ValueError('Phone must contain only digits')
        return cleaned
```

---

### STEP 8: Logging Security

**File: `/app/backend/server.py` - Add secure logging:**

```python
import logging

# Configure logging
logging.basicConfig(
    level=logging.WARNING if os.environ.get('ENVIRONMENT') == 'production' else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Log security events
@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    # Don't log sensitive paths
    if any(word in request.url.path for word in ['password', 'secret', 'token']):
        response = await call_next(request)
        return response
    
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    
    logger.info(
        f"{request.method} {request.url.path} "
        f"status={response.status_code} "
        f"time={process_time:.3f}s"
    )
    
    return response
```

---

## 📋 IMPLEMENTATION CHECKLIST (Emergent-Compatible)

### Phase 1: Generate Secrets
```bash
cd /app/backend
python3 << 'EOF'
import secrets
import string

def gen_password(length=40):
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return ''.join(secrets.choice(alphabet) for _ in range(length))

print("# Generated Secrets for .env files")
print(f"ADMIN_USERNAME=admin_{secrets.token_hex(4)}")
print(f"ADMIN_PASSWORD={gen_password()}")
print(f"JWT_SECRET={secrets.token_urlsafe(64)}")
print(f"MONGO_USER=crm_user_{secrets.token_hex(4)}")
print(f"MONGO_PASSWORD={gen_password()}")
EOF
```

### Phase 2: Update .env Files
- [ ] Update `/app/backend/.env` with generated secrets
- [ ] Update `/app/frontend/.env` with production settings
- [ ] Set file permissions: `chmod 600 /app/backend/.env /app/frontend/.env`

### Phase 3: Secure Backend Code
- [ ] Remove hardcoded credentials from server.py
- [ ] Load all secrets from os.environ.get()
- [ ] Add security middleware
- [ ] Update JWT functions
- [ ] Strengthen password hashing
- [ ] Add input validation

### Phase 4: Secure MongoDB
- [ ] Connect to mongosh
- [ ] Create admin user
- [ ] Create app user
- [ ] Update MONGO_URL in backend/.env
- [ ] Test connection

### Phase 5: Test Security
- [ ] Try accessing /.env → should fail
- [ ] Try accessing /backend/server.py → should fail
- [ ] Try old admin password → should fail
- [ ] Try new admin credentials → should work
- [ ] Test rate limiting
- [ ] Check security headers in response

### Phase 6: Restart Services
```bash
# Restart via supervisor
sudo supervisorctl restart backend
sudo supervisorctl restart frontend

# Or restart all
sudo supervisorctl restart all
```

### Phase 7: Verify
- [ ] Backend health check works
- [ ] Frontend loads correctly
- [ ] Login works with new credentials
- [ ] API endpoints protected
- [ ] MongoDB auth working
- [ ] No errors in logs

---

## 🚀 DEPLOYMENT (Emergent Platform)

Since Emergent manages deployment, you just need to:

1. **Commit changes** to your repository
2. **Emergent will automatically rebuild** containers
3. **Environment variables** are managed through Emergent's dashboard
4. **Supervisor will restart** services with new code

**No manual deployment steps needed!**

---

## 🔍 VERIFICATION SCRIPT (Emergent-Safe)

**File: `/app/scripts/verify_emergent_security.py`**
```python
#!/usr/bin/env python3
"""Verify security configuration for Emergent hosting"""
import os
import sys

errors = []
warnings = []

# Check .env files exist
if not os.path.exists('/app/backend/.env'):
    errors.append("backend/.env not found")
if not os.path.exists('/app/frontend/.env'):
    errors.append("frontend/.env not found")

# Check .env permissions
backend_env_perms = oct(os.stat('/app/backend/.env').st_mode)[-3:]
if backend_env_perms != '600':
    warnings.append(f"backend/.env permissions are {backend_env_perms}, should be 600")

# Check for default secrets in code
with open('/app/backend/server.py', 'r') as f:
    server_code = f.read()
    if 'Satoshi@10benz' in server_code:
        errors.append("Hardcoded admin password still in server.py")
    if "ADMIN_PASSWORD = " in server_code and "os.environ" not in server_code:
        errors.append("Admin password not loaded from environment")

with open('/app/backend/auth_utils.py', 'r') as f:
    auth_code = f.read()
    if 'your-secret-key-change-in-production' in auth_code:
        errors.append("Default JWT secret still in auth_utils.py")

# Check environment variables are set
required_vars = ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'JWT_SECRET', 'MONGO_URL']
missing_vars = [var for var in required_vars if not os.environ.get(var)]
if missing_vars:
    errors.append(f"Missing environment variables: {', '.join(missing_vars)}")

# Summary
print("🔒 Emergent Security Verification\n")
if errors:
    print(f"❌ {len(errors)} ERROR(S):")
    for e in errors:
        print(f"   - {e}")
if warnings:
    print(f"\n⚠️  {len(warnings)} WARNING(S):")
    for w in warnings:
        print(f"   - {w}")

if not errors and not warnings:
    print("✅ All security checks passed!")
    sys.exit(0)
elif not errors:
    print("\n⚠️  Warnings found but no critical errors")
    sys.exit(0)
else:
    print("\n❌ Fix errors before deployment!")
    sys.exit(1)
```

Run with:
```bash
python3 /app/scripts/verify_emergent_security.py
```

---

## 🎯 KEY DIFFERENCES FROM EXTERNAL HOSTING

| Aspect | External VPS | Emergent Platform |
|--------|--------------|-------------------|
| **Process Management** | systemd/custom | Supervisor (managed) |
| **Web Server** | Manual NGINX | Internal NGINX (managed) |
| **Port Configuration** | Manual | Automatic (3000, 8001) |
| **MongoDB** | Manual install | Pre-installed |
| **Deployment** | Manual | Automatic on commit |
| **SSL/TLS** | Let's Encrypt | Handled by platform |
| **Secrets** | Manual files | .env files |
| **Restart** | systemctl | supervisorctl |

---

## ✅ FINAL STATUS

**Emergent-Compatible Hardening:**
- ✅ Works within container constraints
- ✅ No system-level commands needed
- ✅ Uses supervisor for process management
- ✅ Respects Emergent's networking model
- ✅ Environment variables via .env files
- ✅ MongoDB authentication (shell commands only)
- ✅ Application-level security hardening

**Ready to implement within Emergent platform!**

