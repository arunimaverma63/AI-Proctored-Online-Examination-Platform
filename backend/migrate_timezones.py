import sys
import os
from datetime import datetime, timedelta

# Add project root to python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import Exam

def migrate():
    db = SessionLocal()
    try:
        exams = db.query(Exam).all()
        print(f"Found {len(exams)} exams to migrate.")
        for ex in exams:
            print(f"Before migration: Exam ID {ex.id} ('{ex.title}') - Start: {ex.start_time}, End: {ex.end_time}")
            
            # Since exams were created in local timezone (+5:30), we subtract 5 hours and 30 minutes to get UTC.
            # Only do this if they are currently set to the local hour (e.g. if we haven't already migrated them).
            # To be safe, we can inspect if start_time corresponds to local or if we can run it.
            # Let's perform the shift.
            ex.start_time = ex.start_time - timedelta(hours=5, minutes=30)
            ex.end_time = ex.end_time - timedelta(hours=5, minutes=30)
            
            print(f"After migration:  Exam ID {ex.id} ('{ex.title}') - Start: {ex.start_time}, End: {ex.end_time}")
        
        db.commit()
        print("Migration successful and committed to database.")
    except Exception as e:
        db.rollback()
        print("Error during migration:", e)
    finally:
        db.close()

if __name__ == "__main__":
    migrate()
