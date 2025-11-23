from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from enum import Enum
import uuid

class MessageType(str, Enum):
    TEAM = "team"
    DIRECT = "direct"

class Message(BaseModel):
    id: str = None
    type: MessageType
    sender_id: str
    sender_name: str
    sender_role: str
    content: str
    team_id: Optional[str] = None  # For team messages
    recipient_id: Optional[str] = None  # For direct messages
    recipient_name: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    mentions: List[str] = []  # List of user IDs mentioned
    created_at: datetime = None
    read_by: List[str] = []  # List of user IDs who read the message
    
    def __init__(self, **data):
        super().__init__(**data)
        if self.id is None:
            self.id = str(uuid.uuid4())
        if self.created_at is None:
            self.created_at = datetime.now(timezone.utc)

class SendMessage(BaseModel):
    type: MessageType
    content: str
    team_id: Optional[str] = None
    recipient_id: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    mentions: List[str] = []

class ChatUser(BaseModel):
    id: str
    name: str
    role: str
    team_id: Optional[str] = None
    online: bool = False
