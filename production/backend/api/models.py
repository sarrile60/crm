from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import datetime
import uuid

class Lead(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    fullName: str
    email: EmailStr
    phone: str
    scammerCompany: str
    amountLost: str
    caseDetails: str
    createdAt: datetime = Field(default_factory=datetime.utcnow)

class LeadCreate(BaseModel):
    fullName: str
    email: EmailStr
    phone: str
    scammerCompany: str
    amountLost: str
    caseDetails: str

class Analytics(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    pageViews: int = 0
    formStarts: int = 0
    ctaClicks: int = 0
    ctaClicksByLocation: dict = Field(default_factory=dict)
    lastUpdated: datetime = Field(default_factory=datetime.utcnow)

class AdminLogin(BaseModel):
    username: str
    password: str

class AdminToken(BaseModel):
    token: str
    success: bool = True