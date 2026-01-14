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
from functools import lru_cache
import time

# Simple in-memory cache for visibility rules (TTL: 60 seconds)
_visibility_cache = {}
_visibility_cache_ttl = 60  # seconds


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


# ============================================
# DATA VISIBILITY / MASKING UTILITIES
# ============================================

def mask_phone(phone: str) -> str:
    """
    Mask phone number - show only last 4 digits.
    Backend-only function for data visibility rules.
    
    Examples:
        "+39 335 123 4567" -> "*** *** *567"
        "3351234567" -> "******4567"
    """
    if not phone:
        return ""
    
    # Remove all non-digit characters for processing
    digits_only = ''.join(filter(str.isdigit, phone))
    
    if len(digits_only) <= 4:
        return phone  # Too short to mask
    
    # Keep last 4 digits
    last_4 = digits_only[-4:]
    
    # Determine prefix based on original format
    if phone.startswith('+'):
        country_code = phone[:3]  # e.g., "+39"
        return f"{country_code} *** *** *{last_4}"
    else:
        # Generic masking
        masked_len = len(digits_only) - 4
        return "*" * masked_len + last_4


def mask_email(email: str) -> str:
    """
    Mask email - show first 2 characters and domain.
    Backend-only function for data visibility rules.
    
    Examples:
        "mario.rossi@example.com" -> "ma***@example.com"
        "ab@test.it" -> "ab***@test.it"
    """
    if not email or '@' not in email:
        return ""
    
    local, domain = email.split('@', 1)
    
    if len(local) <= 2:
        # Very short local part - show first char only
        return f"{local[0]}***@{domain}"
    else:
        # Show first 2 characters
        return f"{local[:2]}***@{domain}"


def mask_address(address: str) -> str:
    """
    Mask address - show only city/region (last part).
    Backend-only function for data visibility rules.
    
    Examples:
        "Via Roma 123, 00100, Roma" -> "*****, Roma"
        "12 Caroline Street, Birmingham B3 1TR" -> "*****, Birmingham B3 1TR"
    """
    if not address:
        return ""
    
    # Split by comma and keep last meaningful part
    parts = [p.strip() for p in address.split(',')]
    
    if len(parts) >= 2:
        # Keep last part (usually city/postcode)
        return f"*****, {parts[-1]}"
    else:
        # No comma - mask most of it
        if len(address) > 10:
            return f"*****... {address[-8:]}"
        return "*****"


def apply_visibility_rule(value: str, field_name: str, visibility: str) -> str:
    """
    Apply visibility rule to a field value.
    
    Args:
        value: Original field value
        field_name: Field name ("phone", "email", "address")
        visibility: Visibility level ("full", "masked", "hidden")
        
    Returns:
        Processed value based on visibility rule
    """
    if not value:
        return ""
    
    if visibility == "full":
        return value
    elif visibility == "hidden":
        return ""
    elif visibility == "masked":
        if field_name == "phone":
            return mask_phone(value)
        elif field_name == "email":
            return mask_email(value)
        elif field_name == "address":
            return mask_address(value)
        else:
            # Unknown field - hide by default
            return "***"
    else:
        # Unknown visibility level - return masked
        return "***"


async def get_user_visibility_rules(db, user_id: str, user_role: str, user_team_ids: list) -> Dict[str, str]:
    """
    Get visibility rules for a user based on their role and teams.
    Returns a dict of field_name -> visibility level.
    
    Priority: Role rules take precedence over team rules.
    If no rule exists, default is "masked".
    
    Args:
        db: Database connection
        user_id: User ID
        user_role: User's role name (e.g., "admin", "agent")
        user_team_ids: List of team IDs the user belongs to
        
    Returns:
        Dict like {"phone": "full", "email": "masked", "address": "hidden"}
    """
    # Default visibility for all fields
    default_visibility = {
        "phone": "masked",
        "email": "masked", 
        "address": "masked"
    }
    
    # Admin always gets full visibility
    if user_role and user_role.lower() == "admin":
        return {
            "phone": "full",
            "email": "full",
            "address": "full"
        }
    
    result = default_visibility.copy()
    
    # Get role-based rules (highest priority)
    role = await db.roles.find_one({"name": {"$regex": f"^{user_role}$", "$options": "i"}}, {"_id": 0})
    if role:
        role_rules = await db.visibility_rules.find({
            "scope_type": "role",
            "scope_id": role["id"]
        }, {"_id": 0}).to_list(100)
        
        for rule in role_rules:
            result[rule["field_name"]] = rule["visibility"]
    
    # Get team-based rules (lower priority - only apply if role didn't set)
    if user_team_ids:
        team_rules = await db.visibility_rules.find({
            "scope_type": "team",
            "scope_id": {"$in": user_team_ids}
        }, {"_id": 0}).to_list(100)
        
        for rule in team_rules:
            field = rule["field_name"]
            # Only apply team rule if role didn't already set a more permissive rule
            if field not in result or result[field] == "masked":
                # Team rules can only make things more visible, not less
                if rule["visibility"] == "full":
                    result[field] = "full"
    
    return result


def apply_visibility_to_lead(lead: Dict[str, Any], visibility_rules: Dict[str, str]) -> Dict[str, Any]:
    """
    Apply visibility rules to a lead document.
    Modifies phone, email, and address fields based on rules.
    
    Args:
        lead: Lead document
        visibility_rules: Dict of field_name -> visibility level
        
    Returns:
        Lead with visibility rules applied
    """
    result = lead.copy()
    
    # Apply phone visibility
    if "phone" in result and result["phone"]:
        phone_visibility = visibility_rules.get("phone", "masked")
        result["phone_display"] = apply_visibility_rule(result["phone"], "phone", phone_visibility)
        # Keep real phone for tel: links only if visibility is not "hidden"
        if phone_visibility == "hidden":
            result["phone_real"] = ""
        else:
            result["phone_real"] = result["phone"]
    
    # Apply email visibility
    if "email" in result and result["email"]:
        email_visibility = visibility_rules.get("email", "masked")
        result["email_display"] = apply_visibility_rule(result["email"], "email", email_visibility)
        if email_visibility == "hidden":
            result["email"] = ""
        elif email_visibility == "masked":
            result["email"] = result["email_display"]
    
    # Apply address visibility
    if "address" in result and result["address"]:
        address_visibility = visibility_rules.get("address", "masked")
        result["address_display"] = apply_visibility_rule(result["address"], "address", address_visibility)
        if address_visibility == "hidden":
            result["address"] = ""
        elif address_visibility == "masked":
            result["address"] = result["address_display"]
    
    return result
