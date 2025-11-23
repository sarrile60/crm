"""
Gunicorn Configuration for Production
"""
import multiprocessing
import os

# Server Socket
bind = "127.0.0.1:8001"
backlog = 2048

# Worker Processes
workers = int(os.getenv("WORKERS", 4))
worker_class = "uvicorn.workers.UvicornWorker"
worker_connections = 1000
max_requests = 1000
max_requests_jitter = 50
timeout = 30
keepalive = 5

# Process Naming
proc_name = "legal_crm_backend"

# Logging
accesslog = "/var/log/gunicorn/access.log"
errorlog = "/var/log/gunicorn/error.log"
loglevel = "warning"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'

# Security
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190

# Server Mechanics
daemon = False
pidfile = "/var/run/gunicorn.pid"
user = None
group = None
tmp_upload_dir = None

# SSL (if using)
keyfile = None
certfile = None
