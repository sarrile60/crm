"""
Performance profiling utilities for backend
Measures DB query times, API response times, and payload sizes
"""
import time
import logging
import json
from functools import wraps
from typing import Any, Callable
from fastapi import Response

logger = logging.getLogger(__name__)

class PerformanceMonitor:
    """Monitor and log performance metrics"""
    
    @staticmethod
    def log_query_time(query_name: str, duration_ms: float, result_count: int = None):
        """Log database query performance"""
        msg = f"[DB QUERY] {query_name}: {duration_ms:.2f}ms"
        if result_count is not None:
            msg += f" | {result_count} results"
        
        if duration_ms > 200:
            logger.warning(f"⚠️ SLOW QUERY: {msg}")
        else:
            logger.info(msg)
    
    @staticmethod
    def log_api_performance(endpoint: str, duration_ms: float, payload_size: int = None):
        """Log API endpoint performance"""
        msg = f"[API] {endpoint}: {duration_ms:.2f}ms"
        if payload_size:
            size_kb = payload_size / 1024
            msg += f" | {size_kb:.2f}KB payload"
            if size_kb > 100:
                logger.warning(f"⚠️ LARGE PAYLOAD: {msg}")
        
        if duration_ms > 1000:
            logger.warning(f"⚠️ SLOW API: {msg}")
        else:
            logger.info(msg)

def measure_time(func: Callable) -> Callable:
    """Decorator to measure function execution time"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start = time.time()
        result = await func(*args, **kwargs)
        duration_ms = (time.time() - start) * 1000
        logger.info(f"[TIMING] {func.__name__}: {duration_ms:.2f}ms")
        return result
    return wrapper

async def measure_db_query(db_cursor, query_name: str):
    """Context manager to measure DB query time"""
    start = time.time()
    results = await db_cursor.to_list(10000)  # Adjust limit as needed
    duration_ms = (time.time() - start) * 1000
    PerformanceMonitor.log_query_time(query_name, duration_ms, len(results))
    return results
