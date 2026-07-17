from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from datetime import timezone
import json


from app.database import get_db
from app.models import ExamSession, SubjectiveEvaluation, Question, User, ProctorEvent
from app.schemas import ExaminerGradeSubmit, SubjectiveEvaluationResponse
from app.routers.auth import get_current_user, verify_role
from app.routers.exams import recalculate_session_score

router = APIRouter(tags=["grading & results"])

# ----------------- Examiner Grading Routes -----------------

@router.get("/grading/submissions", dependencies=[Depends(verify_role(["examiner", "admin"]))])
def get_submissions(db: Session = Depends(get_db)):
    """List all exam sessions that have been submitted or timed out."""
    sessions = db.query(ExamSession).filter(ExamSession.status.in_(["submitted", "timed_out"])).all()
    results = []
    for s in sessions:
        results.append({
            "session_id": s.id,
            "student_username": s.student.username,
            "exam_title": s.exam.title,
            "subject_name": s.exam.subject.name,
            "start_time": s.start_time.replace(tzinfo=timezone.utc),
            "status": s.status,
            "final_score": s.final_score,
            "proctoring_suspicion_score": s.proctoring_suspicion_score,
            "total_points": sum(q.points for q in db.query(Question).filter(Question.subject_id == s.exam.subject_id).all())
        })
    return results

@router.get("/grading/submission/{session_id}", dependencies=[Depends(verify_role(["examiner", "admin"]))])
def get_submission_details(session_id: int, db: Session = Depends(get_db)):
    """Get full details of a specific exam session, including subjective evaluation queue and proctoring timeline."""
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")
        
    exam = session.exam
    # Fetch questions
    questions = db.query(Question).filter(Question.subject_id == exam.subject_id).all()
    
    # Map questions for fast lookup
    q_map = {q.id: q for q in questions}
    
    # Answers submitted
    answers = {}
    if session.answers:
        try:
            answers = json_loader(session.answers)
        except Exception:
            answers = {}
            
    # Subjective evaluations
    evaluations = db.query(SubjectiveEvaluation).filter(SubjectiveEvaluation.session_id == session_id).all()
    evals_map = {e.question_id: e for e in evaluations}
    
    formatted_questions = []
    for q in questions:
        q_ans = answers.get(str(q.id))
        
        eval_data = None
        if q.id in evals_map:
            ev = evals_map[q.id]
            eval_data = {
                "evaluation_id": ev.id,
                "student_answer": ev.student_answer,
                "handwritten_image_url": ev.handwritten_image_url,
                "ai_score": ev.ai_score,
                "ai_justification": ev.ai_justification,
                "examiner_score": ev.examiner_score,
                "examiner_feedback": ev.examiner_feedback,
                "is_graded": ev.is_graded,
                "annotations": ev.annotations
            }
            
        formatted_questions.append({
            "id": q.id,
            "type": q.type,
            "text": q.text,
            "options": q.options,
            "correct_answer": q.correct_answer,
            "points": q.points,
            "model_answer": q.model_answer,
            "student_answer": q_ans,
            "evaluation": eval_data
        })
        
    # Proctoring logs (Timeline)
    proctor_logs = db.query(ProctorEvent).filter(ProctorEvent.session_id == session_id).order_by(ProctorEvent.timestamp.asc()).all()
    formatted_logs = []
    for log in proctor_logs:
        formatted_logs.append({
            "id": log.id,
            "event_type": log.event_type,
            "timestamp": log.timestamp.replace(tzinfo=timezone.utc) if log.timestamp else None,
            "screenshot_url": log.screenshot_url,
            "description": log.description
        })
        
    return {
        "session_id": session.id,
        "student_username": session.student.username,
        "exam_title": exam.title,
        "duration_minutes": exam.duration_minutes,
        "negative_marking_val": exam.negative_marking_val,
        "start_time": session.start_time.replace(tzinfo=timezone.utc),
        "end_time": session.end_time.replace(tzinfo=timezone.utc),
        "status": session.status,
        "final_score": session.final_score,
        "proctoring_suspicion_score": session.proctoring_suspicion_score,
        "questions": formatted_questions,
        "proctor_timeline": formatted_logs
    }

