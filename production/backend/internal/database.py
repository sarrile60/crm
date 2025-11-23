"""
Secured MongoDB Database Connection Module
"""
from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings
import logging

logger = logging.getLogger(__name__)


class Database:
    """Singleton database connection manager"""
    client: AsyncIOMotorClient = None
    db = None


db_instance = Database()


async def connect_to_database():
    """
    Establish secure MongoDB connection with authentication
    """
    try:
        logger.info("Connecting to MongoDB with authentication...")
        
        # Create authenticated connection
        db_instance.client = AsyncIOMotorClient(
            settings.mongo_uri,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=10000,
            socketTimeoutMS=10000,
            maxPoolSize=50,
            minPoolSize=10
        )
        
        # Get database
        db_instance.db = db_instance.client[settings.mongo_database]
        
        # Test connection
        await db_instance.client.admin.command('ping')
        
        logger.info(f"✅ Successfully connected to MongoDB: {settings.mongo_database}")
        
        # Create indexes for performance
        await create_indexes()
        
    except Exception as e:
        logger.error(f"❌ Failed to connect to MongoDB: {e}")
        raise


async def close_database_connection():
    """Close database connection gracefully"""
    if db_instance.client:
        db_instance.client.close()
        logger.info("✅ MongoDB connection closed")


async def create_indexes():
    """Create database indexes for performance"""
    try:
        # Leads indexes
        await db_instance.db.leads.create_index("email")
        await db_instance.db.leads.create_index("status")
        await db_instance.db.leads.create_index("assigned_to")
        await db_instance.db.leads.create_index("team_id")
        await db_instance.db.leads.create_index("createdAt")
        
        # Users indexes
        await db_instance.db.crm_users.create_index("email", unique=True)
        await db_instance.db.crm_users.create_index("role")
        await db_instance.db.crm_users.create_index("team_id")
        
        # Activity logs index
        await db_instance.db.activity_logs.create_index([("timestamp", -1)])
        await db_instance.db.activity_logs.create_index("lead_id")
        
        logger.info("✅ Database indexes created successfully")
        
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")


def get_database():
    """Get database instance (for dependency injection)"""
    return db_instance.db
