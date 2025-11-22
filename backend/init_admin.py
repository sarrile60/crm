"""
Initialize first admin user for CRM
Run this script once to create the initial admin account
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
from auth_utils import hash_password
from crm_models import User, UserRole

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def create_admin():
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    # Check if admin already exists
    existing_admin = await db.crm_users.find_one({"email": "admin@1lawsolicitors.com"})
    
    if existing_admin:
        print("✅ Admin user already exists!")
        print(f"Email: admin@1lawsolicitors.com")
        return
    
    # Create admin user
    admin_password = "Admin@123456"  # Change this after first login!
    hashed_pw = hash_password(admin_password)
    
    admin = User(
        email="admin@1lawsolicitors.com",
        full_name="System Administrator",
        role=UserRole.ADMIN
    )
    
    admin_dict = admin.dict()
    admin_dict["password"] = hashed_pw
    
    await db.crm_users.insert_one(admin_dict)
    
    print("✅ Admin user created successfully!")
    print(f"Email: admin@1lawsolicitors.com")
    print(f"Password: {admin_password}")
    print("⚠️  IMPORTANT: Change this password after first login!")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(create_admin())