@router.post("/grading/evaluate", dependencies=[Depends(verify_role(["examiner", "admin"]))])
def submit_evaluation(payload: ExaminerGradeSubmit, db: Session = Depends(get_db)):
    """Examiner overrides score and provides feedback for a subjective question."""
    sub_eval = db.query(SubjectiveEvaluation).filter(SubjectiveEvaluation.id == payload.evaluation_id).first()
    if not sub_eval:
        raise HTTPException(status_code=404, detail="Subjective evaluation record not found")
        
    # Validate points
    q = db.query(Question).filter(Question.id == sub_eval.question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
        
    if payload.examiner_score < 0 or payload.examiner_score > q.points:
        raise HTTPException(status_code=400, detail=f"Score must be between 0 and {q.points}")
        
    sub_eval.examiner_score = payload.examiner_score
    sub_eval.examiner_feedback = payload.examiner_feedback
    sub_eval.is_graded = True
    if payload.annotations is not None:
        sub_eval.annotations = payload.annotations
    
    db.commit()
    
    # Recalculate session overall final score
    recalculate_session_score(sub_eval.session_id, db)
    
    return {"message": "Grade submitted successfully", "new_score": payload.examiner_score}

# ----------------- Student Results Route -----------------
@router.get("/results/session/{session_id}")
def get_student_result_details(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retrieve detailed exam results breakdown for a student."""
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")
        
    # Security check: student can only access their own results
    if current_user.role == "student" and session.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view another student's exam results")
        
    exam = session.exam
    questions = db.query(Question).filter(Question.subject_id == exam.subject_id).all()
    
    # Answers submitted
    answers = {}
    if session.answers:
        try:
            answers = json_loader(session.answers)
        except Exception:
            answers = {}
            
    # Subjective evaluations
    evaluations = db.query(SubjectiveEvaluation).filter(SubjectiveEvaluation.session_id == session_id).all()
    evals_map = {e.question_id: e for e in evaluations}
    
    formatted_questions = []
    for q in questions:
        q_ans = answers.get(str(q.id))
        
        eval_data = None
        if q.id in evals_map:
            ev = evals_map[q.id]
            eval_data = {
                "student_answer": ev.student_answer,
                "handwritten_image_url": ev.handwritten_image_url,
                "ai_score": ev.ai_score,
                "ai_justification": ev.ai_justification,
                "examiner_score": ev.examiner_score,
                "examiner_feedback": ev.examiner_feedback,
                "is_graded": ev.is_graded,
                "annotations": ev.annotations
            }
            
        # For security and integrity: only return correct_answer if the student is viewing their results
        formatted_questions.append({
            "id": q.id,
            "type": q.type,
            "text": q.text,
            "options": q.options,
            "correct_answer": q.correct_answer,  # Visible now that exam is over
            "points": q.points,
            "model_answer": q.model_answer,      # Model answer is visible for learning
            "student_answer": q_ans,
            "evaluation": eval_data
        })
        
    # Calculate cohort metrics
    cohort_sessions = db.query(ExamSession).filter(
        ExamSession.exam_id == exam.id,
        ExamSession.status.in_(["submitted", "timed_out"])
    ).all()
    cohort_scores = [s.final_score for s in cohort_sessions if s.final_score is not None]
    current_score = session.final_score if session.final_score is not None else 0.0
    
    percentile = 100.0
    cohort_average = current_score
    cohort_highest = current_score
    if cohort_scores:
        cohort_average = sum(cohort_scores) / len(cohort_scores)
        cohort_highest = max(cohort_scores)
        
        # Calculate percentile relative to other students
        other_scores = cohort_scores.copy()
        if current_score in other_scores:
            other_scores.remove(current_score)
            
        if other_scores:
            less_than = sum(1 for score in other_scores if score < current_score)
            percentile = (less_than / len(other_scores)) * 100.0
        else:
            # Only one student in the cohort, or no other scores
            percentile = 100.0
    else:
        cohort_scores = [current_score]
        
    return {
        "session_id": session.id,
        "student_username": session.student.username,
        "exam_title": exam.title,
        "duration_minutes": exam.duration_minutes,
        "negative_marking_val": exam.negative_marking_val,
        "start_time": session.start_time.replace(tzinfo=timezone.utc),
        "end_time": session.end_time.replace(tzinfo=timezone.utc),
        "status": session.status,
        "final_score": session.final_score,
        "questions": formatted_questions,
        # Cohort metrics (excluding proctoring_suspicion_score and timeline for privacy)
        "cohort_scores": cohort_scores,
        "percentile": round(percentile, 1),
        "cohort_average": round(cohort_average, 1),
        "cohort_highest": round(cohort_highest, 1)
    }

def json_loader(data_str: str) -> Dict[str, Any]:
    try:
        return json.loads(data_str)
    except Exception:
        return {}
