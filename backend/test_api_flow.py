import os
import json
import asyncio
from datetime import datetime, timedelta

# Mock settings for imports
os.environ["DATABASE_URL"] = "sqlite:///./test_exam_platform.db"

from app.database import SessionLocal, Base, engine
from app.models import User, Subject, Question, Exam, ExamSession, SubjectiveEvaluation, ProctorEvent
from app.routers.auth import get_current_user, get_password_hash
from app.routers.exams import run_ai_evaluations, recalculate_session_score
from app.services.cv_proctor import analyze_snapshot

# Clear existing test DB
if os.path.exists("test_exam_platform.db"):
    os.remove("test_exam_platform.db")

# Create tables
Base.metadata.create_all(bind=engine)

async def run_test():
    print("=== STARTING INTEGRATION FLOW TEST ===")
    db = SessionLocal()
    
    try:
        # 1. Create Users
        print("\n1. Seeding Users...")
        student = User(username="student_test", hashed_password=get_password_hash("pass123"), role="student")
        examiner = User(username="examiner_test", hashed_password=get_password_hash("pass123"), role="examiner")
        admin = User(username="admin_test", hashed_password=get_password_hash("pass123"), role="admin")
        db.add_all([student, examiner, admin])
        db.commit()
        print("Users created.")

        # 2. Create Subject
        print("\n2. Creating Subject 'Computer Science'...")
        subject = Subject(name="Computer Science")
        db.add(subject)
        db.commit()
        db.refresh(subject)
        print(f"Subject created with ID: {subject.id}")

        # 3. Create Questions
        print("\n3. Seeding Question Bank...")
        q1 = Question(
            subject_id=subject.id,
            type="mcq",
            text="Which of the following is a mutable data type in Python?",
            options=json.dumps(["List", "Tuple", "String", "Integer"]),
            correct_answer="List",
            points=2.0
        )
        
        q2 = Question(
            subject_id=subject.id,
            type="multiselect",
            text="Identify the compiled programming languages.",
            options=json.dumps(["C++", "Python", "Rust", "JavaScript"]),
            correct_answer=json.dumps(["C++", "Rust"]),
            points=2.0
        )

        q3 = Question(
            subject_id=subject.id,
            type="short",
            text="Explain the concept of inheritance in OOP.",
            model_answer="Inheritance is a mechanism where a new class inherits properties and behaviors (methods) from an existing class. It promotes code reusability.",
            points=4.0
        )

        q4 = Question(
            subject_id=subject.id,
            type="image",
            text="Upload a handwritten definition of a Stack data structure.",
            model_answer="A stack is a linear data structure that follows the LIFO (Last In First Out) principle, supporting push and pop operations.",
            points=5.0
        )

        db.add_all([q1, q2, q3, q4])
        db.commit()
        print("4 questions seeded.")

        # 4. Schedule Exam
        print("\n4. Scheduling Exam...")
        exam = Exam(
            title="Programming Basics Exam",
            subject_id=subject.id,
            duration_minutes=45,
            total_questions=4,
            negative_marking_val=0.5,
            randomize_questions=False,
            randomize_options=False,
            start_time=datetime.utcnow() - timedelta(minutes=5),
            end_time=datetime.utcnow() + timedelta(hours=2),
            created_by=admin.id
        )
        db.add(exam)
        db.commit()
        db.refresh(exam)
        print(f"Exam Scheduled: {exam.title} (ID: {exam.id})")

        # 5. Start Exam Session
        print("\n5. Student Starting Exam Session...")
        session = ExamSession(
            exam_id=exam.id,
            student_id=student.id,
            start_time=datetime.utcnow(),
            end_time=datetime.utcnow() + timedelta(minutes=45),
            status="active",
            answers="{}",
            proctoring_suspicion_score=0.0
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        print(f"Exam Session created. Status: {session.status}, ID: {session.id}")

        # 6. Log Proctoring Browser Events
        print("\n6. Simulating Proctoring Browser Events...")
        # Simulate tab switch (penalty: 10)
        log1 = ProctorEvent(
            session_id=session.id,
            event_type="tab_switch",
            timestamp=datetime.utcnow(),
            description="Student switched browser tab."
        )
        # Update session suspicion score
        session.proctoring_suspicion_score = min(session.proctoring_suspicion_score + 10.0, 100.0)
        db.add(log1)
        db.commit()
        print(f"Log added: tab_switch. Current suspicion score: {session.proctoring_suspicion_score}%")

        # 7. Student Submits Answers
        print("\n7. Student Saving Answers & Submitting Exam...")
        student_answers = {
            str(q1.id): "List",                 # Correct MCQ (+2.0 points)
            str(q2.id): ["C++", "Rust"],        # Correct Multi-select (+2.0 points)
            str(q3.id): "Inheritance is a way to reuse code where a class copies properties of another class.",  # Subjective
            str(q4.id): "/static/uploads/handwritten_mock.jpg"  # Handwritten image answer
        }
        
        session.answers = json.dumps(student_answers)
        session.status = "submitted"
        db.commit()
        print(f"Answers saved and exam status set to: {session.status}")

        # 8. Run AI Evaluation
        print("\n8. Running AI subjective answer grading (in background)...")
        # Ensure our mock handwritten upload file exists locally so the base64 conversion doesn't fail
        os.makedirs("static/uploads", exist_ok=True)
        with open("static/uploads/handwritten_mock.jpg", "wb") as f:
            f.write(b"MOCK IMAGE CONTENT")
            
        await run_ai_evaluations(session.id, db)
        db.refresh(session)
        print("AI evaluation complete.")
        
        # Verify evaluations in DB
        evals = db.query(SubjectiveEvaluation).filter(SubjectiveEvaluation.session_id == session.id).all()
        print(f"Subjective Evaluation Records created: {len(evals)}")
        for ev in evals:
            print(f"  - Question ID {ev.question_id}: AI Score = {ev.ai_score}, Justification = {ev.ai_justification[:70]}...")

        print(f"Current Exam Score (MCQ auto-graded + AI-predicted): {session.final_score} points")

        # 9. Examiner Reviews & Overrides Grades
        print("\n9. Examiner Portal Override Grade simulation...")
        # Examiner reviews the image upload (Question 4) and updates the grade
        evaluation_q4 = db.query(SubjectiveEvaluation).filter(
            SubjectiveEvaluation.session_id == session.id,
            SubjectiveEvaluation.question_id == q4.id
        ).first()
        
        # Examiner sets final overridden score
        evaluation_q4.examiner_score = 4.5
        evaluation_q4.examiner_feedback = "Good explanation of LIFO, handwriting transcription matches Stack rules."
        evaluation_q4.is_graded = True
        db.commit()
        
        # Examiner reviews Short Answer (Question 3) and sets score
        evaluation_q3 = db.query(SubjectiveEvaluation).filter(
            SubjectiveEvaluation.session_id == session.id,
            SubjectiveEvaluation.question_id == q3.id
        ).first()
        evaluation_q3.examiner_score = 3.0
        evaluation_q3.examiner_feedback = "A bit concise, but accurately explains the inheritance reusability aspect."
        evaluation_q3.is_graded = True
        db.commit()

        # Recalculate Final Exam Session Score
        recalculate_session_score(session.id, db)
        db.refresh(session)
        
        print("Examiner review complete. Final recalculated score:")
        # MCQ: 2.0
        # Multiselect: 2.0
        # Q3 inheritance: 3.0 (Examiner overridden)
        # Q4 stack image: 4.5 (Examiner overridden)
        # Total: 11.5
        print(f"  Final Score: {session.final_score} / 14.0 points")
        assert session.final_score == 11.5, f"Expected 11.5, got {session.final_score}"
        print("  Score check PASSED!")

        print("\n=== ALL INTEGRATION TESTS PASSED SUCCESSFULLY ===")

    finally:
        db.close()
        engine.dispose()
        # Clean up database file
        if os.path.exists("test_exam_platform.db"):
            os.remove("test_exam_platform.db")

if __name__ == "__main__":
    asyncio.run(run_test())
