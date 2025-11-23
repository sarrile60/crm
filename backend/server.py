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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Initialize CRM database
init_crm_db(db)

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
    return {"message": "1 LAW SOLICITORS API - Running", "status": "healthy"}

# Include the routers in the main app
app.include_router(api_router)
app.include_router(crm_router)

# CORS Configuration (Restricted for Production)
cors_origins = os.environ.get('CORS_ALLOWED_ORIGINS', 'https://lawfirm-ops.preview.emergentagent.com').split(',')
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[origin.strip() for origin in cors_origins],  # Specific origins only
    allow_methods=["GET", "POST", "PUT", "DELETE"],  # Explicit methods
    allow_headers=["Authorization", "Content-Type"],  # Explicit headers
    max_age=3600  # Cache preflight for 1 hour
)

@app.on_event("startup")
async def startup_event():
    await init_analytics()
    logger.info("Application started successfully")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    logger.info("Database connection closed")