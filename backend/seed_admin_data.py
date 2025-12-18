"""
Seed Admin Data - Convert hard-coded roles to database configuration
This script:
1. Creates roles collection with existing roles
2. Creates default permissions for each role
3. Creates entity_configs for available entities
4. Migrates user role associations
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import uuid
from datetime import datetime, timezone
import os


async def seed_admin_data():
    """Seed initial admin configuration from existing hard-coded setup"""
    
    # Connect to database
    mongo_url = os.environ.get('MONGO_URL')
    client = AsyncIOMotorClient(mongo_url)
    db = client['legal_crm_production']
    
    print("🌱 Seeding admin configuration...")
    
    # ============================================
    # 1. CREATE ROLES
    # ============================================
    
    # Check if roles already exist
    existing_roles = await db.roles.count_documents({})
    if existing_roles > 0:
        print("✅ Roles already seeded, skipping...")
    else:
        roles = [
            {
                "id": str(uuid.uuid4()),
                "name": "admin",
                "description": "role_desc_admin",
                "is_system": True,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            },
            {
                "id": str(uuid.uuid4()),
                "name": "supervisor",
                "description": "role_desc_supervisor",
                "is_system": True,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            },
            {
                "id": str(uuid.uuid4()),
                "name": "agent",
                "description": "role_desc_agent",
                "is_system": True,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
        ]
        
        await db.roles.insert_many(roles)
        print(f"✅ Created {len(roles)} roles")
        
        # Store role IDs for permission creation
        admin_role_id = roles[0]["id"]
        supervisor_role_id = roles[1]["id"]
        agent_role_id = roles[2]["id"]
    
    # ============================================
    # 2. CREATE ENTITY CONFIGURATIONS
    # ============================================
    
    existing_entities = await db.entity_configs.count_documents({})
    if existing_entities > 0:
        print("✅ Entities already configured, skipping...")
    else:
        entities = [
            {
                "id": str(uuid.uuid4()),
                "entity_name": "leads",
                "display_name": "Leads",
                "icon": "users",
                "enabled": True,
                "order": 1,
                "created_at": datetime.now(timezone.utc)
            },
            {
                "id": str(uuid.uuid4()),
                "entity_name": "contacts",
                "display_name": "Contacts",
                "icon": "user",
                "enabled": True,
                "order": 2,
                "created_at": datetime.now(timezone.utc)
            },
            {
                "id": str(uuid.uuid4()),
                "entity_name": "deposits",
                "display_name": "Deposits",
                "icon": "dollar-sign",
                "enabled": True,
                "order": 3,
                "created_at": datetime.now(timezone.utc)
            },
            {
                "id": str(uuid.uuid4()),
                "entity_name": "calls",
                "display_name": "Calls",
                "icon": "phone",
                "enabled": True,
                "order": 4,
                "created_at": datetime.now(timezone.utc)
            },
            {
                "id": str(uuid.uuid4()),
                "entity_name": "accounts",
                "display_name": "Accounts",
                "icon": "building",
                "enabled": True,
                "order": 5,
                "created_at": datetime.now(timezone.utc)
            }
        ]
        
        await db.entity_configs.insert_many(entities)
        print(f"✅ Created {len(entities)} entity configurations")
    
    # ============================================
    # 3. CREATE DEFAULT PERMISSIONS
    # ============================================
    
    existing_perms = await db.permissions.count_documents({})
    if existing_perms > 0:
        print("✅ Permissions already seeded, skipping...")
    else:
        # Get role IDs
        admin_role = await db.roles.find_one({"name": "admin"})
        supervisor_role = await db.roles.find_one({"name": "supervisor"})
        agent_role = await db.roles.find_one({"name": "agent"})
        
        if not (admin_role and supervisor_role and agent_role):
            print("❌ Roles not found, cannot create permissions")
            return
        
        permissions = []
        entities = ["leads", "contacts", "deposits", "calls", "accounts"]
        actions = ["read", "create", "edit", "delete", "assign", "export"]
        
        # Admin permissions - full access to everything
        for entity in entities:
            for action in actions:
                scope = "all" if action in ["read", "edit", "delete"] else "yes"
                permissions.append({
                    "id": str(uuid.uuid4()),
                    "role_id": admin_role["id"],
                    "entity": entity,
                    "action": action,
                    "scope": scope,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                })
        
        # Supervisor permissions - team-level access
        for entity in entities:
            for action in actions:
                if action == "read":
                    scope = "team"
                elif action in ["create", "assign"]:
                    scope = "yes"
                elif action in ["edit", "delete"]:
                    scope = "team"
                elif action == "export":
                    scope = "yes"
                else:
                    scope = "team"
                
                permissions.append({
                    "id": str(uuid.uuid4()),
                    "role_id": supervisor_role["id"],
                    "entity": entity,
                    "action": action,
                    "scope": scope,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                })
        
        # Agent permissions - own records only
        for entity in entities:
            for action in actions:
                if action == "read":
                    scope = "own"
                elif action == "create":
                    scope = "yes"
                elif action in ["edit", "delete"]:
                    scope = "own"
                elif action in ["assign", "export"]:
                    scope = "no"
                else:
                    scope = "own"
                
                permissions.append({
                    "id": str(uuid.uuid4()),
                    "role_id": agent_role["id"],
                    "entity": entity,
                    "action": action,
                    "scope": scope,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                })
        
        await db.permissions.insert_many(permissions)
        print(f"✅ Created {len(permissions)} default permissions")
    
    # ============================================
    # 4. MIGRATE USER ROLE ASSOCIATIONS
    # ============================================
    
    existing_user_roles = await db.user_roles.count_documents({})
    if existing_user_roles > 0:
        print("✅ User roles already migrated, skipping...")
    else:
        # Get all users with old role field
        users = await db.crm_users.find({}).to_list(1000)
        
        user_role_assignments = []
        for user in users:
            user_role_name = user.get("role", "agent")
            
            # Find matching role
            role = await db.roles.find_one({"name": user_role_name})
            if role:
                user_role_assignments.append({
                    "user_id": user["id"],
                    "role_id": role["id"],
                    "assigned_at": datetime.now(timezone.utc)
                })
        
        if user_role_assignments:
            await db.user_roles.insert_many(user_role_assignments)
            print(f"✅ Migrated {len(user_role_assignments)} user role assignments")
        else:
            print("✅ No user roles to migrate")
    
    print("\n🎉 Admin data seeding complete!")
    print("\n📊 Summary:")
    print(f"   Roles: {await db.roles.count_documents({})}")
    print(f"   Permissions: {await db.permissions.count_documents({})}")
    print(f"   Entities: {await db.entity_configs.count_documents({})}")
    print(f"   User roles: {await db.user_roles.count_documents({})}")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(seed_admin_data())
