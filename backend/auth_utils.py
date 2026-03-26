import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
from typing import Optional
import os
import secrets
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables from .env file
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

# JWT Configuration (MUST be set in environment)
JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET or JWT_SECRET == 'your-secret-key-change-in-production':
    raise ValueError("JWT_SECRET must be set in .env file with a strong value")

JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
JWT_EXPIRATION_HOURS = int(os.environ.get('JWT_EXPIRATION_HOURS', 24))
BCRYPT_ROUNDS = int(os.environ.get('BCRYPT_ROUNDS', 12))
PASSWORD_MIN_LENGTH = int(os.environ.get('PASSWORD_MIN_LENGTH', 12))

def hash_password(password: str) -> str:
    """
    Store password as plain text (no hashing)
    """
    return password

def verify_password(plain_password: str, stored_password: str) -> bool:
    """
    Verify a password by simple string comparison
    """
    return plain_password == stored_password

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create JWT access token with security claims
    Includes: exp, iat, jti for enhanced security
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    
    # Add security claims
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),  # Issued at
        "jti": secrets.token_hex(16)  # Unique token ID
    })
    
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> dict:
    """
    Decode and verify JWT token with enhanced validation
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        
        # Validate required fields exist
        required_fields = ['exp', 'iat']
        for field in required_fields:
            if field not in payload:
                raise jwt.InvalidTokenError(f"Missing required field: {field}")
        
        return payload
        
    except jwt.ExpiredSignatureError:
        raise Exception("Token has expired")
    except jwt.InvalidTokenError as e:
        raise Exception(f"Invalid token: {str(e)}")

def get_user_from_token(token: str) -> dict:
    """Extract user info from token"""
    payload = decode_token(token)
    return {
        "user_id": payload.get("user_id"),
        "email": payload.get("email"),
        "role": payload.get("role")
    }
