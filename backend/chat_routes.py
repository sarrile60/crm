from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, UploadFile, File, Header
from typing import List, Dict, Optional
import json
from datetime import datetime, timezone
from chat_models import Message, SendMessage, MessageType, ChatUser
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
import uuid
import base64
import jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# JWT Secret
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here-change-in-production')
JWT_ALGORITHM = 'HS256'

# Token verification function
async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.split(' ')[1]
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def verify_token_sync(token: str) -> dict:
    """Synchronous token verification for WebSocket"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except:
        return None

chat_router = APIRouter(prefix="/chat", tags=["chat"])

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
    
    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket
    
    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
    
    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(message)
            except:
                self.disconnect(user_id)
    
    async def broadcast_to_team(self, message: dict, team_id: str, sender_id: str, db):
        # Get all users in the team
        users = await db.crm_users.find({"team_id": team_id}, {"_id": 0}).to_list(1000)
        for user in users:
            if user["id"] != sender_id and user["id"] in self.active_connections:
                try:
                    await self.active_connections[user["id"]].send_json(message)
                except:
                    self.disconnect(user["id"])

manager = ConnectionManager()

# Get database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Helper function to check hierarchical messaging permissions
def can_message(sender_role: str, recipient_role: str) -> bool:
    """Check if sender can message recipient based on hierarchy"""
    hierarchy = {
        "agent": ["supervisor", "admin"],
        "supervisor": ["admin"],
        "admin": ["supervisor", "agent"]  # Admin can message anyone
    }
    
    return recipient_role in hierarchy.get(sender_role, [])

@chat_router.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    """WebSocket endpoint for real-time chat"""
    user_id = None
    try:
        # Verify token and get user
        payload = verify_token_sync(token)
        if not payload:
            await websocket.close(code=1008)
            return
        user_id = payload.get("id")
        
        if not user_id:
            await websocket.close(code=1008)
            return
        
        # Connect user
        await manager.connect(user_id, websocket)
        
        # Mark user as online
        await db.crm_users.update_one(
            {"id": user_id},
            {"$set": {"online": True}}
        )
        
        # Notify others about online status
        await manager.send_personal_message({
            "type": "status",
            "user_id": user_id,
            "online": True
        }, user_id)
        
        try:
            while True:
                data = await websocket.receive_text()
                # Keep connection alive, actual messaging happens via REST API
                
        except WebSocketDisconnect:
            manager.disconnect(user_id)
            # Mark user as offline
            await db.crm_users.update_one(
                {"id": user_id},
                {"$set": {"online": False}}
            )
            
    except Exception as e:
        print(f"WebSocket error: {e}")
        if user_id:
            manager.disconnect(user_id)

@chat_router.post("/send")
async def send_message(message_data: SendMessage, token: str = Depends(verify_token)):
    """Send a message (team or direct)"""
    sender = await db.crm_users.find_one({"id": token["id"]}, {"_id": 0})
    
    if not sender:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check permissions for direct messages
    if message_data.type == MessageType.DIRECT:
        if not message_data.recipient_id:
            raise HTTPException(status_code=400, detail="Recipient required for direct message")
        
        recipient = await db.crm_users.find_one({"id": message_data.recipient_id}, {"_id": 0})
        if not recipient:
            raise HTTPException(status_code=404, detail="Recipient not found")
        
        # Check hierarchical permissions
        if not can_message(sender["role"], recipient["role"]):
            raise HTTPException(
                status_code=403, 
                detail=f"You cannot send messages to {recipient['role']}s. Check hierarchy rules."
            )
        
        # Create direct message
        message = Message(
            type=MessageType.DIRECT,
            sender_id=sender["id"],
            sender_name=sender["full_name"],
            sender_role=sender["role"],
            content=message_data.content,
            recipient_id=recipient["id"],
            recipient_name=recipient["full_name"],
            file_url=message_data.file_url,
            file_name=message_data.file_name,
            mentions=message_data.mentions
        )
        
        # Save to database
        await db.chat_messages.insert_one(message.dict())
        
        # Send via WebSocket
        await manager.send_personal_message({
            "type": "new_message",
            "message": message.dict()
        }, recipient["id"])
        
        # Also send to sender for confirmation
        await manager.send_personal_message({
            "type": "message_sent",
            "message": message.dict()
        }, sender["id"])
        
    elif message_data.type == MessageType.TEAM:
        if not message_data.team_id:
            raise HTTPException(status_code=400, detail="Team ID required for team message")
        
        # Verify user is in the team
        if sender.get("team_id") != message_data.team_id and sender["role"] != "admin":
            raise HTTPException(status_code=403, detail="You are not in this team")
        
        # Create team message
        message = Message(
            type=MessageType.TEAM,
            sender_id=sender["id"],
            sender_name=sender["full_name"],
            sender_role=sender["role"],
            content=message_data.content,
            team_id=message_data.team_id,
            file_url=message_data.file_url,
            file_name=message_data.file_name,
            mentions=message_data.mentions
        )
        
        # Save to database
        await db.chat_messages.insert_one(message.dict())
        
        # Broadcast to team via WebSocket
        await manager.broadcast_to_team({
            "type": "new_message",
            "message": message.dict()
        }, message_data.team_id, sender["id"], db)
    
    return {"success": True, "message_id": message.id}

@chat_router.get("/messages/team/{team_id}")
async def get_team_messages(team_id: str, limit: int = 50, token: dict = Depends(verify_token)):
    """Get team chat messages"""
    user = await db.crm_users.find_one({"id": token["id"]}, {"_id": 0})
    
    # Verify user is in team or admin
    if user.get("team_id") != team_id and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    messages = await db.chat_messages.find(
        {"type": "team", "team_id": team_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return list(reversed(messages))

@chat_router.get("/messages/direct/{other_user_id}")
async def get_direct_messages(other_user_id: str, limit: int = 50, token: dict = Depends(verify_token)):
    """Get direct messages with another user"""
    user_id = token["id"]
    
    messages = await db.chat_messages.find({
        "type": "direct",
        "$or": [
            {"sender_id": user_id, "recipient_id": other_user_id},
            {"sender_id": other_user_id, "recipient_id": user_id}
        ]
    }, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    
    return list(reversed(messages))

@chat_router.get("/contacts")
async def get_chat_contacts(token: dict = Depends(verify_token)):
    """Get list of users the current user can chat with (hierarchical)"""
    user = await db.crm_users.find_one({"id": token["id"]}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    contacts = []
    
    if user["role"] == "agent":
        # Agents can message supervisors and admin
        supervisors = await db.crm_users.find(
            {"role": "supervisor", "team_id": user.get("team_id")},
            {"_id": 0, "password": 0}
        ).to_list(100)
        admin = await db.crm_users.find(
            {"role": "admin"},
            {"_id": 0, "password": 0}
        ).to_list(100)
        contacts = supervisors + admin
        
    elif user["role"] == "supervisor":
        # Supervisors can message admin
        admin = await db.crm_users.find(
            {"role": "admin"},
            {"_id": 0, "password": 0}
        ).to_list(100)
        contacts = admin
        
    elif user["role"] == "admin":
        # Admin can message everyone
        all_users = await db.crm_users.find(
            {"id": {"$ne": user["id"]}},
            {"_id": 0, "password": 0}
        ).to_list(1000)
        contacts = all_users
    
    return contacts

@chat_router.post("/upload")
async def upload_file(file: UploadFile = File(...), token: dict = Depends(verify_token)):
    """Upload a file for chat"""
    try:
        # Read file content
        content = await file.read()
        
        # Convert to base64 for simple storage (in production, use S3 or similar)
        file_data = base64.b64encode(content).decode('utf-8')
        
        # Store file metadata
        file_doc = {
            "id": str(uuid.uuid4()),
            "filename": file.filename,
            "content_type": file.content_type,
            "data": file_data,
            "uploaded_by": token["id"],
            "uploaded_at": datetime.now(timezone.utc)
        }
        
        await db.chat_files.insert_one(file_doc)
        
        return {
            "success": True,
            "file_id": file_doc["id"],
            "file_url": f"/api/chat/files/{file_doc['id']}",
            "file_name": file.filename
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@chat_router.get("/files/{file_id}")
async def get_file(file_id: str, token: dict = Depends(verify_token)):
    """Download a chat file"""
    file_doc = await db.chat_files.find_one({"id": file_id}, {"_id": 0})
    
    if not file_doc:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Decode base64
    file_data = base64.b64decode(file_doc["data"])
    
    from fastapi.responses import Response
    return Response(
        content=file_data,
        media_type=file_doc["content_type"],
        headers={"Content-Disposition": f"attachment; filename={file_doc['filename']}"}
    )

@chat_router.put("/messages/{message_id}/read")
async def mark_message_read(message_id: str, token: dict = Depends(verify_token)):
    """Mark a message as read"""
    user_id = token["id"]
    
    await db.chat_messages.update_one(
        {"id": message_id},
        {"$addToSet": {"read_by": user_id}}
    )
    
    return {"success": True}

@chat_router.get("/unread-count")
async def get_unread_count(token: dict = Depends(verify_token)):
    """Get count of unread messages"""
    user_id = token["id"]
    
    # Count direct messages where user is recipient and hasn't read
    direct_unread = await db.chat_messages.count_documents({
        "type": "direct",
        "recipient_id": user_id,
        "read_by": {"$ne": user_id}
    })
    
    # Count team messages where user is in team and hasn't read
    user = await db.crm_users.find_one({"id": user_id}, {"_id": 0})
    team_unread = 0
    if user.get("team_id"):
        team_unread = await db.chat_messages.count_documents({
            "type": "team",
            "team_id": user["team_id"],
            "sender_id": {"$ne": user_id},
            "read_by": {"$ne": user_id}
        })
    
    return {
        "direct": direct_unread,
        "team": team_unread,
        "total": direct_unread + team_unread
    }
