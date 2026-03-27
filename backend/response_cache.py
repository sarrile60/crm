"""
Server-Side Response Cache
Caches full API responses in memory for GET endpoints.
Eliminates the 115ms Atlas round-trip for repeated identical requests.

With this cache:
- First call: ~115ms (normal DB query)  
- Repeat calls within TTL: <1ms (memory read)

Cache is invalidated on any write operation (POST/PUT/DELETE).
"""
import time
import json
import hashlib
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

class ResponseCache:
    """In-memory response cache with TTL and key-based invalidation"""
    
    def __init__(self, default_ttl: int = 15):
        self.default_ttl = default_ttl  # seconds
        self._cache: Dict[str, tuple] = {}  # key -> (timestamp, response_data)
        self._entity_keys: Dict[str, set] = {}  # entity -> set of cache keys
    
    def _make_key(self, path: str, user_id: str, params: str = "") -> str:
        """Create cache key from path + user + params"""
        raw = f"{path}:{user_id}:{params}"
        return hashlib.md5(raw.encode()).hexdigest()
    
    def get(self, path: str, user_id: str, params: str = "") -> Optional[Any]:
        """Get cached response if not expired"""
        key = self._make_key(path, user_id, params)
        if key in self._cache:
            ts, data = self._cache[key]
            if time.time() - ts < self.default_ttl:
                return data
            else:
                del self._cache[key]
        return None
    
    def set(self, path: str, user_id: str, data: Any, params: str = "", entity: str = None):
        """Cache a response, optionally tagged with entity for invalidation"""
        key = self._make_key(path, user_id, params)
        self._cache[key] = (time.time(), data)
        
        # Track which entity this cache belongs to
        if entity:
            if entity not in self._entity_keys:
                self._entity_keys[entity] = set()
            self._entity_keys[entity].add(key)
    
    def invalidate_entity(self, entity: str):
        """Invalidate all caches for an entity (e.g., after a write)"""
        if entity in self._entity_keys:
            for key in self._entity_keys[entity]:
                self._cache.pop(key, None)
            self._entity_keys[entity].clear()
    
    def invalidate_all(self):
        """Clear all caches"""
        self._cache.clear()
        self._entity_keys.clear()
    
    @property
    def stats(self):
        return {
            "entries": len(self._cache),
            "entities": list(self._entity_keys.keys())
        }


# Singleton
response_cache = ResponseCache(default_ttl=15)
