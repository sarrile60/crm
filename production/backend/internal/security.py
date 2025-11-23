"""
Production Security Module
Hardened authentication, authorization, and security utilities
"""
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Security, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Dict, Any
from .config import settings
import logging
import hashlib
from collections import defaultdict
import time

logger = logging.getLogger(__name__)
security = HTTPBearer()


# Rate limiting storage (in production, use Redis)
rate_limit_storage = defaultdict(lambda: {"count": 0, "reset_time": 0})
login_attempts = defaultdict(lambda: {"count": 0, "locked_until": 0})


class SecurityManager:
    """Centralized security management"""
    
    @staticmethod
    def hash_password(password: str) -> str:
        """Hash password with bcrypt using configured rounds"""
        salt = bcrypt.gensalt(rounds=settings.bcrypt_rounds)
        return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify password against hash"""
        try:
            return bcrypt.checkpw(
                plain_password.encode('utf-8'),
                hashed_password.encode('utf-8')
            )
        except Exception as e:
            logger.error(f"Password verification error: {e}")
            return False
    
    @staticmethod
    def validate_password_strength(password: str) -> bool:
        """Validate password meets security requirements"""
        if not settings.require_strong_passwords:
            return len(password) >= settings.password_min_length
        
        if len(password) < settings.password_min_length:
            return False
        
        # Check for uppercase, lowercase, digit, special char
        has_upper = any(c.isupper() for c in password)
        has_lower = any(c.islower() for c in password)
        has_digit = any(c.isdigit() for c in password)
        has_special = any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password)
        
        return has_upper and has_lower and has_digit and has_special
    
    @staticmethod
    def create_access_token(data: dict) -> str:
        """Create secure JWT token"""
        to_encode = data.copy()
        expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiration_hours)
        to_encode.update({
            "exp": expire,
            "iat": datetime.now(timezone.utc),
            "jti": hashlib.sha256(str(time.time()).encode()).hexdigest()[:16]
        })
        
        encoded_jwt = jwt.encode(
            to_encode,
            settings.jwt_secret,
            algorithm=settings.jwt_algorithm
        )
        return encoded_jwt
    
    @staticmethod
    def verify_token(token: str) -> Dict[str, Any]:
        """Verify and decode JWT token"""
        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=[settings.jwt_algorithm]
            )
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token has expired")
        except jwt.JWTError:
            raise HTTPException(status_code=401, detail="Invalid token")
    
    @staticmethod
    def check_rate_limit(identifier: str, max_requests: int, window: int) -> bool:
        """Check if request is within rate limit"""
        if not settings.rate_limit_enabled:
            return True
        
        current_time = time.time()
        record = rate_limit_storage[identifier]
        
        # Reset if window expired
        if current_time > record["reset_time"]:
            record["count"] = 0
            record["reset_time"] = current_time + window
        
        # Check limit
        if record["count"] >= max_requests:
            return False
        
        record["count"] += 1
        return True
    
    @staticmethod
    def check_login_attempts(identifier: str) -> bool:
        """Check if user is locked out due to failed login attempts"""
        current_time = time.time()
        record = login_attempts[identifier]
        
        # Check if still locked
        if current_time < record["locked_until"]:
            return False
        
        # Check if exceeded max attempts
        if record["count"] >= settings.max_login_attempts:
            # Lock the account
            record["locked_until"] = current_time + (settings.lockout_duration_minutes * 60)
            logger.warning(f"Account locked due to failed attempts: {identifier}")
            return False
        
        return True
    
    @staticmethod
    def record_failed_login(identifier: str):
        """Record a failed login attempt"""
        record = login_attempts[identifier]
        record["count"] += 1
    
    @staticmethod
    def reset_login_attempts(identifier: str):
        """Reset login attempts after successful login"""
        if identifier in login_attempts:
            del login_attempts[identifier]


async def get_current_user_secured(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> Dict[str, Any]:
    """
    Secured dependency to get current authenticated user
    """
    try:
        token = credentials.credentials
        payload = SecurityManager.verify_token(token)
        
        # Validate required fields
        if not payload.get("id") or not payload.get("email") or not payload.get("role"):
            raise HTTPException(status_code=401, detail="Invalid token payload")
        
        return {
            "id": payload.get("id"),
            "email": payload.get("email"),
            "role": payload.get("role"),
            "full_name": payload.get("full_name"),
            "team_id": payload.get("team_id")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")


def require_role_secured(allowed_roles: list):
    """
    Dependency to require specific roles
    """
    async def role_checker(current_user: dict = Security(get_current_user_secured)):
        if current_user["role"] not in allowed_roles:
            logger.warning(
                f"Unauthorized access attempt by {current_user['email']} "
                f"(role: {current_user['role']}) to endpoint requiring {allowed_roles}"
            )
            raise HTTPException(
                status_code=403,
                detail="You don't have permission to access this resource"
            )
        return current_user
    return role_checker


async def rate_limit_middleware(request: Request):
    """Middleware for rate limiting"""
    if not settings.rate_limit_enabled:
        return
    
    # Get client identifier (IP address)
    client_ip = request.client.host
    
    # Check rate limit
    if not SecurityManager.check_rate_limit(
        client_ip,
        settings.rate_limit_max_requests,
        settings.rate_limit_window_seconds
    ):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later."
        )
