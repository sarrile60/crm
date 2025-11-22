#!/usr/bin/env python3
"""
Reset agent user password
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
from auth_utils import hash_password

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def reset_password():
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    # Reset password for all test agents
    test_password = "TestPass123!"
    hashed_pw = hash_password(test_password)
    
    agents = await db.crm_users.find({"role": "agent"}).to_list(100)
    
    for agent in agents:
        await db.crm_users.update_one(
            {"id": agent["id"]},
            {"$set": {"password": hashed_pw}}
        )
        print(f"✅ Reset password for {agent['email']}")
    
    print(f"\n🔑 All agent passwords reset to: {test_password}")
    client.close()

if __name__ == "__main__":
    asyncio.run(reset_password())
