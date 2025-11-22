#!/usr/bin/env python3
"""
Fix leads data to match CRM expectations
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path('backend')
load_dotenv(ROOT_DIR / '.env')

async def fix_leads_data():
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    print("Fixing leads data...")
    
    # Get all leads
    leads = await db.leads.find({}).to_list(1000)
    
    for lead in leads:
        update_data = {}
        
        # Fix created_at field
        if 'createdAt' in lead and 'created_at' not in lead:
            update_data['created_at'] = lead['createdAt']
        
        # Ensure all required fields exist
        if 'status' not in lead:
            update_data['status'] = 'new'
        if 'priority' not in lead:
            update_data['priority'] = 'medium'
        
        # Update the lead if needed
        if update_data:
            await db.leads.update_one(
                {'_id': lead['_id']},
                {'$set': update_data}
            )
            print(f"Updated lead {lead.get('fullName', 'Unknown')}")
    
    print("Data fix completed!")
    client.close()

if __name__ == "__main__":
    asyncio.run(fix_leads_data())