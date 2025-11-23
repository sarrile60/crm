#!/bin/bash
# MongoDB Security Setup Script

set -e

echo "🔒 Setting up MongoDB with authentication..."

# Load environment variables
source /app/production/.env.production

# Stop MongoDB if running
sudo systemctl stop mongod 2>/dev/null || true

# Update MongoDB configuration
sudo tee /etc/mongod.conf > /dev/null <<EOF
storage:
  dbPath: /var/lib/mongodb
  journal:
    enabled: true

systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

net:
  port: 27017
  bindIp: 127.0.0.1

security:
  authorization: enabled

EOF

echo "✅ MongoDB configuration updated"

# Start MongoDB without auth to create admin user
sudo mongod --fork --logpath /var/log/mongodb/mongod.log --dbpath /var/lib/mongodb --bind_ip 127.0.0.1

sleep 3

echo "📝 Creating MongoDB admin user..."

# Create admin user
mongosh admin --eval "
db.createUser({
  user: '$MONGO_USERNAME',
  pwd: '$MONGO_PASSWORD',
  roles: [
    { role: 'root', db: 'admin' },
    { role: 'readWrite', db: '$MONGO_DATABASE' }
  ]
})
"

echo "✅ MongoDB admin user created"

# Restart MongoDB with authentication
sudo mongod --shutdown
sleep 2
sudo systemctl start mongod

echo "✅ MongoDB is now secured and running with authentication"
echo "   Bound to: 127.0.0.1 only"
echo "   Authentication: ENABLED"
