from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Header
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel
from typing import Optional, Dict
import json

from app.database import get_db, SessionLocal
from app.models import ExamSession, ProctorEvent, User
from app.schemas import ProctoringLogCreate, ProctoringLogResponse
from app.routers.auth import get_current_user
from app.services.cv_proctor import analyze_snapshot

router = APIRouter(prefix="/proctor", tags=["proctoring"])

# Global map of active websocket connections to enforce single active session
active_connections: Dict[int, WebSocket] = {}

class SnapshotPayload(BaseModel):
    image: str  # Base64 string of camera image

def verify_session_token(session: ExamSession, session_token: str):
    if session.session_token and session.session_token != session_token:
        raise HTTPException(
            status_code=403,
            detail="Invalid session token. Only one active session is allowed."
        )

@router.post("/log", response_model=ProctoringLogResponse)
def log_proctoring_event(
    session_id: int,
    payload: ProctoringLogCreate,
    x_session_token: str = Header(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    session = db.query(ExamSession).filter(ExamSession.id == session_id, ExamSession.student_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")
        
    verify_session_token(session, x_session_token)
        
    if session.status != "active":
        raise HTTPException(status_code=400, detail="Cannot log events for a completed session")
        
    # Incremental suspicion score logic
    penalty = 0.0
    if payload.event_type == "tab_switch":
        penalty = 10.0
    elif payload.event_type == "window_blur":
        penalty = 10.0
    elif payload.event_type == "cam_error":
        penalty = 5.0
        
    # Update session score
    session.proctoring_suspicion_score = min(session.proctoring_suspicion_score + penalty, 100.0)
    
    new_log = ProctorEvent(
        session_id=session_id,
        event_type=payload.event_type,
        timestamp=datetime.utcnow(),
        description=payload.description
    )
    db.add(new_log)
    db.commit()
    db.refresh(new_log)
    return new_log

@router.post("/snapshot/{session_id}")
def upload_webcam_snapshot(
    session_id: int,
    payload: SnapshotPayload,
    x_session_token: str = Header(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    session = db.query(ExamSession).filter(ExamSession.id == session_id, ExamSession.student_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")
        
    verify_session_token(session, x_session_token)
        
    if session.status != "active":
        raise HTTPException(status_code=400, detail="Exam session is not active")
        
    # Analyze frame with OpenCV
    analysis = analyze_snapshot(payload.image, session_id)
    
    # If violations are flagged, we log them in the DB and adjust the suspicion score
    if analysis["flagged"]:
        violations = analysis["violations"]
        penalty = 0.0
        
        for violation in violations:
            if violation == "face_missing":
                penalty += 15.0
            elif violation == "multiple_faces":
                penalty += 25.0
            elif violation == "gaze_away":
                penalty += 5.0
            elif violation == "cam_error":
                penalty += 5.0
                
        session.proctoring_suspicion_score = min(session.proctoring_suspicion_score + penalty, 100.0)
        
        # Save log entry
        new_log = ProctorEvent(
            session_id=session_id,
            event_type=", ".join(violations),
            timestamp=datetime.utcnow(),
            screenshot_url=f"/static/uploads/{analysis['saved_filename']}" if analysis["saved_filename"] else None,
            description=analysis["description"]
        )
        db.add(new_log)
        db.commit()
        db.refresh(new_log)
        
    return {
        "status": "flagged" if analysis["flagged"] else "ok",
        "violations": analysis["violations"] if analysis["flagged"] else [],
        "description": analysis["description"],
        "suspicion_score": session.proctoring_suspicion_score
    }

@router.websocket("/ws/{session_id}")
async def proctor_websocket(websocket: WebSocket, session_id: int):
    await websocket.accept()
    
    # Enforce single active session per student-exam pair: disconnect previous websocket if exists
    if session_id in active_connections:
        try:
            old_ws = active_connections[session_id]
            await old_ws.close(code=4000, reason="New session connection established.")
        except Exception:
            pass
            
    active_connections[session_id] = websocket
    db = SessionLocal()
    
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            violations = payload.get("violations", [])
            description = payload.get("description", "AI proctoring heartbeat")
            suspicion_score = payload.get("suspicion_score", None)
            session_token = payload.get("session_token", None)

            session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
            if session and session.status == "active":
                # Verify token inside WS payload to enforce single session
                if session.session_token and session.session_token != session_token:
                    await websocket.send_json({
                        "status": "rejected",
                        "detail": "Invalid session token. Connection rejected."
                    })
                    break
                
                if suspicion_score is not None:
                    session.proctoring_suspicion_score = min(float(suspicion_score), 100.0)
                else:
                    penalty = 0.0
                    for violation in violations:
                        if violation == "face_missing":
                            penalty += 15.0
                        elif violation == "multiple_faces":
                            penalty += 25.0
                        elif violation == "gaze_away":
                            penalty += 5.0
                    session.proctoring_suspicion_score = min(session.proctoring_suspicion_score + penalty, 100.0)

                if violations:
                    new_log = ProctorEvent(
                        session_id=session_id,
                        event_type=", ".join(violations),
                        timestamp=datetime.utcnow(),
                        description=description
                    )
                    db.add(new_log)
                db.commit()
                await websocket.send_json({
                    "status": "acknowledged",
                    "suspicion_score": session.proctoring_suspicion_score
                })
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Error in proctor websocket: {e}")
    finally:
        if active_connections.get(session_id) == websocket:
            active_connections.pop(session_id, None)
        db.close()
