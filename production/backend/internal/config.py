"""
Production Configuration Module
All sensitive configuration loaded from environment variables
"""
import os
from functools import lru_cache
from pydantic import BaseSettings, validator


class Settings(BaseSettings):
    """Application settings loaded from environment"""
    
    # Admin Credentials
    admin_username: str
    admin_password: str
    
    # JWT Configuration
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24
    
    # Cookie Configuration
    cookie_secret: str
    cookie_secure: bool = True
    cookie_httponly: bool = True
    cookie_samesite: str = "strict"
    
    # Session Management
    session_secret: str
    session_timeout: int = 3600
    
    # MongoDB Configuration
    mongo_uri: str
    mongo_database: str
    
    # Application Settings
    app_env: str = "production"
    debug: bool = False
    log_level: str = "WARNING"
    allowed_hosts: str
    
    # Rate Limiting
    rate_limit_enabled: bool = True
    rate_limit_max_requests: int = 100
    rate_limit_window_seconds: int = 60
    login_rate_limit: int = 5
    login_rate_window: int = 300
    
    # CORS Settings
    cors_origins: str
    cors_allow_credentials: bool = True
    
    # Security Settings
    bcrypt_rounds: int = 12
    password_min_length: int = 12
    require_strong_passwords: bool = True
    max_login_attempts: int = 5
    lockout_duration_minutes: int = 30
    
    # Backend Configuration
    backend_host: str = "127.0.0.1"
    backend_port: int = 8001
    workers: int = 4
    
    @validator('cors_origins')
    def parse_cors_origins(cls, v):
        """Parse comma-separated CORS origins into list"""
        return [origin.strip() for origin in v.split(',')]
    
    @validator('allowed_hosts')
    def parse_allowed_hosts(cls, v):
        """Parse comma-separated allowed hosts into list"""
        return [host.strip() for host in v.split(',')]
    
    class Config:
        env_file = ".env.production"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


# Export settings instance
settings = get_settings()
