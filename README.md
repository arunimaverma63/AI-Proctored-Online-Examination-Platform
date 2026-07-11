# 🌟 AI-Proctored Online Examination Platform

An end-to-end, modern, role-based online assessment platform utilizing **AI-assisted subjective grading** (via the Google Gemini API) and **real-time computer vision proctoring** (via OpenCV & webcam tracking).

---

## 🚀 Key Features

### 👤 Role-Based Management & Dashboards
- **Students**: View active/scheduled exams, take proctored assessments, view real-time warnings, upload canvas sketches or handwriting images, and review graded results with AI details and examiner feedback.
- **Examiners**: Create questions, schedule examinations, access the subjective grading queue, view AI recommendations/OCR extractions, submit final overrides, write feedback, and annotate canvas drawings.
- **Admins**: Manage student/examiner accounts, subjects, exam schedules, and monitor global proctoring logs.

### 📝 Versatile Question Types
- **Multiple Choice (MCQ)**: Single correct choice.
- **Multi-Select**: Multiple correct choices.
- **Short & Long Answer**: Subjective textual answers graded using reference rubrics.
- **Image/Handwritten Upload**: Supports canvas sketching directly in the browser or camera uploads. The backend extracts text via OCR and evaluates it based on the rubric.

### 🧠 Gemini AI-Assisted Evaluation (Gemini 2.5 Flash)
- **Automatic Grading**: Compares student responses with the model answer/rubric to compute a suggested score.
- **OCR Text Extraction**: Automatically transcribes handwritten uploaded answers.
- **Justification**: Provides clear reasoning on why a specific score was assigned.
- **Examiner Overrides**: Offers manual correction controls for examiners to adjust points, write custom comments, or annotate answers.

### 👁️ Computer Vision Proctoring & Suspicion Scoring
- **Webcam Monitoring (OpenCV)**:
  - **Face Missing**: Alerts when the student leaves the camera view.
  - **Multiple Faces**: Flags when unauthorized individuals are present.
  - **Gaze Deviation**: Detects when eyes wander away from the screen for prolonged periods.
- **Heuristic Logging**: Triggers warnings for tab switches, window blurring (focus loss), and camera connectivity issues.
- **Suspicion Score (0-100)**: Automatically builds an incremental suspicion index based on violation severity, logging annotated visual snapshots in the database for reviewer audits.

---

## 🛠️ Technology Stack

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Database ORM**: SQLAlchemy with PostgreSQL (Production) and SQLite (Development/Test)
- **Security**: JWT tokens (`python-jose`) and `passlib[bcrypt]` for password hashing
- **Image Processing**: OpenCV (`opencv-python-headless`) and Pillow (`PIL`)
- **API Client**: `httpx` for asynchronous requests to the Gemini API

### Frontend
- **Framework**: Next.js 16 (App Router) & React 19
- **Styling**: Tailwind CSS v4 & Lucide React Icons
- **HTTP Client**: Axios

---

## 📂 Project Structure

