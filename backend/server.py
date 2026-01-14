from fastapi import FastAPI, APIRouter, HTTPException, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from typing import Optional
import jwt
from datetime import datetime, timedelta, timezone
from models import Lead, LeadCreate, Analytics, AdminLogin, AdminToken
from crm_routes import crm_router, init_crm_db
from chat_routes import router as chat_router
from admin_routes import admin_router, init_admin_db
from deposit_routes import deposit_router, init_deposit_routes
from analytics_routes import analytics_router, init_analytics_routes
from finance_routes import finance_router, init_finance_routes

ROOT_DIR = Path(__file__).parent
# Use override=False so production environment variables take precedence over .env file
load_dotenv(ROOT_DIR / '.env', override=False)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Initialize databases
init_crm_db(db)
init_admin_db(db)
init_deposit_routes(db)
init_analytics_routes(db)
init_finance_routes(db)

# Initialize audit logging
from audit_utils import init_audit_db
init_audit_db(db)

# Initialize session settings (ensure it's initialized)
from session_settings import init_session_settings_db
init_session_settings_db(db)

# JWT Secret (MUST be set in .env - no default allowed)
JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET or JWT_SECRET == 'your-secret-key-here-change-in-production':
    raise ValueError("JWT_SECRET must be set in .env file with a strong value")
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')

# Admin credentials (loaded from environment)
ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD')
if not ADMIN_USERNAME or not ADMIN_PASSWORD:
    raise ValueError("ADMIN_USERNAME and ADMIN_PASSWORD must be set in .env file")

# Create the main app without a prefix (production settings)
DEBUG_MODE = os.environ.get('DEBUG', 'false').lower() == 'true'
app = FastAPI(
    title="1 LAW SOLICITORS CRM API",
    debug=DEBUG_MODE,
    docs_url=None if not DEBUG_MODE else "/docs",  # Disable docs in production
    redoc_url=None if not DEBUG_MODE else "/redoc",
    openapi_url=None if not DEBUG_MODE else "/openapi.json"
)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================
# SECURITY MIDDLEWARE (EMERGENT-COMPATIBLE)
# ============================================

import time
from fastapi import Request
from collections import defaultdict

# Rate limiting storage (in-memory for Emergent)
rate_limit_storage = defaultdict(lambda: {"requests": [], "login_attempts": 0, "locked_until": 0})

@app.middleware("http")
async def security_middleware(request: Request, call_next):
    """
    Production security middleware - application level
    Blocks sensitive files, adds headers, rate limits
    """
    path = request.url.path
    client_ip = request.client.host
    current_time = time.time()
    
    # 1. BLOCK SENSITIVE FILE ACCESS
    blocked_extensions = ['.env', '.py', '.pyc', '.pyo', '.git', '.log']
    blocked_paths = ['/backend/', '/.git/', '/__pycache__/', '/internal/', '/scripts/']
    
    if any(path.endswith(ext) for ext in blocked_extensions):
        logger.warning(f"Blocked access to sensitive file: {path} from {client_ip}")
        raise HTTPException(status_code=404, detail="Not found")
    
    if any(blocked in path for blocked in blocked_paths):
        logger.warning(f"Blocked access to sensitive path: {path} from {client_ip}")
        raise HTTPException(status_code=404, detail="Not found")
    
    # 2. RATE LIMITING (Application Level)
    if os.environ.get('RATE_LIMIT_ENABLED', 'true').lower() == 'true':
        client_data = rate_limit_storage[client_ip]
        
        # Clean old requests (older than window)
        rate_window = int(os.environ.get('RATE_LIMIT_WINDOW_SECONDS', 60))
        client_data["requests"] = [t for t in client_data["requests"] if current_time - t < rate_window]
        
        # Check if rate limit exceeded
        max_requests = int(os.environ.get('RATE_LIMIT_REQUESTS', 100))
        if len(client_data["requests"]) >= max_requests:
            logger.warning(f"Rate limit exceeded for {client_ip}")
            raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")
        
        # Record this request
        client_data["requests"].append(current_time)
        
        # Login rate limiting DISABLED - causing issues during testing/deployment
        # if '/login' in path:
        #     login_window = int(os.environ.get('LOGIN_RATE_WINDOW_SECONDS', 300))
        #     login_requests = [t for t in client_data["requests"] if current_time - t < login_window and '/login' in path]
        #     
        #     if len(login_requests) > int(os.environ.get('LOGIN_RATE_LIMIT', 5)):
        #         logger.warning(f"Login rate limit exceeded for {client_ip}")
        #         raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")
    
    # 3. PROCESS REQUEST
    response = await call_next(request)
    
    # 4. ADD SECURITY HEADERS
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    
    # Content Security Policy
    csp = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "font-src 'self'; "
        "connect-src 'self'; "
        "frame-ancestors 'none'"
    )
    response.headers["Content-Security-Policy"] = csp
    
    # Remove server identification
    if "server" in response.headers:
        del response.headers["server"]
    if "x-powered-by" in response.headers:
        del response.headers["x-powered-by"]
    
    return response

