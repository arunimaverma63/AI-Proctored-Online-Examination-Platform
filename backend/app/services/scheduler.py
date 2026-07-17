import logging
import asyncio
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.executors.pool import ThreadPoolExecutor
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import ExamSession

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure scheduler
executors = {
    'default': ThreadPoolExecutor(5)
}
scheduler = BackgroundScheduler(executors=executors)

def start_scheduler():
    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler started successfully.")
        # Trigger session recovery
        recover_active_sessions()

def shutdown_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("APScheduler shut down successfully.")

def auto_submit_job(session_id: int):
    logger.info(f"Auto-submitting expired exam session {session_id}...")
    db: Session = SessionLocal()
    try:
        session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
        if session and session.status == "active":
            session.status = "timed_out"
            db.commit()
            
            # Lazy import to avoid circular dependency
            from app.routers.exams import run_ai_evaluations
            
            # Run AI evaluations for subjective answers
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(run_ai_evaluations(session_id, db))
                loop.close()
                logger.info(f"AI evaluation and auto-submission complete for session {session_id}.")
            except Exception as eval_err:
                logger.error(f"Error running AI evaluations during auto-submit: {eval_err}")
        else:
            logger.info(f"Session {session_id} not active or not found. Skipping auto-submit.")
    except Exception as e:
        logger.error(f"Error in auto_submit_job for session {session_id}: {e}")
    finally:
        db.close()

def schedule_auto_submit(session_id: int, run_time: datetime):
    # If a job already exists, remove it
    cancel_auto_submit(session_id)
    
    job_id = f"session_{session_id}"
    scheduler.add_job(
        auto_submit_job,
        'date',
        run_date=run_time,
        args=[session_id],
        id=job_id,
        replace_existing=True
    )
    logger.info(f"Scheduled auto-submit job {job_id} at {run_time}.")

def cancel_auto_submit(session_id: int):
    job_id = f"session_{session_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info(f"Cancelled auto-submit job {job_id}.")

def recover_active_sessions():
    logger.info("Recovering active sessions from database...")
    db: Session = SessionLocal()
    try:
        active_sessions = db.query(ExamSession).filter(ExamSession.status == "active").all()
        now = datetime.utcnow()
        for session in active_sessions:
            if session.end_time <= now:
                # If expired during downtime, auto-submit immediately
                auto_submit_job(session.id)
            else:
                # Otherwise, reschedule
                schedule_auto_submit(session.id, session.end_time)
    except Exception as e:
        logger.error(f"Error during active session recovery: {e}")
    finally:
        db.close()
