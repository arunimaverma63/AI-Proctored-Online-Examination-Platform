import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to add JWT authorization token and X-Session-Token to every request
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      const sessionToken = localStorage.getItem('session_token');
      if (sessionToken) {
        config.headers['X-Session-Token'] = sessionToken;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Auth endpoints
export const authApi = {
  register: (username, password, role) => 
    api.post('/auth/register', { username, password, role }),
  login: (username, password) => 
    api.post('/auth/login', { username, password }),
  getMe: () => 
    api.get('/auth/me'),
};

// Subjects & Questions CRUD (Admin)
export const subjectApi = {
  list: () => api.get('/subjects'),
  create: (name) => api.post('/subjects', { name }),
  delete: (id) => api.delete(`/subjects/${id}`),
};

export const questionApi = {
  list: () => api.get('/questions'),
  create: (questionData) => api.post('/questions', questionData),
  delete: (id) => api.delete(`/questions/${id}`),
};

// Exam Configs (Admin)
export const examApi = {
  list: () => api.get('/exams'),
  create: (examData) => api.post('/exams', examData),
  delete: (id) => api.delete(`/exams/${id}`),
  getDashboardStats: () => api.get('/admin/dashboard-stats'),
};

// Student Exam endpoints
export const studentApi = {
  getExamsList: () => api.get('/student/exams'),
  startExam: (examId) => api.post(`/student/exams/${examId}/start`),
  saveAnswers: (sessionId, answers) => 
    api.post(`/student/session/${sessionId}/save`, { answers }),
  submitSingleAnswer: (sessionId, questionId, answer) =>
    api.post(`/student/session/${sessionId}/submit-answer`, { question_id: questionId, answer }),
  uploadHandwritten: (sessionId, questionId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/student/session/${sessionId}/upload-handwritten?question_id=${questionId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  submitExam: (sessionId) => api.post(`/student/session/${sessionId}/submit`),
};

// Proctoring endpoints
export const proctorApi = {
  logEvent: (sessionId, eventType, description) => 
    api.post(`/proctor/log?session_id=${sessionId}`, { event_type: eventType, description }),
  sendSnapshot: (sessionId, base64Image) => 
    api.post(`/proctor/snapshot/${sessionId}`, { image: base64Image }),
};

// Examiner Grading endpoints
export const gradingApi = {
  getSubmissions: () => api.get('/grading/submissions'),
  getSubmissionDetails: (sessionId) => api.get(`/grading/submission/${sessionId}`),
  submitGrade: (evaluationId, examinerScore, examinerFeedback, annotations = null) => 
    api.post('/grading/evaluate', {
      evaluation_id: evaluationId,
      examiner_score: parseFloat(examinerScore),
      examiner_feedback: examinerFeedback,
      annotations: annotations,
    }),
};

// Student Results endpoint
export const resultsApi = {
  getResultDetails: (sessionId) => api.get(`/results/session/${sessionId}`),
};

export default api;
