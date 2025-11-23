// ============================================
// MongoDB Security Setup Script
// Run with: mongosh < /app/secure_mongodb.js
// ============================================

print("🔒 Starting MongoDB Security Setup...");

// Switch to admin database
use admin

// Create admin user
print("\n📝 Creating admin user...");
try {
    db.createUser({
        user: "admin",
        pwd: "AdminSecure2024!MongoDBPassword",
        roles: [ { role: "root", db: "admin" } ]
    });
    print("✅ Admin user created successfully");
} catch (e) {
    print("⚠️  Admin user may already exist: " + e);
}

// Create application user
print("\n📝 Creating application user...");
try {
    db.createUser({
        user: "crm_user_390f9df9",
        pwd: "Xs)hZxnjIXLG^mFSh49#&LNDHL_s*UosIS6uIWl_",
        roles: [
            { role: "readWrite", db: "legal_crm_production" },
            { role: "readWrite", db: "test_database" }  // Keep existing DB
        ]
    });
    print("✅ Application user created successfully");
} catch (e) {
    print("⚠️  Application user may already exist: " + e);
}

// Test authentication
print("\n🧪 Testing authentication...");
db.auth("crm_user_390f9df9", "Xs)hZxnjIXLG^mFSh49#&LNDHL_s*UosIS6uIWl_");
print("✅ Authentication successful!");

print("\n✅ MongoDB security setup complete!");
print("\n📋 Connection string:");
print("mongodb://crm_user_390f9df9:Xs)hZxnjIXLG^mFSh49#&LNDHL_s*UosIS6uIWl_@localhost:27017/legal_crm_production?authSource=admin");
