import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Load .env file if present
load_dotenv()

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI-Proctored Online Examination Platform"
    API_V1_STR: str = "/api"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "df179eef3bf45d2e389d311fa904724b17b2b8e3a5df67c83c2763f03bda9e17")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:0000@localhost:5432/proctoredexam")
    
    # Gemini API
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    
    # Uploads
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "static/uploads")

    class Config:
        case_sensitive = True

settings = Settings()

# Ensure upload directory exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
