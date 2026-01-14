from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from uuid import uuid4
import os
import base64

router = APIRouter(prefix="/api/chat", tags=["chat"])

# Models
class MessageCreate(BaseModel):
    content: str
    message_type: str = "text"  # text, image, file
    file_url: Optional[str] = None
    file_name: Optional[str] = None

class ConversationCreate(BaseModel):
    name: Optional[str] = None  # For group chats
    is_group: bool = False
    participant_ids: List[str]

class TypingIndicator(BaseModel):
    is_typing: bool

# Dependency to get current user from token (reuse CRM auth)
async def get_current_user(request: Request):
    from server import db
    from crm_routes import get_user_from_token
    
    authorization = request.headers.get("Authorization", "")
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        token = authorization.replace('Bearer ', '')
        user_data = get_user_from_token(token)
        user = await db.crm_users.find_one({"id": user_data["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

# Helper function to populate participant details for a conversation
async def populate_conversation_participants(db, conversation):
    """Populate participant details for a conversation"""
    participants = []
    for pid in conversation.get("participant_ids", []):
        if pid == "system_notifications":
            participants.append({
                "id": "system_notifications",
                "full_name": "⚠️ System Alerts",
                "username": "system",
                "role": "system",
                "status": "active"
            })
        else:
            user = await db.crm_users.find_one(
                {"id": pid}, 
                {"_id": 0, "id": 1, "full_name": 1, "username": 1, "role": 1, "status": 1}
            )
            if user:
                participants.append(user)
    conversation["participants"] = participants
    return conversation

# Create a new conversation (private or group)
@router.post("/conversations")
async def create_conversation(data: ConversationCreate, request: Request):
    from server import db
    
    
    current_user = await get_current_user(request)
    
    # For private chats, check if conversation already exists
    if not data.is_group and len(data.participant_ids) == 1:
        other_user_id = data.participant_ids[0]
        existing = await db.conversations.find_one({
            "is_group": False,
            "participant_ids": {"$all": [current_user["id"], other_user_id], "$size": 2}
        }, {"_id": 0})
        
        if existing:
            # Populate participant details before returning
            await populate_conversation_participants(db, existing)
            return existing
    
    # Create new conversation
    all_participant_ids = list(set([current_user["id"]] + data.participant_ids))
    
    conversation = {
        "id": str(uuid4()),
        "name": data.name,
        "is_group": data.is_group,
        "participant_ids": all_participant_ids,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_message": None,
        "last_message_at": None,
        "typing_users": []
    }
    
    await db.conversations.insert_one(conversation)
    del conversation["_id"]
    
    # Populate participant details before returning
    await populate_conversation_participants(db, conversation)
    
    return conversation

# Get all conversations for current user
@router.get("/conversations")
async def get_conversations(request: Request):
    from server import db
    
    
    current_user = await get_current_user(request)
    
    conversations = await db.conversations.find(
        {"participant_ids": current_user["id"]},
        {"_id": 0}
    ).sort("last_message_at", -1).to_list(100)
    
    # Get participant details for each conversation using helper
    for conv in conversations:
        await populate_conversation_participants(db, conv)
        
        # Get unread count for this user
        unread_count = await db.messages.count_documents({
            "conversation_id": conv["id"],
            "sender_id": {"$ne": current_user["id"]},
            "read_by": {"$nin": [current_user["id"]]}
        })
        conv["unread_count"] = unread_count
    
    return {"conversations": conversations}

# Get available teams for team chat (admin sees all, supervisor sees their teams)
@router.get("/teams")
async def get_chat_teams(request: Request):
    from server import db
    
    current_user = await get_current_user(request)
    role = current_user.get("role", "").lower()
    
    # Only admins and supervisors can access team chat
    if role not in ["admin", "supervisor"]:
        return {"teams": []}
    
    if role == "admin":
        # Admin sees all active teams
        teams = await db.teams.find(
            {"$or": [{"archived_at": None}, {"archived_at": {"$exists": False}}]},
            {"_id": 0, "id": 1, "name": 1, "description": 1, "supervisor_id": 1}
        ).to_list(100)
    else:
        # Supervisor sees teams they supervise OR teams they are assigned to
        user_team_id = current_user.get("team_id")
        
        # Build query: teams they supervise OR their assigned team
        team_conditions = [{"supervisor_id": current_user["id"]}]
        if user_team_id:
            team_conditions.append({"id": user_team_id})
        
        teams = await db.teams.find(
            {
                "$or": team_conditions,
                "$and": [{"$or": [{"archived_at": None}, {"archived_at": {"$exists": False}}]}]
            },
            {"_id": 0, "id": 1, "name": 1, "description": 1, "supervisor_id": 1}
        ).to_list(100)
    
    # Add member count to each team
    for team in teams:
        member_count = await db.crm_users.count_documents({
            "team_id": team["id"],
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}],
            "is_active": {"$ne": False}
        })
        team["member_count"] = member_count
    
    return {"teams": teams}

# Create or get team conversation
@router.post("/teams/{team_id}/conversation")
async def create_team_conversation(team_id: str, request: Request):
    from server import db
    
    current_user = await get_current_user(request)
    role = current_user.get("role", "").lower()
    
    # Only admins and supervisors can create team chats
    if role not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Only admins and supervisors can create team chats")
    
    # Verify team exists
    team = await db.teams.find_one({"id": team_id}, {"_id": 0})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    # For supervisors, verify they supervise this team
    if role == "supervisor" and team.get("supervisor_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only chat with teams you supervise")
    
    # Check if team conversation already exists
    existing = await db.conversations.find_one({
        "team_id": team_id,
        "is_team_chat": True
    }, {"_id": 0})
    
    if existing:
        return existing
    
    # Get all team members
    team_members = await db.crm_users.find(
        {
            "team_id": team_id,
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}],
            "is_active": {"$ne": False}
        },
        {"_id": 0, "id": 1}
    ).to_list(100)
    
    participant_ids = [m["id"] for m in team_members]
    
    # Add supervisor if not already in team
    if team.get("supervisor_id") and team["supervisor_id"] not in participant_ids:
        participant_ids.append(team["supervisor_id"])
    
    # Add current user if not already included
    if current_user["id"] not in participant_ids:
        participant_ids.append(current_user["id"])
    
    # Create team conversation
    conversation = {
        "id": str(uuid4()),
        "team_id": team_id,
        "is_team_chat": True,
        "is_group": True,
        "name": f"Team: {team['name']}",
        "participant_ids": participant_ids,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"],
        "last_message": None,
        "last_message_at": None,
        "typing_users": []
    }
    
    await db.conversations.insert_one(conversation)
    if "_id" in conversation:
        del conversation["_id"]
    
    return conversation

