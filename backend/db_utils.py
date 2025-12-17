"""
Database Utilities Module
Provides helper functions for MongoDB operations to prevent common issues like ObjectId serialization.

This module addresses the recurring ObjectId serialization bug where:
1. MongoDB's insert_one() adds _id field to the document in-place
2. FastAPI cannot serialize ObjectId, causing 500 errors
3. Responses must exclude _id field

Usage:
    from db_utils import insert_and_return_clean

    # Instead of:
    # await db.collection.insert_one(doc)
    # return doc  # BREAKS - has _id

    # Use:
    # clean_doc = await insert_and_return_clean(db.collection, doc)
    # return clean_doc  # WORKS - no _id
"""

from typing import Any, Dict
from copy import deepcopy
from datetime import datetime


async def insert_and_return_clean(collection, document: Dict[str, Any]) -> Dict[str, Any]:
    """
    Insert a document into MongoDB and return a clean copy without _id.
    
    This function:
    1. Creates a deep copy of the document before insertion
    2. Inserts the copy (MongoDB adds _id to the copy)
    3. Returns the original document (which has no _id)
    
    Args:
        collection: MongoDB collection (motor AsyncIOMotorCollection)
        document: Dictionary to insert
        
    Returns:
        The original document without _id field (safe for JSON serialization)
        
    Example:
        user = {"id": "123", "name": "John"}
        clean_user = await insert_and_return_clean(db.users, user)
        return clean_user  # Returns {"id": "123", "name": "John"} - no _id
    """
    # Create a copy for insertion (MongoDB will modify this copy)
    doc_for_insert = deepcopy(document)
    
    # Insert the copy
    await collection.insert_one(doc_for_insert)
    
    # Return original (no _id)
    return document


async def insert_many_and_return_clean(collection, documents: list) -> list:
    """
    Insert multiple documents and return clean copies without _id.
    
    Args:
        collection: MongoDB collection
        documents: List of dictionaries to insert
        
    Returns:
        List of original documents without _id fields
    """
    if not documents:
        return []
    
    # Create copies for insertion
    docs_for_insert = [deepcopy(doc) for doc in documents]
    
    # Insert copies
    await collection.insert_many(docs_for_insert)
    
    # Return originals (no _id)
    return documents


def serialize_datetime(obj: Any) -> Any:
    """
    Convert datetime objects to ISO format strings for JSON serialization.
    
    Args:
        obj: Any value that might be a datetime
        
    Returns:
        ISO string if datetime, otherwise the original value
    """
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj


def clean_document_for_response(document: Dict[str, Any]) -> Dict[str, Any]:
    """
    Clean a MongoDB document for API response.
    
    Removes _id and converts datetime objects to ISO strings.
    
    Args:
        document: MongoDB document (may have _id)
        
    Returns:
        Clean document safe for JSON serialization
    """
    if document is None:
        return None
    
    clean = {}
    for key, value in document.items():
        if key == "_id":
            continue
        if isinstance(value, datetime):
            clean[key] = value.isoformat()
        elif isinstance(value, dict):
            clean[key] = clean_document_for_response(value)
        elif isinstance(value, list):
            clean[key] = [
                clean_document_for_response(item) if isinstance(item, dict)
                else serialize_datetime(item)
                for item in value
            ]
        else:
            clean[key] = value
    
    return clean


def build_clean_response(document: Dict[str, Any], include_fields: list = None) -> Dict[str, Any]:
    """
    Build a clean response dictionary from a document.
    
    Args:
        document: Source document
        include_fields: Optional list of fields to include. If None, includes all except _id.
        
    Returns:
        Clean dictionary for API response
    """
    if include_fields:
        return {
            k: serialize_datetime(v) 
            for k, v in document.items() 
            if k in include_fields and k != "_id"
        }
    else:
        return {
            k: serialize_datetime(v) 
            for k, v in document.items() 
            if k != "_id"
        }
