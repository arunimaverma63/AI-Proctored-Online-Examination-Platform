from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import os

from app.config import settings
from app.database import engine, Base, SessionLocal
from app.models import User
from app.routers import auth, exams, proctor, grading
from app.routers.auth import get_password_hash

# Create tables
Base.metadata.create_all(bind=engine)

# Ensure database schema migrations
try:
    with engine.connect() as _conn:
        from sqlalchemy import text
        stmts = [
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS reference_file_url VARCHAR;",
            "ALTER TABLE proctor_events ADD COLUMN IF NOT EXISTS screenshot_url VARCHAR;",
            "ALTER TABLE proctor_events ADD COLUMN IF NOT EXISTS description VARCHAR;",
            "ALTER TABLE subjective_evaluations ADD COLUMN IF NOT EXISTS annotations TEXT;",
            "ALTER TABLE exams ADD COLUMN IF NOT EXISTS results_published BOOLEAN DEFAULT FALSE;"
        ]
        for stmt in stmts:
            _conn.execute(text(stmt))
        _conn.commit()
except Exception as _e:
    print(f"Schema migration note: {_e}")

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=r"http://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure static and uploads directories exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

# Mount static folder
app.mount("/static", StaticFiles(directory="static"), name="static")

# Include Routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(exams.router, prefix=settings.API_V1_STR)
app.include_router(proctor.router, prefix=settings.API_V1_STR)
app.include_router(grading.router, prefix=settings.API_V1_STR)

from app.services.scheduler import start_scheduler, shutdown_scheduler

@app.on_event("startup")
def startup_event():
    start_scheduler()

@app.on_event("shutdown")
def shutdown_event():
    shutdown_scheduler()


# Seed default users if table is empty
def seed_default_users():
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            print("Seeding default users...")
            
            # Default Admin
            admin = User(
                username="admin",
                hashed_password=get_password_hash("admin123"),
                role="admin"
            )
            
            # Default Student
            student = User(
                username="student",
                hashed_password=get_password_hash("student123"),
                role="student"
            )
            
            # Default Examiner
            examiner = User(
                username="examiner",
                hashed_password=get_password_hash("examiner123"),
                role="examiner"
            )
            
            db.add_all([admin, student, examiner])
            db.commit()
            print("Default users seeded: admin/admin123, student/student123, examiner/examiner123")
    except Exception as e:
        print(f"Error seeding default users: {e}")
    finally:
        db.close()

seed_default_users()

@app.get("/")
def read_root():
    return {"message": "Welcome to AI-Proctored Online Examination Platform API"}