# Send message to team (updates participant list dynamically)
@router.post("/teams/{team_id}/messages")
async def send_team_message(team_id: str, data: MessageCreate, request: Request):
    from server import db
    
    current_user = await get_current_user(request)
    role = current_user.get("role", "").lower()
    
    # Only admins and supervisors can send team messages
    if role not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Only admins and supervisors can send team messages")
    
    # Verify team exists
    team = await db.teams.find_one({"id": team_id}, {"_id": 0})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    # For supervisors, verify they supervise this team
    if role == "supervisor" and team.get("supervisor_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only message teams you supervise")
    
    # Get or create team conversation
    conversation = await db.conversations.find_one({
        "team_id": team_id,
        "is_team_chat": True
    }, {"_id": 0})
    
    if not conversation:
        # Create conversation first
        team_members = await db.crm_users.find(
            {
                "team_id": team_id,
                "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}],
                "is_active": {"$ne": False}
            },
            {"_id": 0, "id": 1}
        ).to_list(100)
        
        participant_ids = [m["id"] for m in team_members]
        if team.get("supervisor_id") and team["supervisor_id"] not in participant_ids:
            participant_ids.append(team["supervisor_id"])
        if current_user["id"] not in participant_ids:
            participant_ids.append(current_user["id"])
        
        conversation = {
            "id": str(uuid4()),
            "team_id": team_id,
            "is_team_chat": True,
            "is_group": True,
            "name": f"Team: {team['name']}",
            "participant_ids": participant_ids,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user["id"],
            "last_message": None,
            "last_message_at": None,
            "typing_users": []
        }
        await db.conversations.insert_one(conversation)
    else:
        # Update participant list to include any new team members
        team_members = await db.crm_users.find(
            {
                "team_id": team_id,
                "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}],
                "is_active": {"$ne": False}
            },
            {"_id": 0, "id": 1}
        ).to_list(100)
        
        new_participant_ids = set(conversation.get("participant_ids", []))
        for m in team_members:
            new_participant_ids.add(m["id"])
        if team.get("supervisor_id"):
            new_participant_ids.add(team["supervisor_id"])
        if current_user["id"] not in new_participant_ids:
            new_participant_ids.add(current_user["id"])
        
        await db.conversations.update_one(
            {"id": conversation["id"]},
            {"$set": {"participant_ids": list(new_participant_ids)}}
        )
    
    # Create message
    now = datetime.now(timezone.utc)
    message = {
        "id": str(uuid4()),
        "conversation_id": conversation["id"],
        "sender_id": current_user["id"],
        "content": data.content,
        "message_type": data.message_type,
        "file_url": data.file_url,
        "file_name": data.file_name,
        "created_at": now.isoformat(),
        "read_by": [current_user["id"]],
        "delivered_to": [current_user["id"]]
    }
    
    await db.messages.insert_one(message)
    
    # Update conversation
    await db.conversations.update_one(
        {"id": conversation["id"]},
        {
            "$set": {
                "last_message": data.content[:50] + "..." if len(data.content) > 50 else data.content,
                "last_message_at": now.isoformat()
            }
        }
    )
    
    # Add sender info
    message["sender"] = {
        "id": current_user["id"],
        "full_name": current_user.get("full_name"),
        "username": current_user.get("username"),
        "role": current_user.get("role")
    }
    
    if "_id" in message:
        del message["_id"]
    
    return message

