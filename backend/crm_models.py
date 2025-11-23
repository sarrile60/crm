from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
from enum import Enum
import uuid

class UserRole(str, Enum):
    ADMIN = "admin"
    SUPERVISOR = "supervisor"
    AGENT = "agent"

class LeadStatus(str, Enum):
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    CALLBACK = "callback"
    IN_PROGRESS = "in_progress"
    WON = "won"
    LOST = "lost"
    REJECTED = "rejected"

class LeadPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"

# User Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    full_name: str
    role: UserRole
    team_id: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None
    last_login: Optional[datetime] = None

class UserCreate(BaseModel):
    username: str
    full_name: str
    password: str
    role: UserRole
    team_id: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[UserRole] = None
    team_id: Optional[str] = None
    is_active: Optional[bool] = None

# Team Models
class Team(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    supervisor_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True

class TeamCreate(BaseModel):
    name: str
    description: Optional[str] = None
    supervisor_id: Optional[str] = None

# Custom Status Models
class CustomStatus(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: str  # Hex color code
    order: int
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CustomStatusCreate(BaseModel):
    name: str
    color: str
    order: int

# Enhanced Lead Models
class LeadEnhanced(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    fullName: str
    email: EmailStr
    phone: str
    scammerCompany: str
    amountLost: str
    caseDetails: str
    status: str = "new"
    priority: str = "medium"
    assigned_to: Optional[str] = None  # User ID
    assigned_by: Optional[str] = None  # User ID
    team_id: Optional[str] = None
    callback_date: Optional[datetime] = None
    callback_notes: Optional[str] = None
    tags: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_contacted: Optional[datetime] = None

class LeadUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None
    callback_date: Optional[datetime] = None
    callback_notes: Optional[str] = None
    tags: Optional[List[str]] = None

class LeadAssignment(BaseModel):
    lead_id: str
    assigned_to: str
    assigned_by: str

# Mass Update Model
class MassUpdateData(BaseModel):
    lead_ids: List[str]
    status: Optional[str] = None
    team_id: Optional[str] = None
    assigned_to: Optional[str] = None

# Activity Log Models
class ActivityLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    user_id: str
    user_name: str
    action: str  # "status_changed", "assigned", "note_added", etc.
    details: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ActivityLogCreate(BaseModel):
    lead_id: str
    user_id: str
    user_name: str
    action: str
    details: str

# Note Models
class LeadNote(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    user_id: str
    user_name: str
    note: str
    is_internal: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LeadNoteCreate(BaseModel):
    lead_id: str
    note: str
    is_internal: bool = True

# Callback Reminder Models
class CallbackReminder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    assigned_to: str
    callback_date: datetime
    notes: str
    is_completed: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None

class CallbackReminderCreate(BaseModel):
    lead_id: str
    assigned_to: str
    callback_date: datetime
    notes: str
