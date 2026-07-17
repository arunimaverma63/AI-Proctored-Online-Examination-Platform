from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False)  # 'admin', 'student', 'examiner'

    # Relationships
    sessions = relationship("ExamSession", back_populates="student")

class Subject(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)

    # Relationships
    questions = relationship("Question", back_populates="subject", cascade="all, delete-orphan")
    exams = relationship("Exam", back_populates="subject", cascade="all, delete-orphan")

class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    type = Column(String, nullable=False)  # 'mcq', 'multiselect', 'short', 'long', 'image'
    text = Column(Text, nullable=False)
    options = Column(Text, nullable=True)  # JSON string of options, e.g. ["A", "B", "C"]
    correct_answer = Column(Text, nullable=True)  # JSON string of correct key(s) or correct text
    points = Column(Float, nullable=False, default=1.0)
    model_answer = Column(Text, nullable=True)  # Rubric / Model Answer for subjective questions

    # Relationships
    subject = relationship("Subject", back_populates="questions")
    subjective_evaluations = relationship("SubjectiveEvaluation", back_populates="question", cascade="all, delete-orphan")

class Exam(Base):
    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    total_questions = Column(Integer, nullable=False, default=10)
    negative_marking_val = Column(Float, nullable=False, default=0.0)  # e.g., 0.25
    randomize_questions = Column(Boolean, default=True)
    randomize_options = Column(Boolean, default=True)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"))
    results_published = Column(Boolean, default=False, nullable=False)

    # Relationships
    subject = relationship("Subject", back_populates="exams")
    sessions = relationship("ExamSession", back_populates="exam", cascade="all, delete-orphan")

class ExamSession(Base):
    __tablename__ = "exam_sessions"

    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    session_token = Column(String, unique=True, index=True, nullable=True)
    start_time = Column(DateTime, nullable=False, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=False)
    status = Column(String, nullable=False, default="active")  # 'active', 'submitted', 'timed_out'
    answers = Column(Text, nullable=True)  # JSON string of student responses: {question_id: answer}
    final_score = Column(Float, nullable=True)  # Auto + manual grader score
    proctoring_suspicion_score = Column(Float, nullable=False, default=0.0)

    # Relationships
    exam = relationship("Exam", back_populates="sessions")
    student = relationship("User", back_populates="sessions")
    proctor_logs = relationship("ProctorEvent", back_populates="session", cascade="all, delete-orphan")
    subjective_evaluations = relationship("SubjectiveEvaluation", back_populates="session", cascade="all, delete-orphan")
    question_results = relationship("QuestionResult", back_populates="session", cascade="all, delete-orphan")

class ProctorEvent(Base):
    __tablename__ = "proctor_events"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("exam_sessions.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String, nullable=False)  # 'tab_switch', 'window_blur', 'face_missing', 'multiple_faces', 'gaze_away', 'cam_error'
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    screenshot_url = Column(String, nullable=True)  # Path to saved webcam image
    description = Column(String, nullable=True)

    # Relationships
    session = relationship("ExamSession", back_populates="proctor_logs")

class QuestionResult(Base):
    __tablename__ = "question_results"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("exam_sessions.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    student_answer = Column(Text, nullable=True)
    score = Column(Float, nullable=False, default=0.0)
    is_correct = Column(Boolean, default=False)

    # Relationships
    session = relationship("ExamSession", back_populates="question_results")
    question = relationship("Question")


class SubjectiveEvaluation(Base):
    __tablename__ = "subjective_evaluations"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("exam_sessions.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    student_answer = Column(Text, nullable=True)
    handwritten_image_url = Column(String, nullable=True)
    ai_score = Column(Float, nullable=True)
    ai_justification = Column(Text, nullable=True)
    examiner_score = Column(Float, nullable=True)
    examiner_feedback = Column(Text, nullable=True)
    is_graded = Column(Boolean, default=False)
    annotations = Column(Text, nullable=True) # JSON string of canvas highlights/comments

    # Relationships
    session = relationship("ExamSession", back_populates="subjective_evaluations")
    question = relationship("Question", back_populates="subjective_evaluations")
