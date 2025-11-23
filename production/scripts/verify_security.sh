#!/bin/bash
# ============================================
# Production Security Verification Script
# Run this before deploying to production
# ============================================

set -e

echo "🔒 Starting Production Security Verification..."
echo "============================================"
echo ""

ERRORS=0
WARNINGS=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_pass() {
    echo -e "${GREEN}✅ PASS:${NC} $1"
}

check_fail() {
    echo -e "${RED}❌ FAIL:${NC} $1"
    ((ERRORS++))
}

check_warn() {
    echo -e "${YELLOW}⚠️  WARN:${NC} $1"
    ((WARNINGS++))
}

# ============================================
# 1. FILE PERMISSIONS
# ============================================
echo "📁 Checking file permissions..."

if [ -f "/app/production/.env.production" ]; then
    PERMS=$(stat -c "%a" /app/production/.env.production)
    if [ "$PERMS" = "600" ]; then
        check_pass ".env.production has correct permissions (600)"
    else
        check_fail ".env.production has wrong permissions ($PERMS, should be 600)"
    fi
else
    check_fail ".env.production file not found"
fi

if [ -f "/app/production/PRODUCTION_SECRETS.txt" ]; then
    PERMS=$(stat -c "%a" /app/production/PRODUCTION_SECRETS.txt)
    if [ "$PERMS" = "600" ]; then
        check_pass "PRODUCTION_SECRETS.txt has correct permissions (600)"
    else
        check_fail "PRODUCTION_SECRETS.txt has wrong permissions ($PERMS, should be 600)"
    fi
fi

echo ""

# ============================================
# 2. ENVIRONMENT VARIABLES
# ============================================
echo "🔐 Checking environment variables..."