# Get messages in a conversation
@router.get("/conversations/{conversation_id}/messages")
async def get_messages(conversation_id: str, request: Request, limit: int = 50, before: Optional[str] = None):
    from server import db
    
    
    current_user = await get_current_user(request)
    
    # Verify user is participant
    conversation = await db.conversations.find_one({
        "id": conversation_id,
        "participant_ids": current_user["id"]
    })
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    query = {"conversation_id": conversation_id}
    if before:
        query["created_at"] = {"$lt": before}
    
    messages = await db.messages.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Add sender info to each message
    for msg in messages:
        if msg["sender_id"] == "system_notifications":
            msg["sender"] = {
                "id": "system_notifications",
                "full_name": "⚠️ System Alerts",
                "username": "system",
                "role": "system"
            }
        else:
            sender = await db.crm_users.find_one({"id": msg["sender_id"]}, {"_id": 0, "id": 1, "full_name": 1, "username": 1, "role": 1})
            msg["sender"] = sender
    
    return {"messages": list(reversed(messages))}

# Send a message
@router.post("/conversations/{conversation_id}/messages")
async def send_message(conversation_id: str, data: MessageCreate, request: Request):
    from server import db
    
    
    current_user = await get_current_user(request)
    
    # Verify user is participant
    conversation = await db.conversations.find_one({
        "id": conversation_id,
        "participant_ids": current_user["id"]
    })
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    message = {
        "id": str(uuid4()),
        "conversation_id": conversation_id,
        "sender_id": current_user["id"],
        "content": data.content,
        "message_type": data.message_type,
        "file_url": data.file_url,
        "file_name": data.file_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read_by": [current_user["id"]],
        "delivered_to": [current_user["id"]]
    }
    
    await db.messages.insert_one(message)
    
    # Update conversation with last message
    await db.conversations.update_one(
        {"id": conversation_id},
        {
            "$set": {
                "last_message": data.content[:100],
                "last_message_at": message["created_at"],
                "typing_users": []
            }
        }
    )
    
    del message["_id"]
    
    # Add sender info
    message["sender"] = {
        "id": current_user["id"],
        "full_name": current_user["full_name"],
        "username": current_user["username"],
        "role": current_user["role"]
    }
    
    return message

# Mark messages as read
@router.put("/conversations/{conversation_id}/read")
async def mark_messages_read(conversation_id: str, request: Request):
    from server import db
    
    
    current_user = await get_current_user(request)
    
    # Mark all messages in conversation as read by this user
    result = await db.messages.update_many(
        {
            "conversation_id": conversation_id,
            "read_by": {"$nin": [current_user["id"]]}
        },
        {"$addToSet": {"read_by": current_user["id"]}}
    )
    
    return {"updated": result.modified_count}

# Send typing indicator
@router.post("/conversations/{conversation_id}/typing")
async def send_typing(conversation_id: str, data: TypingIndicator, request: Request):
    from server import db
    
    
    current_user = await get_current_user(request)
    
    if data.is_typing:
        await db.conversations.update_one(
            {"id": conversation_id},
            {"$addToSet": {"typing_users": current_user["id"]}}
        )
    else:
        await db.conversations.update_one(
            {"id": conversation_id},
            {"$pull": {"typing_users": current_user["id"]}}
        )
    
    return {"success": True}

# Get typing status for a conversation
@router.get("/conversations/{conversation_id}/typing")
async def get_typing(conversation_id: str, request: Request):
    from server import db
    
    
    current_user = await get_current_user(request)
    
    conversation = await db.conversations.find_one(
        {"id": conversation_id},
        {"_id": 0, "typing_users": 1}
    )
    
    if not conversation:
        return {"typing_users": []}
    
    # Get user details for typing users (exclude current user)
    typing_users = []
    for uid in conversation.get("typing_users", []):
        if uid != current_user["id"]:
            user = await db.crm_users.find_one({"id": uid}, {"_id": 0, "id": 1, "full_name": 1})
            if user:
                typing_users.append(user)
    
    return {"typing_users": typing_users}

