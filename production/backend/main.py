"""
Production-Ready FastAPI Application
Fully secured with all best practices implemented
"""
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import time
from typing import Callable

# Internal modules
from internal.config import settings
from internal.database import connect_to_database, close_database_connection
from internal.security import rate_limit_middleware

# API routes
from api import public_routes, crm_routes, admin_routes

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    logger.info("🚀 Starting production application...")
    await connect_to_database()
    logger.info("✅ Application startup complete")
    yield
    # Shutdown
    logger.info("🛑 Shutting down application...")
    await close_database_connection()
    logger.info("✅ Application shutdown complete")


# Create FastAPI app with production settings
app = FastAPI(
    title="1 LAW SOLICITORS CRM",
    version="1.0.0",
    docs_url=None,  # Disable Swagger UI in production
    redoc_url=None,  # Disable ReDoc in production
    openapi_url=None,  # Disable OpenAPI schema endpoint
    lifespan=lifespan
)


# ====================
# SECURITY MIDDLEWARE
# ====================

@app.middleware("http")
async def security_headers_middleware(request: Request, call_next: Callable):
    """Add security headers to all responses"""
    response = await call_next(request)
    
    # Security headers
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
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
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    response.headers["Content-Security-Policy"] = csp
    
    # Remove server identification
    response.headers.pop("Server", None)
    
    return response


@app.middleware("http")
async def rate_limiting_middleware(request: Request, call_next: Callable):
    """Apply rate limiting to all requests"""
    try:
        await rate_limit_middleware(request)
    except HTTPException as e:
        return JSONResponse(
            status_code=e.status_code,
            content={"detail": e.detail}
        )
    
    response = await call_next(request)
    return response


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next: Callable):
    """Log all requests (excluding sensitive data)"""
    start_time = time.time()
    
    # Process request
    response = await call_next(request)
    
    # Calculate processing time
    process_time = time.time() - start_time
    
    # Log request (sanitize sensitive paths)
    path = request.url.path
    if "password" not in path.lower() and "secret" not in path.lower():
        logger.info(
            f"{request.method} {path} - "
            f"Status: {response.status_code} - "
            f"Time: {process_time:.3f}s"
        )
    
    return response


# CORS Configuration - Strict production settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,  # Only allowed domains
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=3600
)


# Trusted Host Middleware
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.allowed_hosts
)


# ====================
# ROUTE REGISTRATION
# ====================

# Public routes (landing page API)
app.include_router(public_routes.router, prefix="/api", tags=["public"])

# CRM routes (authenticated)
app.include_router(crm_routes.router, prefix="/api/crm", tags=["crm"])

# Admin routes (admin only)
app.include_router(admin_routes.router, prefix="/api/admin", tags=["admin"])


# ====================
# ERROR HANDLERS
# ====================

@app.exception_handler(404)
async def not_found_handler(request: Request, exc: HTTPException):
    """Custom 404 handler"""
    return JSONResponse(
        status_code=404,
        content={"detail": "Resource not found"}
    )


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: Exception):
    """Custom 500 handler - don't leak error details"""
    logger.error(f"Internal server error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )


# ====================
# HEALTH CHECK
# ====================

@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "environment": settings.app_env
    }


# ====================
# ROOT ENDPOINT
# ====================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "1 LAW SOLICITORS CRM API",
        "status": "operational",
        "version": "1.0.0"
    }
