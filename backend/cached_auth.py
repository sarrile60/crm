"""
Shared Cached Authentication Module
Provides a cached get_current_user dependency for ALL route files.
Eliminates the #1 performance issue: every route file had its own
get_current_user that hit MongoDB on every single request.

With this cache (30s TTL), authenticated requests resolve in ~0ms
instead of ~115ms (Atlas round-trip).
"""
import time
import logging
from typing import Optional
from fastapi import Header, HTTPException

logger = logging.getLogger(__name__)

# In-memory user cache: user_id -> (timestamp, user_doc)
_user_cache = {}
_USER_CACHE_TTL = 30  # seconds

db = None

def init_cached_auth(database):
    """Initialize with database reference"""
    global db
    db = database

def invalidate_user(user_id: str = None):
    """Invalidate cache for a user or all users"""
    if user_id:
        _user_cache.pop(user_id, None)
    else:
        _user_cache.clear()

async def get_current_user_cached(authorization: Optional[str] = Header(None)):
    """
    Cached user auth dependency. Use this in ALL route files.
    First call: ~115ms (DB query). Subsequent calls: ~0ms (cache hit).
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization header")
    
    try:
        from auth_utils import decode_token
        
        token = authorization.replace('Bearer ', '')
        payload = decode_token(token)
        user_id = payload.get("user_id")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Check cache
        if user_id in _user_cache:
            ts, user = _user_cache[user_id]
            if time.time() - ts < _USER_CACHE_TTL:
                return user
        
        # Cache miss - query DB
        user = await db.crm_users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        # Cache it
        _user_cache[user_id] = (time.time(), user)
        return user
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))
