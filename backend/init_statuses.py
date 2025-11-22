"""
Initialize default CRM statuses
Run this script once to create the default statuses
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
from crm_models import CustomStatus

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def create_statuses():
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    # Clear existing statuses
    await db.custom_statuses.delete_many({})
    
    statuses = [
        # No Answer statuses (1-10)
        *[CustomStatus(name=f"No answer {i}", color="#6B7280", order=i) for i in range(1, 11)],
        
        # Callback statuses
        CustomStatus(name="Callback", color="#F59E0B", order=11),
        CustomStatus(name="Potential Callback", color="#10B981", order=12),
        
        # In Progress
        CustomStatus(name="Pharos in progress", color="#3B82F6", order=13),
        
        # Deposit statuses (1-5)
        *[CustomStatus(name=f"Deposit {i}", color="#8B5CF6", order=13+i) for i in range(1, 6)],
        
        # Not Interested
        CustomStatus(name="Not interested", color="#EF4444", order=19),
    ]
    
    for status in statuses:
        await db.custom_statuses.insert_one(status.dict())
        print(f"✅ Created status: {status.name}")
    
    print(f"\n✅ Total {len(statuses)} statuses created successfully!")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(create_statuses())
