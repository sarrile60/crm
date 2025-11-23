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

# Helper function to create JWT token
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=24)
    to_encode.update({"exp": expire})
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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    await init_analytics()
    logger.info("Application started successfully")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    logger.info("Database connection closed")