# Upload file/image
@router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...)):
    from server import db
    
    current_user = await get_current_user(request)
    
    # Create uploads directory if it doesn't exist
    upload_dir = "/app/backend/uploads/chat"
    os.makedirs(upload_dir, exist_ok=True)
    
    # Generate unique filename
    file_ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid4()}{file_ext}"
    file_path = os.path.join(upload_dir, unique_filename)
    
    # Save file
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Determine file type
    image_extensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"]
    file_type = "image" if file_ext.lower() in image_extensions else "file"
    
    backend_url = os.environ.get("REACT_APP_BACKEND_URL", "")
    file_url = f"{backend_url}/api/chat/files/{unique_filename}"
    
    return {
        "file_url": file_url,
        "file_name": file.filename,
        "file_type": file_type
    }

# Serve uploaded files
@router.get("/files/{filename}")
async def get_file(filename: str):
    from fastapi.responses import FileResponse
    
    file_path = f"/app/backend/uploads/chat/{filename}"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(file_path)

# Search messages
@router.get("/search")
async def search_messages(request: Request, q: str, limit: int = 20):
    from server import db
    
    
    current_user = await get_current_user(request)
    
    # Get user's conversations
    user_conversations = await db.conversations.find(
        {"participant_ids": current_user["id"]},
        {"_id": 0, "id": 1}
    ).to_list(100)
    
    conversation_ids = [c["id"] for c in user_conversations]
    
    # Search messages in user's conversations
    messages = await db.messages.find(
        {
            "conversation_id": {"$in": conversation_ids},
            "content": {"$regex": q, "$options": "i"}
        },
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Add sender and conversation info
    for msg in messages:
        sender = await db.crm_users.find_one({"id": msg["sender_id"]}, {"_id": 0, "id": 1, "full_name": 1})
        msg["sender"] = sender
        
        conv = await db.conversations.find_one({"id": msg["conversation_id"]}, {"_id": 0, "id": 1, "name": 1, "is_group": 1})
        msg["conversation"] = conv
    
    return {"messages": messages}

# Get all users for starting new chat
@router.get("/users")
async def get_chat_users(request: Request):
    from server import db
    
    
    current_user = await get_current_user(request)
    
    # Get all users except current user (status field may not exist in crm_users)
    users = await db.crm_users.find(
        {"id": {"$ne": current_user["id"]}, "status": {"$ne": "deleted"}},
        {"_id": 0, "id": 1, "full_name": 1, "username": 1, "role": 1}
    ).to_list(100)
    
    return {"users": users}

# Get new messages (for polling)
@router.get("/poll")
async def poll_messages(request: Request, since: Optional[str] = None, conversation_id: Optional[str] = None):
    from server import db
    
    
    current_user = await get_current_user(request)
    
    # Get user's conversations
    user_conversations = await db.conversations.find(
        {"participant_ids": current_user["id"]},
        {"_id": 0, "id": 1}
    ).to_list(100)
    
    conversation_ids = [c["id"] for c in user_conversations]
    
    query = {
        "conversation_id": {"$in": conversation_ids},
        "sender_id": {"$ne": current_user["id"]}
    }
    
    if since:
        query["created_at"] = {"$gt": since}
    
    new_messages = await db.messages.find(
        query,
        {"_id": 0}
    ).sort("created_at", 1).to_list(50)
    
    # Add sender info
    for msg in new_messages:
        if msg["sender_id"] == "system_notifications":
            msg["sender"] = {
                "id": "system_notifications",
                "full_name": "⚠️ System Alerts"
            }
        else:
            sender = await db.crm_users.find_one({"id": msg["sender_id"]}, {"_id": 0, "id": 1, "full_name": 1})
            msg["sender"] = sender
    
    # Get typing indicators
    typing_info = {}
    for conv_id in conversation_ids:
        conv = await db.conversations.find_one({"id": conv_id}, {"_id": 0, "typing_users": 1})
        if conv and conv.get("typing_users"):
            typing_users = [u for u in conv["typing_users"] if u != current_user["id"]]
            if typing_users:
                typing_info[conv_id] = typing_users
    
    # Get read status updates for the current conversation (if specified)
    read_updates = []
    if conversation_id:
        # Get messages sent by current user in this conversation with their read_by status
        my_messages = await db.messages.find(
            {
                "conversation_id": conversation_id,
                "sender_id": current_user["id"]
            },
            {"_id": 0, "id": 1, "read_by": 1}
        ).to_list(100)
        read_updates = my_messages
    
    return {
        "messages": new_messages,
        "typing": typing_info,
        "read_updates": read_updates
    }
