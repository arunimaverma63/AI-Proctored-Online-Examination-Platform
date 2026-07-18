from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks, Header
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
import json
import random
import os
import uuid
import base64
from typing import List, Dict, Any
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Subject, Question, Exam, ExamSession, SubjectiveEvaluation, ProctorEvent, QuestionResult
from app.schemas import (
    SubjectCreate, SubjectResponse, QuestionCreate, QuestionAdminResponse,
    ExamCreate, ExamResponse, ExamSessionResponse, ExamSessionSaveAnswers,
    StudentExamSessionSummary
)
from app.routers.auth import get_current_user, verify_role
from app.services.ai_evaluation import evaluate_subjective_answer
from app.config import settings

router = APIRouter(tags=["exams"])

def verify_session(session_id: int, session_token: str, current_user: User, db: Session) -> ExamSession:
    session = db.query(ExamSession).filter(ExamSession.id == session_id, ExamSession.student_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")
    if session.session_token and session.session_token != session_token:
        raise HTTPException(status_code=403, detail="Invalid session token. Only one active session is allowed.")
    return session

# ----------------- Subject Routes -----------------
@router.get("/subjects", response_model=List[SubjectResponse])
def get_subjects(db: Session = Depends(get_db)):
    return db.query(Subject).all()

@router.post("/subjects", response_model=SubjectResponse, dependencies=[Depends(verify_role(["admin", "examiner"]))])
def create_subject(subject: SubjectCreate, db: Session = Depends(get_db)):
    db_subject = db.query(Subject).filter(Subject.name.ilike(subject.name)).first()
    if db_subject:
        raise HTTPException(status_code=400, detail="Subject already exists")
    new_sub = Subject(name=subject.name)
    db.add(new_sub)
    db.commit()
    db.refresh(new_sub)
    return new_sub

@router.delete("/subjects/{id}", dependencies=[Depends(verify_role(["admin", "examiner"]))])
def delete_subject(id: int, db: Session = Depends(get_db)):
    sub = db.query(Subject).filter(Subject.id == id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subject not found")
    db.delete(sub)
    db.commit()
    return {"message": "Subject deleted successfully"}

# ----------------- Question Routes -----------------
@router.get("/questions", response_model=List[QuestionAdminResponse], dependencies=[Depends(verify_role(["admin", "examiner"]))])
def get_questions(db: Session = Depends(get_db)):
    return db.query(Question).all()

@router.post("/questions", response_model=QuestionAdminResponse, dependencies=[Depends(verify_role(["admin", "examiner"]))])
def create_question(question: QuestionCreate, db: Session = Depends(get_db)):
    # Validate subject
    sub = db.query(Subject).filter(Subject.id == question.subject_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subject not found")
    
    # Normalize question type from verbose enums (e.g. MCQ, multi_select, short_answer, long_answer, image_upload)
    type_map = {
        "MCQ": "mcq",
        "multi_select": "multiselect",
        "short_answer": "short",
        "long_answer": "long",
        "image_upload": "image"
    }
    norm_type = type_map.get(question.type, question.type)
    if norm_type == "mcq":
        norm_type = "mcq"
    elif norm_type in ["multiselect", "multi_select"]:
        norm_type = "multiselect"
    elif norm_type in ["short", "short_answer"]:
        norm_type = "short"
    elif norm_type in ["long", "long_answer"]:
        norm_type = "long"
    elif norm_type in ["image", "image_upload"]:
        norm_type = "image"
    
    new_q = Question(
        subject_id=question.subject_id,
        type=norm_type,
        text=question.text,
        options=question.options,
        correct_answer=question.correct_answer,
        points=question.points,
        model_answer=question.model_answer
    )
    db.add(new_q)
    db.commit()
    db.refresh(new_q)
    return new_q

@router.delete("/questions/{id}", dependencies=[Depends(verify_role(["admin", "examiner"]))])
def delete_question(id: int, db: Session = Depends(get_db)):
    q = db.query(Question).filter(Question.id == id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    db.delete(q)
    db.commit()
    return {"message": "Question deleted successfully"}

# ----------------- Exam Config Routes -----------------
@router.get("/exams", response_model=List[ExamResponse])
def get_exams(db: Session = Depends(get_db)):
    return db.query(Exam).all()

@router.post("/exams", response_model=ExamResponse, dependencies=[Depends(verify_role(["admin", "examiner"]))])
def create_exam(exam: ExamCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Check subject exists
    sub = db.query(Subject).filter(Subject.id == exam.subject_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subject not found")
    
    # Check if subject has enough questions
    q_count = db.query(Question).filter(Question.subject_id == exam.subject_id).count()
    if q_count < exam.total_questions:
        raise HTTPException(
            status_code=400, 
            detail=f"Subject only has {q_count} questions, but exam requires {exam.total_questions}"
        )
    
    new_exam = Exam(
        title=exam.title,
        subject_id=exam.subject_id,
        duration_minutes=exam.duration_minutes,
        total_questions=exam.total_questions,
        negative_marking_val=exam.negative_marking_val,
        randomize_questions=exam.randomize_questions,
        randomize_options=exam.randomize_options,
        start_time=exam.start_time,
        end_time=exam.end_time,
        created_by=current_user.id
    )
    db.add(new_exam)
    db.commit()
    db.refresh(new_exam)
    return new_exam

@router.delete("/exams/{id}", dependencies=[Depends(verify_role(["admin", "examiner"]))])
def delete_exam(id: int, db: Session = Depends(get_db)):
    ex = db.query(Exam).filter(Exam.id == id).first()
    if not ex:
        raise HTTPException(status_code=404, detail="Exam not found")
    db.delete(ex)
    db.commit()
    return {"message": "Exam deleted successfully"}

# ----------------- Student Exam Taking Routes -----------------
@router.get("/student/exams", response_model=List[StudentExamSessionSummary])
def get_student_exams_summary(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can access this endpoint")
        
    exams = db.query(Exam).all()
    summaries = []
    
    for exam in exams:
        # Check if student already has a session
        session = db.query(ExamSession).filter(
            ExamSession.exam_id == exam.id,
            ExamSession.student_id == current_user.id
        ).first()
        
        status_val = "scheduled"
        now = datetime.utcnow()
        if now < exam.start_time:
            status_val = "scheduled"
        elif now > exam.end_time:
            status_val = "expired"
        else:
            status_val = "available"
            
        if session:
            # If session is active but expired, update its status to timed_out
            if session.status == "active" and (now > session.end_time or now > exam.end_time):
                session.status = "timed_out"
                db.commit()
                db.refresh(session)
                background_tasks.add_task(run_ai_evaluations, session.id, db)
            status_val = session.status
            
        summaries.append({
            "exam_id": exam.id,
            "session_id": session.id if session else -1,
            "exam_title": exam.title,
            "subject_name": exam.subject.name,
            "start_time": exam.start_time,
            "status": status_val,
            "final_score": session.final_score if session else None,
            "proctoring_suspicion_score": session.proctoring_suspicion_score if session else 0.0,
            "duration_minutes": exam.duration_minutes
        })
        
    return summaries

@router.post("/student/exams/{id}/start")
def start_exam_session(
    id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can take exams")
        
    exam = db.query(Exam).filter(Exam.id == id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    now = datetime.utcnow()
    # Allow exam starting if within scheduled window
    if now < exam.start_time or now > exam.end_time:
        raise HTTPException(status_code=400, detail="Exam is outside scheduled window")
        
    # Check if student already has session
    session = db.query(ExamSession).filter(
        ExamSession.exam_id == exam.id,
        ExamSession.student_id == current_user.id
    ).first()
    
    if session:
        # Check if the active session is already expired
        if session.status == "active" and (now > session.end_time or now > exam.end_time):
            session.status = "timed_out"
            db.commit()
            db.refresh(session)
            background_tasks.add_task(run_ai_evaluations, session.id, db)
            
        if session.status != "active":
            raise HTTPException(status_code=400, detail=f"Exam session already completed with status: {session.status}")
        # Make sure session_token exists on resume
        if not session.session_token:
            session.session_token = str(uuid.uuid4())
            db.commit()
            db.refresh(session)
    else:
        # Create new active exam session
        end_time = now + timedelta(minutes=exam.duration_minutes)
        # Cap end time to exam schedule window end time if required
        if end_time > exam.end_time:
            end_time = exam.end_time
            
        session = ExamSession(
            exam_id=exam.id,
            student_id=current_user.id,
            session_token=str(uuid.uuid4()),
            start_time=now,
            end_time=end_time,
            status="active",
            answers="{}",
            proctoring_suspicion_score=0.0
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        
    # Schedule the auto-submit job via APScheduler
    from app.services.scheduler import schedule_auto_submit
    schedule_auto_submit(session.id, session.end_time)
        
    # Generate/Fetch questions
    questions = db.query(Question).filter(Question.subject_id == exam.subject_id).all()
    
    # Select randomized questions
    random.seed(session.id)
    selected_qs = random.sample(questions, exam.total_questions) if len(questions) >= exam.total_questions else questions
    
    if exam.randomize_questions:
        random.shuffle(selected_qs)
        
    # Format questions response, stripping correct_answers & model_answers
    formatted_questions = []
    for q in selected_qs:
        opts = []
        if q.options:
            try:
                opts = json.loads(q.options)
                if exam.randomize_options and q.type in ["mcq", "multiselect"]:
                    random.shuffle(opts)
            except Exception:
                opts = []
                
        formatted_questions.append({
            "id": q.id,
            "type": q.type,
            "text": q.text,
            "options": opts,
            "points": q.points
        })
        
    return {
        "session_id": session.id,
        "session_token": session.session_token,
        "duration_minutes": exam.duration_minutes,
        "end_time": session.end_time.replace(tzinfo=timezone.utc),
        "questions": formatted_questions,
        "answers": json.loads(session.answers or "{}")
    }


class AnswerSubmitPayload(BaseModel):
    question_id: int
    answer: Any

@router.post("/student/session/{session_id}/save")
def save_exam_answers(
    session_id: int, 
    payload: ExamSessionSaveAnswers, 
    background_tasks: BackgroundTasks,
    x_session_token: str = Header(None),
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    session = verify_session(session_id, x_session_token, current_user, db)
    if session.status != "active":
        raise HTTPException(status_code=400, detail="Cannot edit a submitted/timed-out session")
        
    now = datetime.utcnow()
    if now > session.end_time:
        session.status = "timed_out"
        db.commit()
        background_tasks.add_task(run_ai_evaluations, session_id, db)
        raise HTTPException(status_code=408, detail="Exam time has expired. Your answers were auto-submitted.")
        
    session.answers = json.dumps(payload.answers)
    db.commit()
    return {"message": "Answers saved successfully"}

@router.post("/student/session/{session_id}/submit-answer")
def submit_single_answer(
    session_id: int,
    payload: AnswerSubmitPayload,
    background_tasks: BackgroundTasks,
    x_session_token: str = Header(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    session = verify_session(session_id, x_session_token, current_user, db)
    if session.status != "active":
        raise HTTPException(status_code=400, detail="Cannot save answers for an inactive session")
        
    now = datetime.utcnow()
    if now > session.end_time:
        session.status = "timed_out"
        db.commit()
        background_tasks.add_task(run_ai_evaluations, session_id, db)
        raise HTTPException(status_code=408, detail="Exam time has expired. Your answers were auto-submitted.")
        
    # Find the question to make sure it's valid
    q = db.query(Question).filter(Question.id == payload.question_id, Question.subject_id == session.exam.subject_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found in this exam")
        
    # Word count validation for text answers
    word_count = 0
    if q.type in ["short", "long"]:
        ans_text = str(payload.answer or "").strip()
        word_count = len(ans_text.split())
        if q.type == "short" and word_count > 150:
            raise HTTPException(status_code=400, detail=f"Short answer exceeds 150 words limit. Current: {word_count}")
        if q.type == "long" and word_count > 1000:
            raise HTTPException(status_code=400, detail=f"Long answer exceeds 1000 words limit. Current: {word_count}")
            
    # Load existing answers
    answers = json.loads(session.answers or "{}")
    answers[str(payload.question_id)] = payload.answer
    session.answers = json.dumps(answers)
    db.commit()
    
    return {
        "status": "saved",
        "question_id": payload.question_id,
        "word_count": word_count
    }

@router.post("/student/session/{session_id}/upload-handwritten")
async def upload_handwritten_image(
    session_id: int,
    question_id: int,
    file: UploadFile = File(...),
    x_session_token: str = Header(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    session = verify_session(session_id, x_session_token, current_user, db)
    if session.status != "active":
        raise HTTPException(status_code=400, detail="Session is not active")
        
    now = datetime.utcnow()
    if now > session.end_time:
        raise HTTPException(status_code=408, detail="Exam time has expired. Cannot upload images.")
        
    ext = os.path.splitext(file.filename)[1]
    if ext.lower() not in [".jpg", ".jpeg", ".png"]:
        raise HTTPException(status_code=400, detail="Only JPG, JPEG or PNG images are allowed")
        
    filename = f"handwritten_{session_id}_{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)
    
    with open(filepath, "wb") as buffer:
        buffer.write(await file.read())
        
    # Generate thumbnail 150x150
    from PIL import Image
    thumb_filename = f"handwritten_{session_id}_{uuid.uuid4().hex}_thumb{ext}"
    thumb_filepath = os.path.join(settings.UPLOAD_DIR, thumb_filename)
    
    try:
        with Image.open(filepath) as img:
            img.thumbnail((150, 150))
            img.save(thumb_filepath)
        thumb_url = f"/static/uploads/{thumb_filename}"
    except Exception as img_err:
        print(f"Failed to generate thumbnail: {img_err}")
        thumb_url = f"/static/uploads/{filename}" # Fallback
        
    file_url = f"/static/uploads/{filename}"
    
    # Immediately store original path in answers dict
    answers = json.loads(session.answers or "{}")
    answers[str(question_id)] = file_url
    session.answers = json.dumps(answers)
    db.commit()
    
    return {"image_url": file_url, "thumbnail_url": thumb_url}


# Background Grading Task
async def run_ai_evaluations(session_id: int, db_session: Session):
    session = db_session.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        return
        
    student_answers = json.loads(session.answers or "{}")
    exam = session.exam
    
    # Get all questions
    questions = db_session.query(Question).filter(Question.subject_id == exam.subject_id).all()
    q_dict = {str(q.id): q for q in questions}
    
    # Process subjective evaluations
    for q_id_str, student_ans in student_answers.items():
        q = q_dict.get(q_id_str)
        if not q or q.type not in ["short", "long", "image"]:
            continue
            
        # Check if evaluation already exists
        eval_record = db_session.query(SubjectiveEvaluation).filter(
            SubjectiveEvaluation.session_id == session_id,
            SubjectiveEvaluation.question_id == q.id
        ).first()
        
        if not eval_record:
            eval_record = SubjectiveEvaluation(
                session_id=session_id,
                question_id=q.id,
                is_graded=False
            )
            db_session.add(eval_record)
            db_session.commit()
            db_session.refresh(eval_record)
            
        # Subjective grading logic
        handwritten_b64 = None
        student_text_ans = student_ans
        
        if q.type == "image":
            # Answer is a static file path, load it and encode as base64
            # e.g., student_ans = "/static/uploads/handwritten_xxx.jpg"
            img_path = student_ans.replace("/static/uploads/", "")
            filepath = os.path.join(settings.UPLOAD_DIR, img_path)
            
            if os.path.exists(filepath):
                eval_record.handwritten_image_url = student_ans
                with open(filepath, "rb") as image_file:
                    handwritten_b64 = base64.b64encode(image_file.read()).decode("utf-8")
                student_text_ans = None
            else:
                student_text_ans = "[Handwritten image missing on server]"
                
        # Call AI Evaluation service
        try:
            score, justification, extracted_text = await evaluate_subjective_answer(
                question_text=q.text,
                model_answer=q.model_answer or "",
                student_answer=student_text_ans,
                points=q.points,
                handwritten_image_b64=handwritten_b64
            )
            
            if extracted_text:
                eval_record.student_answer = extracted_text
            else:
                eval_record.student_answer = student_text_ans
                
            eval_record.ai_score = score
            eval_record.ai_justification = justification
            
            # Pre-fill examiner score with AI score
            eval_record.examiner_score = score
            eval_record.examiner_feedback = "AI Pre-graded: " + justification[:100] + "..."
            
        except Exception as e:
            eval_record.ai_score = 0.0
            eval_record.ai_justification = f"Error in AI Evaluation: {str(e)}"
            eval_record.examiner_score = 0.0
            eval_record.student_answer = student_text_ans
            
        db_session.commit()
        
    # After AI evaluations complete, we update the session's overall score
    recalculate_session_score(session_id, db_session)

def recalculate_session_score(session_id: int, db: Session):
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        return
        
    answers = json.loads(session.answers or "{}")
    exam = session.exam
    
    # Fetch questions
    questions = db.query(Question).filter(Question.subject_id == exam.subject_id).all()
    
    score = 0.0
    
    for q in questions:
        ans = answers.get(str(q.id))
        is_correct = False
        q_score = 0.0
        
        if q.type == "mcq":
            if ans and str(ans).strip().lower() == str(q.correct_answer).strip().lower():
                q_score = q.points
                is_correct = True
            elif ans:  # Wrong answer penalty
                q_score = -exam.negative_marking_val
        elif q.type == "multiselect":
            try:
                correct_list = json.loads(q.correct_answer)
                ans_list = list(ans) if ans else []
                if ans_list and set(correct_list) == set(ans_list):
                    q_score = q.points
                    is_correct = True
                elif ans_list:
                    q_score = -exam.negative_marking_val
            except Exception:
                pass
        elif q.type in ["short", "long", "image"]:
            # Get examiner grade or AI grade
            sub_eval = db.query(SubjectiveEvaluation).filter(
                SubjectiveEvaluation.session_id == session_id,
                SubjectiveEvaluation.question_id == q.id
            ).first()
            if sub_eval:
                q_score = sub_eval.examiner_score if sub_eval.examiner_score is not None else (sub_eval.ai_score or 0.0)
                is_correct = (q_score >= q.points * 0.5)
                
        score += q_score
        
        # Save to QuestionResult
        q_res = db.query(QuestionResult).filter(
            QuestionResult.session_id == session_id,
            QuestionResult.question_id == q.id
        ).first()
        if not q_res:
            q_res = QuestionResult(session_id=session_id, question_id=q.id)
            db.add(q_res)
            
        if ans is not None:
            if isinstance(ans, (list, dict)):
                q_res.student_answer = json.dumps(ans)
            else:
                q_res.student_answer = str(ans)
        else:
            q_res.student_answer = None
            
        q_res.score = q_score
        q_res.is_correct = is_correct
        
    session.final_score = max(score, 0.0)  # Total score cannot be negative
    db.commit()

@router.post("/student/session/{session_id}/submit")
def submit_exam_session(
    session_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    session = db.query(ExamSession).filter(ExamSession.id == session_id, ExamSession.student_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")
        
    if session.status != "active":
        # Check if already submitted
        return {"message": "Exam session was already submitted", "session_id": session_id}
        
    # Cancel the auto-submit scheduler job
    from app.services.scheduler import cancel_auto_submit
    cancel_auto_submit(session_id)
        
    # Check timeout auto-submit
    now = datetime.utcnow()
    if now > session.end_time:
        session.status = "timed_out"
    else:
        session.status = "submitted"
        
    db.commit()
    
    # Calculate MCQ/Multi-select scores and queue AI evaluation
    background_tasks.add_task(run_ai_evaluations, session_id, db)
    
    return {"message": "Exam submitted successfully", "session_id": session_id}


@router.get("/admin/dashboard-stats", dependencies=[Depends(verify_role(["admin", "examiner"]))])
def get_admin_dashboard_stats(db: Session = Depends(get_db)):
    # 1. Active sessions count
    active_sessions = db.query(ExamSession).filter(ExamSession.status == "active").count()
    
    # 2. Total exams today
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    exams_today = db.query(Exam).filter(Exam.start_time >= today_start, Exam.start_time < today_end).count()
    completed_exams_today = db.query(ExamSession).filter(
        ExamSession.status.in_(["submitted", "timed_out"]),
        ExamSession.end_time >= today_start,
        ExamSession.end_time < today_end
    ).count()
    
    # 3. Flagged sessions count (suspicion >= 40)
    flagged_sessions = db.query(ExamSession).filter(ExamSession.status == "active", ExamSession.proctoring_suspicion_score >= 40.0).count()
    
    # 4. Grading queue count (subjective evaluations that are not graded)
    grading_queue = db.query(SubjectiveEvaluation).filter(SubjectiveEvaluation.is_graded == False).count()
    ai_prescored = db.query(SubjectiveEvaluation).filter(
        SubjectiveEvaluation.is_graded == False,
        SubjectiveEvaluation.ai_score != None
    ).count()
    
    # 5. Average score percentage
    avg_score = 0.0
    sessions_with_scores = db.query(ExamSession).filter(ExamSession.final_score != None).all()
    if sessions_with_scores:
        total_pct = 0.0
        for s in sessions_with_scores:
            total_points = db.query(func.sum(Question.points)).filter(Question.subject_id == s.exam.subject_id).scalar()
            if not total_points:
                total_points = float(s.exam.total_questions) if s.exam.total_questions > 0 else 1.0
            total_pct += (s.final_score / total_points) * 100
        avg_score = total_pct / len(sessions_with_scores)
        
    # 6. Live sessions data (recent active sessions)
    active_s_list = db.query(ExamSession).filter(ExamSession.status == "active").order_by(ExamSession.start_time.desc()).limit(5).all()
    live_sessions_data = []
    for s in active_s_list:
        # Time remaining
        remaining = 0
        now = datetime.utcnow()
        if s.end_time > now:
            remaining = int((s.end_time - now).total_seconds())
        
        # Calculate answered questions count vs total questions
        answered_count = 0
        if s.answers:
            try:
                ans_dict = json.loads(s.answers)
                answered_count = len(ans_dict)
            except Exception:
                pass
                
        q_count = db.query(Question).filter(Question.subject_id == s.exam.subject_id).count()
        
        live_sessions_data.append({
            "id": s.id,
            "student_username": s.student.username,
            "subject_name": s.exam.subject.name,
            "exam_title": s.exam.title,
            "suspicion_score": s.proctoring_suspicion_score,
            "time_remaining_seconds": remaining,
            "questions_answered": answered_count,
            "total_questions": q_count if q_count > 0 else s.exam.total_questions
        })
        
    # 7. Recent proctoring alerts
    recent_logs = db.query(ProctorEvent).order_by(ProctorEvent.timestamp.desc()).limit(6).all()
    alerts_data = []
    for log in recent_logs:
        alerts_data.append({
            "id": log.id,
            "event_type": log.event_type,
            "student_username": log.session.student.username,
            "exam_title": log.session.exam.title,
            "time_ago_seconds": int((datetime.utcnow() - log.timestamp).total_seconds()),
            "description": log.description,
            "suspicion_score": log.session.proctoring_suspicion_score
        })
        
    # 8. AI grading items
    pending_evals = db.query(SubjectiveEvaluation).filter(SubjectiveEvaluation.is_graded == False).order_by(SubjectiveEvaluation.id.desc()).limit(6).all()
    grading_items = []
    for ev in pending_evals:
        grading_items.append({
            "evaluation_id": ev.id,
            "session_id": ev.session_id,
            "question_type": ev.question.type,
            "question_text": ev.question.text,
            "student_username": ev.session.student.username,
            "ai_score": ev.ai_score,
            "total_points": ev.question.points
        })
        
    # 9. Upcoming exams
    upcoming_ex = db.query(Exam).filter(Exam.start_time > datetime.utcnow()).order_by(Exam.start_time.asc()).limit(5).all()
    upcoming_exams_data = []
    for ex in upcoming_ex:
        upcoming_exams_data.append({
            "id": ex.id,
            "title": ex.title,
            "start_time": ex.start_time.replace(tzinfo=timezone.utc).isoformat(),
            "subject_name": ex.subject.name
        })
 
    # 10. Recent activity feed
    # Compile a simple feed of events
    activity_feed = []
    # Recently submitted sessions
    recent_subs = db.query(ExamSession).filter(ExamSession.status.in_(["submitted", "timed_out"])).order_by(ExamSession.end_time.desc()).limit(3).all()
    for rs in recent_subs:
        activity_feed.append({
            "type": "submission",
            "message": f"{rs.student.username} submitted {rs.exam.title}",
            "time_ago_seconds": int((datetime.utcnow() - rs.end_time).total_seconds())
        })
    # Recently created exams
    recent_exams = db.query(Exam).order_by(Exam.id.desc()).limit(2).all()
    for re in recent_exams:
        activity_feed.append({
            "type": "exam_created",
            "message": f"New exam scheduled: {re.title}",
            "time_ago_seconds": 60  # Mock recent
        })
        
    # Sort activity feed by time_ago
    activity_feed = sorted(activity_feed, key=lambda x: x["time_ago_seconds"])[:5]

    # 11. Calculate Proctoring Signal Breakdown
    total_sessions = db.query(ExamSession).count()
    if total_sessions > 0:
        face_missing_count = db.query(ExamSession).filter(
            ExamSession.proctor_logs.any(ProctorEvent.event_type.like("%face_missing%"))
        ).count()
        face_present_pct = round(((total_sessions - face_missing_count) / total_sessions) * 100)

        gaze_away_count = db.query(ExamSession).filter(
            ExamSession.proctor_logs.any(ProctorEvent.event_type.like("%gaze_away%"))
        ).count()
        gaze_on_screen_pct = round(((total_sessions - gaze_away_count) / total_sessions) * 100)

        tab_switch_count = db.query(ExamSession).filter(
            ExamSession.proctor_logs.any(
                (ProctorEvent.event_type.like("%tab_switch%")) | (ProctorEvent.event_type.like("%window_blur%"))
            )
        ).count()
        no_tab_switches_pct = round(((total_sessions - tab_switch_count) / total_sessions) * 100)

        multiple_faces_count = db.query(ExamSession).filter(
            ExamSession.proctor_logs.any(ProctorEvent.event_type.like("%multiple_faces%"))
        ).count()
        single_face_pct = round(((total_sessions - multiple_faces_count) / total_sessions) * 100)

        high_susp_count = db.query(ExamSession).filter(
            ExamSession.proctoring_suspicion_score > 60.0
        ).count()
        high_suspicion_pct = round((high_susp_count / total_sessions) * 100)
    else:
        face_present_pct = 100
        gaze_on_screen_pct = 100
        no_tab_switches_pct = 100
        single_face_pct = 100
        high_suspicion_pct = 0

    # 12. Calculate Score Distribution Bands (0-20, 21-40, 41-60, 61-80, 81-100)
    completed_sessions = db.query(ExamSession).filter(
        ExamSession.status.in_(["submitted", "timed_out"]),
        ExamSession.final_score != None
    ).all()
    
    distribution = [0, 0, 0, 0, 0]
    for s in completed_sessions:
        total_points = db.query(func.sum(Question.points)).filter(Question.subject_id == s.exam.subject_id).scalar()
        if not total_points:
            total_points = float(s.exam.total_questions) if s.exam.total_questions > 0 else 1.0
        
        pct = (s.final_score / total_points) * 100
        pct = max(0.0, min(100.0, pct))
        
        if pct <= 20.0:
            distribution[0] += 1
        elif pct <= 40.0:
            distribution[1] += 1
        elif pct <= 60.0:
            distribution[2] += 1
        elif pct <= 80.0:
            distribution[3] += 1
        else:
            distribution[4] += 1

    return {
        "active_sessions": active_sessions,
        "exams_today": exams_today,
        "completed_exams_today": completed_exams_today,
        "flagged_sessions": flagged_sessions,
        "grading_queue": grading_queue,
        "ai_prescored": ai_prescored,
        "avg_score": round(avg_score, 1),
        "live_sessions": live_sessions_data,
        "alerts": alerts_data,
        "grading_items": grading_items,
        "upcoming_exams": upcoming_exams_data,
        "recent_activity": activity_feed,
        "proctoring_signals": {
            "face_present": face_present_pct,
            "gaze_on_screen": gaze_on_screen_pct,
            "no_tab_switches": no_tab_switches_pct,
            "single_face": single_face_pct,
            "high_suspicion": high_suspicion_pct
        },
        "score_distribution": distribution
    }

