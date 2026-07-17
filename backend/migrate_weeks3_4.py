import sys
import os
from sqlalchemy import text

# Add project root to python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import engine, Base, SessionLocal

def migrate():
    db = SessionLocal()
    connection = engine.connect()
    
    # 1. Add session_token to exam_sessions
    print("Checking exam_sessions table for session_token column...")
    is_sqlite = engine.url.drivername.startswith("sqlite")
    
    try:
        if is_sqlite:
            # For SQLite, check if column already exists
            info = connection.execute(text("PRAGMA table_info(exam_sessions);")).fetchall()
            columns = [col[1] for col in info]
            if "session_token" not in columns:
                print("Adding session_token column to exam_sessions (SQLite)...")
                connection.execute(text("ALTER TABLE exam_sessions ADD COLUMN session_token VARCHAR;"))
                print("Added successfully.")
            else:
                print("session_token column already exists in SQLite.")
        else:
            # For PostgreSQL
            print("Adding session_token column to exam_sessions if not exists (PostgreSQL)...")
            connection.execute(text("ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS session_token VARCHAR;"))
            print("Added successfully or already existed.")
            
        connection.commit()
    except Exception as e:
        print(f"Error checking/adding session_token: {e}")
        
    # 2. Rename proctoring_logs to proctor_events if it exists
    print("Checking if proctoring_logs needs to be renamed...")
    try:
        if is_sqlite:
            tables_info = connection.execute(text("SELECT name FROM sqlite_master WHERE type='table';")).fetchall()
            tables = [t[0] for t in tables_info]
            if "proctoring_logs" in tables and "proctor_events" not in tables:
                print("Renaming table proctoring_logs to proctor_events (SQLite)...")
                connection.execute(text("ALTER TABLE proctoring_logs RENAME TO proctor_events;"))
                print("Renamed successfully.")
            else:
                print("Table proctoring_logs does not exist or proctor_events already exists.")
        else:
            # PostgreSQL table rename if exists
            rename_sql = """
            DO $$
            BEGIN
                IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'proctoring_logs') AND 
                   NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'proctor_events') THEN
                    ALTER TABLE proctoring_logs RENAME TO proctor_events;
                END IF;
            END $$;
            """
            connection.execute(text(rename_sql))
            print("Renamed table or skipped (PostgreSQL).")
            
        connection.commit()
    except Exception as e:
        print(f"Error renaming proctoring_logs: {e}")
        
    # 3. Create any missing tables (like question_results)
    print("Creating all tables in database metadata (including question_results)...")
    try:
        Base.metadata.create_all(bind=engine)
        print("Tables created successfully.")
    except Exception as e:
        print(f"Error creating tables: {e}")
        
    connection.close()
    db.close()
    print("Migration check complete.")

if __name__ == "__main__":
    migrate()