```text
AI-Proctored-Online-Examination-Platform/
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   │   ├── auth.py         # Authentication (JWT, login, registration)
│   │   │   ├── exams.py        # Subjects, questions, exams & student exam actions
│   │   │   ├── grading.py      # Examiner grading queue, manual feedback, overrides
│   │   │   └── proctor.py      # Real-time computer vision and behavior logs
│   │   ├── services/
│   │   │   ├── ai_evaluation.py# Gemini API client, grading prompts, and fallback heuristics
│   │   │   └── cv_proctor.py   # OpenCV face/eye cascades & Pillow fallbacks
│   │   ├── config.py           # Settings and configuration schemas
│   │   ├── database.py         # Database engine, SessionLocal, and DB sessions
│   │   ├── models.py           # SQLAlchemy database tables
│   │   ├── schemas.py          # Pydantic schemas for request validation
│   │   └── main.py             # FastAPI App creation, CORS, and default seeding
│   ├── static/uploads/         # Directory holding proctoring violation snapshots
│   ├── requirements.txt        # Python package dependencies
│   ├── migrate_timezones.py    # Helper utility to shift database times to UTC
│   └── test_api_flow.py        # Automated end-to-end integration flow tests
│
└── frontend/
    ├── src/
    │   ├── api.js              # Axios instance containing API call integrations
    │   └── app/
    │       ├── admin/          # Admin dashboard & management interfaces
    │       ├── components/     # Reusable layout UI (e.g. Navbar)
    │       ├── examiner/       # Examiner dashboard, exam creation, and grading queues
    │       ├── login/          # JWT authentication page
    │       ├── student/        # Student exams listing, live quiz workspace, and results
    │       ├── layout.js       # App Router root layout page
    │       └── page.js         # Navigation splash page
    ├── package.json            # npm scripts and package dependencies
    └── next.config.mjs         # Next.js configurations
```

---

## 🗄️ Database Schema Details

The platform uses **SQLAlchemy** to manage seven interlinked tables:
1. **User**: Handles user accounts (`admin`, `student`, `examiner`).
2. **Subject**: Holds academic subject categories.
3. **Question**: Stores multiple-choice or subjective options, model answers, points, and types.
4. **Exam**: Configuration options (durations, start/end windows, randomization, negative markings).
5. **ExamSession**: Tracks specific student attempts (raw responses, final scores, and dynamic suspicion levels).
6. **ProctoringLog**: Timestamps of behavioral events (e.g. tab switches, gaze deviation) linked to annotated webcam screenshots.
7. **SubjectiveEvaluation**: Couples subjective responses with AI-generated feedback, OCR transcriptions, examiner annotations, and overrides.

---

## ⚙️ Getting Started

### Prerequisites
- **Python 3.11+**
- **Node.js 18+**
- **PostgreSQL** (Optional; SQLite is supported out of the box)
- **Google Gemini API Key** (Optional; fallback mocks will grade answers if missing)

---

### Backend Setup

1. **Navigate to the Backend Directory**:
   ```bash
   cd backend
   ```

2. **Set Up a Virtual Environment & Install Dependencies**:
   ```bash
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # macOS/Linux:
   source .venv/bin/activate

   pip install -r requirements.txt
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the `backend/` folder:
   ```env
   # PostgreSQL connection string (defaults to SQLite if not provided or starting with sqlite)
   DATABASE_URL=postgresql://postgres:0000@localhost:5432/proctoredexam

   # Secret JWT generation key
   SECRET_KEY=df179eef3bf45d2e389d311fa904724b17b2b8e3a5df67c83c2763f03bda9e17

   # Gemini API Key (optional but recommended for AI features)
   GEMINI_API_KEY=YOUR_GEMINI_API_KEY
   ```

4. **Start the API Server**:
   ```bash
   uvicorn app.main:app --reload
   ```
   *Note: On startup, the platform will automatically seed default accounts if the database is empty:*
   - **Admin**: `admin` / `admin123`
   - **Student**: `student` / `student123`
   - **Examiner**: `examiner` / `examiner123`

5. **API Documentation**:
   Once running, you can explore the interactive API docs at [http://localhost:8000/docs](http://localhost:8000/docs).

---

### Frontend Setup

1. **Navigate to the Frontend Directory**:
   ```bash
   cd frontend
   ```

2. **Install Packages**:
   ```bash
   npm install
   ```

3. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🧪 Testing

An automated integration suite is provided to validate database connections, CV fallbacks, and Gemini API evaluations:
```bash
cd backend
python test_api_flow.py
```
This tests:
1. User registration & authentication.
2. Subject creation & Question Bank seeding.
3. Exam scheduling & Active Session starts.
4. Computer Vision analysis (decoding snapshots and flagging events).
5. AI subjective grading, OCR evaluation, and score recalculations.