@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    """Log requests (excluding sensitive paths)"""
    path = request.url.path
    
    # Don't log sensitive paths
    if any(word in path.lower() for word in ['password', 'secret', 'token', 'credential']):
        return await call_next(request)
    
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    
    logger.info(
        f"{request.method} {path} - "
        f"Status: {response.status_code} - "
        f"Time: {process_time:.3f}s - "
        f"IP: {request.client.host}"
    )
    
    return response

# ============================================
# HELPER FUNCTIONS
# ============================================

# Helper function to create JWT token (secured)
def create_access_token(data: dict):
    """Create JWT token with expiration and security claims"""
    to_encode = data.copy()
    expiration_hours = int(os.environ.get('JWT_EXPIRATION_HOURS', 24))
    expire = datetime.now(timezone.utc) + timedelta(hours=expiration_hours)
    
    # Add security claims
    import secrets
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": secrets.token_hex(16)  # Unique token ID
    })
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

# Helper function to verify JWT token
def verify_token(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization header")
    
    try:
        token = authorization.replace('Bearer ', '')
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Initialize analytics if not exists
async def init_analytics():
    existing = await db.analytics.find_one({})
    if not existing:
        analytics = Analytics()
        await db.analytics.insert_one(analytics.dict())
        logger.info("Analytics collection initialized")


# ============================================
# PUBLIC ENDPOINTS (No Auth Required)
# ============================================

@api_router.get("/system/language")
async def get_system_language():
    """Get system-wide language setting (public endpoint for frontend)"""
    settings = await db.system_settings.find_one({"type": "language_config"}, {"_id": 0})
    
    if not settings:
        return {"language": "it"}  # Default to Italian
    
    return {"language": settings.get("language", "it")}


# Lead submission endpoint
@api_router.post("/leads/submit")
async def submit_lead(lead_data: LeadCreate):
    try:
        # Check for duplicate registration - by email OR phone
        existing_lead = await db.leads.find_one({
            "$or": [
                {"email": lead_data.email},
                {"phone": lead_data.phone}
            ]
        })
        
        if existing_lead:
            # Lead already exists - return error
            logger.warning(f"Duplicate registration attempt: {lead_data.email}")
            raise HTTPException(
                status_code=409, 
                detail="Hai già inviato una richiesta. Il nostro team legale ti contatterà presto."
            )
        
        lead = Lead(**lead_data.dict())
        lead_dict = lead.dict()
        
        # Ensure created_at field exists for CRM compatibility
        lead_dict["created_at"] = lead_dict.get("createdAt", datetime.now(timezone.utc))
        
        await db.leads.insert_one(lead_dict)
        
        # Update analytics - increment total leads
        await db.analytics.update_one(
            {},
            {"$inc": {"totalLeads": 1}},
            upsert=True
        )
        
        logger.info(f"New lead submitted: {lead.fullName}")
        return {"success": True, "message": "Lead submitted successfully"}
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error submitting lead: {str(e)}")
        raise HTTPException(status_code=500, detail="Error submitting lead")

# Analytics endpoints
@api_router.post("/analytics/pageview")
async def track_pageview():
    try:
        await db.analytics.update_one(
            {},
            {"$inc": {"pageViews": 1}, "$set": {"lastUpdated": datetime.utcnow()}},
            upsert=True
        )
        return {"success": True}
    except Exception as e:
        logger.error(f"Error tracking pageview: {str(e)}")
        return {"success": False}

@api_router.post("/analytics/form-start")
async def track_form_start():
    try:
        await db.analytics.update_one(
            {},
            {"$inc": {"formStarts": 1}, "$set": {"lastUpdated": datetime.utcnow()}},
            upsert=True
        )
        return {"success": True}
    except Exception as e:
        logger.error(f"Error tracking form start: {str(e)}")
        return {"success": False}

@api_router.post("/analytics/cta-click")
async def track_cta_click(data: dict):
    try:
        location = data.get('location', 'unknown')
        await db.analytics.update_one(
            {},
            {
                "$inc": {
                    "ctaClicks": 1,
                    f"ctaClicksByLocation.{location}": 1
                },
                "$set": {"lastUpdated": datetime.utcnow()}
            },
            upsert=True
        )
        return {"success": True}
    except Exception as e:
        logger.error(f"Error tracking CTA click: {str(e)}")
        return {"success": False}

# Admin authentication endpoint
@api_router.post("/admin/login", response_model=AdminToken)
async def admin_login(credentials: AdminLogin):
    if credentials.username == ADMIN_USERNAME and credentials.password == ADMIN_PASSWORD:
        token = create_access_token({"username": credentials.username, "role": "admin"})
        return AdminToken(token=token, success=True)
    else:
        raise HTTPException(status_code=401, detail="Invalid credentials")

# Admin analytics endpoint
@api_router.get("/admin/analytics")
async def get_admin_analytics(authorization: Optional[str] = Header(None)):
    verify_token(authorization)
    
    try:
        analytics = await db.analytics.find_one({})
        if not analytics:
            return {
                "pageViews": 0,
                "formStarts": 0,
                "totalLeads": 0,
                "ctaClicks": 0,
                "ctaClicksByLocation": {}
            }
        
        return {
            "pageViews": analytics.get('pageViews', 0),
            "formStarts": analytics.get('formStarts', 0),
            "totalLeads": analytics.get('totalLeads', 0),
            "ctaClicks": analytics.get('ctaClicks', 0),
            "ctaClicksByLocation": analytics.get('ctaClicksByLocation', {})
        }
    except Exception as e:
        logger.error(f"Error fetching analytics: {str(e)}")
        raise HTTPException(status_code=500, detail="Error fetching analytics")

# Admin leads endpoint
@api_router.get("/admin/leads")
async def get_admin_leads(authorization: Optional[str] = Header(None)):
    verify_token(authorization)
    
    try:
        leads = await db.leads.find().sort('createdAt', -1).to_list(1000)
        return leads
    except Exception as e:
        logger.error(f"Error fetching leads: {str(e)}")
        raise HTTPException(status_code=500, detail="Error fetching leads")

# Health check
@api_router.get("/")
async def root():
    return {"message": "1 LAW SOLICITORS API - Running", "status": "healthy", "version": "2026-01-12-fix-entities"}

# Initialize admin endpoint (for fresh deployments)
@api_router.get("/init-admin")
async def init_admin():
    """Create default admin user if none exists - call this once after fresh deployment"""
    from auth_utils import hash_password
    import uuid
    
    try:
        # Check if admin already exists
        existing_admin = await db.crm_users.find_one({"username": "admin"})
        if existing_admin:
            # Update the password
            await db.crm_users.update_one(
                {"username": "admin"},
                {"$set": {"password": hash_password("1Law@Solicitors2026!"), "is_active": True, "role": "admin"}}
            )
            return {"status": "updated", "message": "Admin password updated. Username: admin"}
        else:
            # Create new admin
            default_admin = {
                "id": str(uuid.uuid4()),
                "username": "admin",
                "password": hash_password("1Law@Solicitors2026!"),
                "full_name": "Administrator",
                "role": "admin",
                "is_active": True,
                "team_id": None
            }
            await db.crm_users.insert_one(default_admin)
            return {"status": "created", "message": "Admin user created. Username: admin"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Force create admin endpoint
@api_router.get("/setup-admin-now")
async def setup_admin_now():
    """Force create or update admin user"""
    from auth_utils import hash_password
    import uuid
    
    try:
        # Delete existing admin if any
        await db.crm_users.delete_many({"username": "admin"})
        
        # Create fresh admin with simple password
        default_admin = {
            "id": str(uuid.uuid4()),
            "username": "admin",
            "password": hash_password("Admin2026"),
            "full_name": "Administrator",
            "role": "admin",
            "is_active": True,
            "team_id": None
        }
        await db.crm_users.insert_one(default_admin)
        return {"status": "success", "message": "Admin created! Username: admin, Password: Admin2026"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Seed database with initial data (roles, entities, permissions)
@api_router.get("/seed-database")
async def seed_database():
    """Seed the database with default roles, entities, and permissions for fresh deployments"""
    import uuid
    from datetime import datetime, timezone
    
    results = {"roles": [], "entities": [], "permissions": []}
    
    try:
        # ============ SEED ROLES ============
        default_roles = [
            {"id": str(uuid.uuid4()), "name": "Admin", "description": "Full system access", "is_system": True, "created_at": datetime.now(timezone.utc)},
            {"id": str(uuid.uuid4()), "name": "Supervisor", "description": "Team management and oversight", "is_system": True, "created_at": datetime.now(timezone.utc)},
            {"id": str(uuid.uuid4()), "name": "Agent", "description": "Lead management and client interactions", "is_system": True, "created_at": datetime.now(timezone.utc)}
        ]
        
        for role in default_roles:
            existing = await db.roles.find_one({"name": role["name"]})
            if not existing:
                await db.roles.insert_one(role)
                results["roles"].append(f"Created: {role['name']}")
            else:
                results["roles"].append(f"Exists: {role['name']}")
        
        # ============ SEED ENTITIES ============
        # NOTE: Admin API uses 'entity_configs' collection with 'entity_name' field
        default_entities = [
            {"id": str(uuid.uuid4()), "entity_name": "leads", "display_name": "Leads", "icon": "users", "order": 1, "enabled": True, "created_at": datetime.now(timezone.utc)},
            {"id": str(uuid.uuid4()), "entity_name": "deposits", "display_name": "Deposits", "icon": "dollar-sign", "order": 2, "enabled": True, "created_at": datetime.now(timezone.utc)},
            {"id": str(uuid.uuid4()), "entity_name": "teams", "display_name": "Teams", "icon": "users", "order": 3, "enabled": True, "created_at": datetime.now(timezone.utc)},
            {"id": str(uuid.uuid4()), "entity_name": "reports", "display_name": "Reports", "icon": "bar-chart", "order": 4, "enabled": True, "created_at": datetime.now(timezone.utc)},
            {"id": str(uuid.uuid4()), "entity_name": "settings", "display_name": "Settings", "icon": "settings", "order": 5, "enabled": True, "created_at": datetime.now(timezone.utc)}
        ]
        
        for entity in default_entities:
            existing = await db.entity_configs.find_one({"entity_name": entity["entity_name"]})
            if not existing:
                await db.entity_configs.insert_one(entity)
                results["entities"].append(f"Created: {entity['entity_name']}")
            else:
                results["entities"].append(f"Exists: {entity['entity_name']}")
        
        # ============ SEED PERMISSIONS ============
        # Get role IDs
        admin_role = await db.roles.find_one({"name": "Admin"})
        supervisor_role = await db.roles.find_one({"name": "Supervisor"})
        agent_role = await db.roles.find_one({"name": "Agent"})
        
        if admin_role and supervisor_role and agent_role:
            # Get entity IDs from entity_configs collection
            entities = await db.entity_configs.find({}).to_list(100)
            entity_map = {e["entity_name"]: e["id"] for e in entities}
            
            # Admin gets ALL access to everything
            for ent_name, entity_id in entity_map.items():
                for action in ["read", "create", "edit", "delete"]:
                    perm = {
                        "id": str(uuid.uuid4()),
                        "role_id": admin_role["id"],
                        "entity": ent_name,
                        "action": action,
                        "scope": "all" if action in ["read", "edit", "delete"] else "yes",
                        "created_at": datetime.now(timezone.utc)
                    }
                    existing = await db.permissions.find_one({
                        "role_id": admin_role["id"],
                        "entity": ent_name,
                        "action": action
                    })
                    if not existing:
                        await db.permissions.insert_one(perm)
            results["permissions"].append("Admin: Full access to all entities")
            
            # Supervisor gets TEAM access to leads/deposits, view for reports
            supervisor_perms = [
                ("leads", ["read", "create", "edit"], "team"),
                ("deposits", ["read", "create", "edit"], "team"),
                ("teams", ["read"], "team"),
                ("reports", ["read"], "team")
            ]
            for ent_name, actions, scope in supervisor_perms:
                if ent_name in entity_map:
                    for action in actions:
                        perm = {
                            "id": str(uuid.uuid4()),
                            "role_id": supervisor_role["id"],
                            "entity": ent_name,
                            "action": action,
                            "scope": scope if action in ["read", "edit", "delete"] else "yes",
                            "created_at": datetime.now(timezone.utc)
                        }
                        existing = await db.permissions.find_one({
                            "role_id": supervisor_role["id"],
                            "entity": ent_name,
                            "action": action
                        })
                        if not existing:
                            await db.permissions.insert_one(perm)
            results["permissions"].append("Supervisor: Team access to leads/deposits")
            
            # Agent gets OWN access to leads/deposits
            agent_perms = [
                ("leads", ["read", "create", "edit"], "own"),
                ("deposits", ["read", "create"], "own")
            ]
            for ent_name, actions, scope in agent_perms:
                if ent_name in entity_map:
                    for action in actions:
                        perm = {
                            "id": str(uuid.uuid4()),
                            "role_id": agent_role["id"],
                            "entity": ent_name,
                            "action": action,
                            "scope": scope if action in ["read", "edit", "delete"] else "yes",
                            "created_at": datetime.now(timezone.utc)
                        }
                        existing = await db.permissions.find_one({
                            "role_id": agent_role["id"],
                            "entity": ent_name,
                            "action": action
                        })
                        if not existing:
                            await db.permissions.insert_one(perm)
            results["permissions"].append("Agent: Own access to leads/deposits")
        
        return {"status": "success", "results": results}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Migration endpoint to fix permissions data
@api_router.get("/migrate-permissions")
async def migrate_permissions():
    """Migrate permissions from entity_name to entity field"""
    try:
        # Find all permissions with entity_name but no entity
        perms_to_migrate = await db.permissions.find({
            'entity_name': {'$exists': True},
            'entity': {'$exists': False}
        }).to_list(1000)
        
        migrated_count = 0
        for perm in perms_to_migrate:
            await db.permissions.update_one(
                {'_id': perm['_id']},
                {
                    '$set': {'entity': perm['entity_name']},
                    '$unset': {'entity_name': '', 'entity_id': ''}
                }
            )
            migrated_count += 1
        
        return {"status": "success", "migrated": migrated_count}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Include the routers in the main app
app.include_router(api_router)
app.include_router(crm_router)
app.include_router(admin_router)
app.include_router(chat_router)
app.include_router(deposit_router, prefix="/api/crm")
app.include_router(analytics_router, prefix="/api/crm")
app.include_router(finance_router, prefix="/api/crm")

# CORS Configuration (Restricted for Production)
# Hardcode production domains to ensure they work regardless of .env
production_origins = [
    'https://1law-solicitors.com',
    'https://www.1law-solicitors.com', 
    'https://lawfirm-ops.emergent.host',
    'https://dialerfix-crm.emergent.host',
    'https://dialerfix-crm.preview.emergentagent.com',
    'http://localhost:3000',
    'http://localhost:8001'
]
# Also allow any origins from env var (use * to allow all origins if needed)
env_origins = os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',')
all_origins = list(set(production_origins + [o.strip() for o in env_origins if o.strip()]))

# If CORS_ALLOW_ALL is set to true, allow all origins
allow_all_cors = os.environ.get('CORS_ALLOW_ALL', 'false').lower() == 'true'

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"] if allow_all_cors else all_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    max_age=3600
)

@app.on_event("startup")
async def startup_event():
    await init_analytics()
    
    # Auto-create default admin if no users exist (for fresh deployments)
    try:
        from auth_utils import hash_password
        import uuid
        
        user_count = await db.crm_users.count_documents({})
        if user_count == 0:
            logger.info("No users found - creating default admin user...")
            default_admin = {
                "id": str(uuid.uuid4()),
                "username": "admin",
                "password": hash_password("1Law@Solicitors2026!"),
                "full_name": "Administrator",
                "role": "admin",
                "is_active": True,
                "team_id": None
            }
            await db.crm_users.insert_one(default_admin)
            logger.info("Default admin user created successfully")
    except Exception as e:
        logger.error(f"Error creating default admin: {e}")
    
    logger.info("Application started successfully")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    logger.info("Database connection closed")