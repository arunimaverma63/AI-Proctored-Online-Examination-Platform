from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

# ----------------- User Schemas -----------------
class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str
    role: str = "student"  # 'admin', 'student', 'examiner'

class UserResponse(UserBase):
    id: int
    role: str

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    username: str

class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None

# ----------------- Subject Schemas -----------------
class SubjectBase(BaseModel):
    name: str

class SubjectCreate(SubjectBase):
    pass

class SubjectResponse(SubjectBase):
    id: int

    class Config:
        from_attributes = True

# ----------------- Question Schemas -----------------
class QuestionBase(BaseModel):
    subject_id: int
    type: str  # 'mcq', 'multiselect', 'short', 'long', 'image'
    text: str
    options: Optional[str] = None  # JSON string
    points: float = 1.0
    reference_file_url: Optional[str] = None

class QuestionCreate(QuestionBase):
    correct_answer: Optional[str] = None  # JSON or text
    model_answer: Optional[str] = None

class QuestionResponse(QuestionBase):
    id: int
    # Do not include correct_answer or model_answer for exam taking
    class Config:
        from_attributes = True

class QuestionAdminResponse(QuestionResponse):
    correct_answer: Optional[str] = None
    model_answer: Optional[str] = None

# ----------------- Exam Schemas -----------------
class ExamBase(BaseModel):
    title: str
    subject_id: int
    duration_minutes: int
    total_questions: int
    negative_marking_val: float = 0.0
    randomize_questions: bool = True
    randomize_options: bool = True
    start_time: datetime
    end_time: datetime

    @field_validator('start_time', 'end_time')
    @classmethod
    def convert_to_utc_naive(cls, v: datetime) -> datetime:
        if v.tzinfo is not None:
            return v.astimezone(timezone.utc).replace(tzinfo=None)
        return v

class ExamCreate(ExamBase):
    pass

class ExamResponse(ExamBase):
    id: int
    subject: SubjectResponse

    @field_validator('start_time', 'end_time')
    @classmethod
    def make_utc_aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v.astimezone(timezone.utc)

    class Config:
        from_attributes = True

# ----------------- Exam Session Schemas -----------------
class ExamSessionStart(BaseModel):
    exam_id: int

class ExamSessionSaveAnswers(BaseModel):
    answers: Dict[str, Any]  # {question_id: answer}

class ExamSessionResponse(BaseModel):
    id: int
    exam_id: int
    student_id: int
    start_time: datetime
    end_time: datetime
    status: str
    answers: Optional[str] = None
    final_score: Optional[float] = None
    proctoring_suspicion_score: float
    exam: ExamResponse

    @field_validator('start_time', 'end_time')
    @classmethod
    def make_utc_aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v.astimezone(timezone.utc)

    class Config:
        from_attributes = True

# ----------------- Proctoring Log Schemas -----------------
class ProctoringLogCreate(BaseModel):
    event_type: str
    description: Optional[str] = None

class ProctoringLogResponse(BaseModel):
    id: int
    session_id: int
    event_type: str
    timestamp: datetime
    screenshot_url: Optional[str] = None
    description: Optional[str] = None

    @field_validator('timestamp')
    @classmethod
    def make_utc_aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v.astimezone(timezone.utc)

    class Config:
        from_attributes = True

# ----------------- Subjective Evaluation Schemas -----------------
class SubjectiveEvaluationResponse(BaseModel):
    id: int
    session_id: int
    question_id: int
    student_answer: Optional[str] = None
    handwritten_image_url: Optional[str] = None
    ai_score: Optional[float] = None
    ai_justification: Optional[str] = None
    examiner_score: Optional[float] = None
    examiner_feedback: Optional[str] = None
    is_graded: bool
    question: QuestionResponse

    class Config:
        from_attributes = True

class ExaminerGradeSubmit(BaseModel):
    evaluation_id: int
    examiner_score: float
    examiner_feedback: Optional[str] = None
    annotations: Optional[str] = None

# ----------------- Results Dashboard Schemas -----------------
class StudentExamSessionSummary(BaseModel):
    exam_id: int
    session_id: int
    exam_title: str
    subject_name: str
    start_time: datetime
    status: str
    final_score: Optional[float] = None
    proctoring_suspicion_score: float
    duration_minutes: int

    @field_validator('start_time')
    @classmethod
    def make_utc_aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v.astimezone(timezone.utc)
