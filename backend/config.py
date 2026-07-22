import os
from dotenv import load_dotenv

# Load .env from parent directory (project root)
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
# Always prefer values from the local .env in this project (dev environment).
# This avoids confusion when Windows session env vars are already set.
load_dotenv(dotenv_path=env_path, override=True)

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'

    # Timezone used for storing/displaying local timestamps (sqlite stores naive datetimes).
    # Default is Asia/Kolkata for this project.
    TIMEZONE = os.environ.get("APP_TIMEZONE") or "Asia/Kolkata"
    
    # Database
    SQLALCHEMY_DATABASE_URI = 'sqlite:///restaurant.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # CORS for Vue frontend
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "http://localhost:8080"
    ]
    
    # App settings
    DEBUG = True