if [ -f "/app/production/.env.production" ]; then
    source /app/production/.env.production
    
    # Check JWT secret is not default
    if [ "$JWT_SECRET" = "your-secret-key-change-in-production" ]; then
        check_fail "JWT_SECRET is still default value"
    elif [ ${#JWT_SECRET} -ge 64 ]; then
        check_pass "JWT_SECRET is strong (${#JWT_SECRET} chars)"
    else
        check_warn "JWT_SECRET is short (${#JWT_SECRET} chars, recommend 64+)"
    fi
    
    # Check admin password is not default
    if [ "$ADMIN_PASSWORD" = "Satoshi@10benz" ]; then
        check_fail "ADMIN_PASSWORD is still default value"
    elif [ ${#ADMIN_PASSWORD} -ge 32 ]; then
        check_pass "ADMIN_PASSWORD is strong (${#ADMIN_PASSWORD} chars)"
    else
        check_warn "ADMIN_PASSWORD is short (${#ADMIN_PASSWORD} chars, recommend 32+)"
    fi
    
    # Check MongoDB password
    if [ ${#MONGO_PASSWORD} -ge 32 ]; then
        check_pass "MONGO_PASSWORD is strong (${#MONGO_PASSWORD} chars)"
    else
        check_warn "MONGO_PASSWORD is short (${#MONGO_PASSWORD} chars, recommend 32+)"
    fi
    
    # Check MongoDB URI contains authentication
    if [[ "$MONGO_URI" == *"@"* ]]; then
        check_pass "MONGO_URI contains authentication"
    else
        check_fail "MONGO_URI does not contain authentication"
    fi
    
    # Check MongoDB is bound to localhost
    if [[ "$MONGO_URI" == *"127.0.0.1"* || "$MONGO_URI" == *"localhost"* ]]; then
        check_pass "MONGO_URI is bound to localhost"
    else
        check_fail "MONGO_URI is not bound to localhost"
    fi
else
    check_fail ".env.production not found"
fi

echo ""

# ============================================
# 3. MONGODB SECURITY
# ============================================
echo "🗄️  Checking MongoDB security..."

# Check if MongoDB is running
if pgrep -x "mongod" > /dev/null; then
    check_pass "MongoDB is running"
    
    # Check if bound to localhost only
    MONGO_BIND=$(sudo netstat -tlnp 2>/dev/null | grep 27017 | awk '{print $4}')
    if [[ "$MONGO_BIND" == "127.0.0.1:27017" ]]; then
        check_pass "MongoDB bound to localhost only"
    elif [[ "$MONGO_BIND" == "0.0.0.0:27017" ]]; then
        check_fail "MongoDB is exposed on 0.0.0.0 (ALL interfaces)"
    else
        check_warn "MongoDB binding unclear: $MONGO_BIND"
    fi
else
    check_warn "MongoDB is not running"
fi

echo ""

# ============================================
# 4. SOURCE CODE PROTECTION
# ============================================
echo "🛡️  Checking source code protection..."

# Check if backend directory is protected by NGINX
if [ -f "/app/production/config/nginx-production.conf" ]; then
    if grep -q "location.*backend.*deny all" /app/production/config/nginx-production.conf; then
        check_pass "NGINX blocks /backend/ access"
    else
        check_fail "NGINX does not block /backend/ access"
    fi
    
    if grep -q "location.*\\.env.*deny all" /app/production/config/nginx-production.conf; then
        check_pass "NGINX blocks .env files"
    else
        check_fail "NGINX does not block .env files"
    fi
    
    if grep -q "location.*\\.py.*deny all" /app/production/config/nginx-production.conf; then
        check_pass "NGINX blocks .py files"
    else
        check_fail "NGINX does not block .py files"
    fi
else
    check_warn "nginx-production.conf not found"
fi

echo ""

# ============================================
# 5. HARDCODED CREDENTIALS CHECK
# ============================================
echo "🔍 Checking for hardcoded credentials..."

HARDCODED=0

# Check for hardcoded passwords in backend
if grep -r "password.*=.*['\"][^'\"]*['\"]" /app/production/backend/*.py 2>/dev/null | grep -v "password_min_length" | grep -v "require_strong_passwords" | grep -q .; then
    check_fail "Found hardcoded passwords in backend code"
    HARDCODED=1
fi

# Check for default JWT secret in code
if grep -r "your-secret-key-change-in-production" /app/production/backend/ 2>/dev/null | grep -q .; then
    check_fail "Found default JWT secret in code"
    HARDCODED=1
fi

# Check for hardcoded admin credentials
if grep -r "Satoshi@10benz\|admin@1lawsolicitors" /app/production/backend/*.py 2>/dev/null | grep -q .; then
    check_fail "Found old admin credentials in code"
    HARDCODED=1
fi

if [ $HARDCODED -eq 0 ]; then
    check_pass "No hardcoded credentials found in backend"
fi

echo ""

# ============================================
# 6. PRODUCTION MODE CHECK
# ============================================
echo "⚙️  Checking production mode..."

if [ -f "/app/production/backend/main.py" ]; then
    if grep -q "debug.*False" /app/production/backend/main.py; then
        check_pass "Debug mode is disabled"
    elif grep -q "debug.*True" /app/production/backend/main.py; then
        check_fail "Debug mode is enabled"
    fi
    
    if grep -q "docs_url.*None" /app/production/backend/main.py; then
        check_pass "API docs are disabled"
    else
        check_warn "API docs might be enabled"
    fi
fi

echo ""

# ============================================
# 7. DEPENDENCIES CHECK
# ============================================
echo "📦 Checking dependencies..."

if [ -f "/app/production/backend/requirements.txt" ]; then
    check_pass "requirements.txt exists"
    
    # Check for production ASGI server
    if grep -q "gunicorn" /app/production/backend/requirements.txt; then
        check_pass "Gunicorn is in requirements.txt"
    else
        check_warn "Gunicorn not found in requirements.txt"
    fi
else
    check_fail "requirements.txt not found"
fi

echo ""

# ============================================
# 8. PRODUCTION BUILDS CHECK
# ============================================
echo "🏗️  Checking production builds..."

if [ -d "/app/production/frontend-public/build" ]; then
    check_pass "Frontend build directory exists"
    
    # Check for source maps (should not exist)
    if find /app/production/frontend-public/build -name "*.map" | grep -q .; then
        check_warn "Source maps found in frontend build"
    else
        check_pass "No source maps in frontend build"
    fi
else
    check_warn "Frontend build not found (run 'yarn build')"
fi

echo ""

# ============================================
# SUMMARY
# ============================================
echo "============================================"
echo "📊 VERIFICATION SUMMARY"
echo "============================================"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL CHECKS PASSED!${NC}"
    echo "Your production environment is secure and ready for deployment."
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  $WARNINGS WARNING(S) FOUND${NC}"
    echo "Review warnings above. System can be deployed but improvements recommended."
    exit 0
else
    echo -e "${RED}❌ $ERRORS ERROR(S) and $WARNINGS WARNING(S) FOUND${NC}"
    echo "FIX ALL ERRORS BEFORE DEPLOYING TO PRODUCTION!"
    exit 1
fi
