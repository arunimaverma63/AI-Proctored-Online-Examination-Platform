'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import { useLanguage } from '../components/LanguageContext';
import { gradingApi, subjectApi, questionApi, examApi } from '../../api';
import { 
  ShieldAlert, Award, FileText, CheckCircle, Search, RefreshCw, 
  BookOpen, HelpCircle, Calendar, Plus, Trash2, Activity, 
  TrendingUp, Clock, ArrowRight, UserCheck, Play, Edit3, 
  ChevronRight, Sparkles, AlertTriangle
} from 'lucide-react';

export default function ExaminerDashboard() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [submissions, setSubmissions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const router = useRouter();

  // Subjects state
  const [subjects, setSubjects] = useState([]);
  const [newSubject, setNewSubject] = useState('');

  // Questions state
  const [questions, setQuestions] = useState([]);
  const [qSubjectId, setQSubjectId] = useState('');
  const [qType, setQType] = useState('MCQ'); // MCQ, multi_select, short_answer, long_answer, image_upload
  const [qText, setQText] = useState('');
  const [qOptions, setQOptions] = useState(['', '']);
  const [qCorrectOptionIndex, setQCorrectOptionIndex] = useState(0); // For MCQ (index)
  const [qCorrectMultiIndices, setQCorrectMultiIndices] = useState([]); // For multi_select (array of indices)
  const [qModelAnswer, setQModelAnswer] = useState('');
  const [qPoints, setQPoints] = useState(1.0);
  const [qRefFile, setQRefFile] = useState(null);
  const [uploadingRefFile, setUploadingRefFile] = useState(false);

  const handleRefFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      setUploadingRefFile(true);
      const res = await questionApi.uploadFile(file);
      setQRefFile(res.data.file_url);
      showFeedback('Reference file uploaded successfully');
    } catch (err) {
      showFeedback(err.response?.data?.detail || 'Failed to upload reference file', false);
    } finally {
      setUploadingRefFile(false);
    }
  };

  // Exams state
  const [exams, setExams] = useState([]);
  const [exTitle, setExTitle] = useState('');
  const [exSubjectId, setExSubjectId] = useState('');
  const [exDuration, setExDuration] = useState(60);
  const [exCount, setExCount] = useState(10);
  const [exNegative, setExNegative] = useState(0.0);
  const [exRandomQ, setExRandomQ] = useState(true);
  const [exRandomO, setExRandomO] = useState(true);
  const [exStart, setExStart] = useState('');
  const [exEnd, setExEnd] = useState('');

  // Exam Questions filter state
  const [selectedExamForQuestions, setSelectedExamForQuestions] = useState('');

  useEffect(() => {
    fetchData();
    fetchDashboardStats();
  }, []);

  useEffect(() => {
    if (activeTab !== 'dashboard') return;

    const interval = setInterval(() => {
      fetchDashboardStats();
    }, 5000);

    return () => clearInterval(interval);
  }, [activeTab]);

  const showFeedback = (msg, isSuccess = true) => {
    if (isSuccess) {
      setSuccess(msg);
      setError('');
    } else {
      setError(msg);
      setSuccess('');
    }
    setTimeout(() => {
      setSuccess('');
      setError('');
    }, 5000);
  };

  const fetchDashboardStats = async () => {
    try {
      setStatsLoading(true);
      const res = await examApi.getDashboardStats();
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch dashboard stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const subsRes = await gradingApi.getSubmissions();
      setSubmissions(subsRes.data);

      const subjectsRes = await subjectApi.list();
      setSubjects(subjectsRes.data);
      if (subjectsRes.data.length > 0) {
        setQSubjectId(subjectsRes.data[0].id);
        setExSubjectId(subjectsRes.data[0].id);
      }

      const questionsRes = await questionApi.list();
      setQuestions(questionsRes.data);

      const examsRes = await examApi.list();
      setExams(examsRes.data);
      if (examsRes.data.length > 0) {
        setSelectedExamForQuestions(examsRes.data[0].id);
      }
    } catch (err) {
      setError('Failed to fetch data from API');
    } finally {
      setLoading(false);
    }
  };

  const getSuspicionLevel = (score) => {
    if (score >= 40) return <span className="badge badge-rose" style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}><ShieldAlert size={12} /> Critical ({score})</span>;
    if (score >= 20) return <span className="badge badge-amber" style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}><ShieldAlert size={12} /> Medium ({score})</span>;
    return <span className="badge badge-emerald" style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}><CheckCircle size={12} /> Safe ({score})</span>;
  };

  const filteredSubmissions = submissions.filter((s) => 
    s.student_username.toLowerCase().includes(search.toLowerCase()) ||
    s.exam_title.toLowerCase().includes(search.toLowerCase()) ||
    s.subject_name.toLowerCase().includes(search.toLowerCase())
  );

  // Subject Actions
  const handleAddSubject = async (e) => {
    e.preventDefault();
    if (!newSubject.trim()) return;
    try {
      await subjectApi.create(newSubject.trim());
      setNewSubject('');
      showFeedback('Subject created successfully');
      fetchData();
    } catch (err) {
      showFeedback(err.response?.data?.detail || 'Failed to create subject', false);
    }
  };

  const handleDeleteSubject = async (id) => {
    if (!confirm('Are you sure you want to delete this subject? All related questions and exams will be deleted.')) return;
    try {
      await subjectApi.delete(id);
      showFeedback('Subject deleted successfully');
      fetchData();
    } catch (err) {
      showFeedback('Failed to delete subject', false);
    }
  };

  // Option management for new questions
  const handleAddOptionField = () => {
    setQOptions([...qOptions, '']);
  };

  const handleRemoveOptionField = (index) => {
    if (qOptions.length <= 2) {
      showFeedback('At least 2 options are required', false);
      return;
    }
    const updated = qOptions.filter((_, idx) => idx !== index);
    setQOptions(updated);
    
    // adjust index selection
    if (qCorrectOptionIndex >= updated.length) {
      setQCorrectOptionIndex(updated.length - 1);
    }
    setQCorrectMultiIndices(qCorrectMultiIndices.filter(i => i < updated.length));
  };

  const handleOptionTextChange = (index, value) => {
    const updated = [...qOptions];
    updated[index] = value;
    setQOptions(updated);
  };

  const handleToggleMultiCorrect = (index) => {
    if (qCorrectMultiIndices.includes(index)) {
      setQCorrectMultiIndices(qCorrectMultiIndices.filter(i => i !== index));
    } else {
      setQCorrectMultiIndices([...qCorrectMultiIndices, index]);
    }
  };

  // Question Actions
  const handleAddQuestion = async (e) => {
    e.preventDefault();
    try {
      let finalOptions = null;
      let finalCorrect = null;

      // Note: We use the exact types requested (MCQ, multi_select, short_answer, long_answer, image_upload, pdf_upload, code_upload)
      // The backend exams.py will normalize them to internal values: mcq, multiselect, short, long, image, pdf, cs_file
      if (qType === 'MCQ' || qType === 'multi_select') {
        const filteredOpts = qOptions.filter(o => o.trim() !== '');
        if (filteredOpts.length < 2) {
          showFeedback('MCQ/Multi-select questions require at least 2 options', false);
          return;
        }
        finalOptions = JSON.stringify(filteredOpts);

        if (qType === 'MCQ') {
          // correct answer is the string value of the selected option
          const selectedText = filteredOpts[qCorrectOptionIndex];
          if (!selectedText) {
            showFeedback('Please select a correct option', false);
            return;
          }
          finalCorrect = selectedText;
        } else if (qType === 'multi_select') {
          // correct answer is a JSON string of selected options' strings
          const selectedTexts = qCorrectMultiIndices.map(idx => filteredOpts[idx]).filter(Boolean);
          if (selectedTexts.length === 0) {
            showFeedback('Please check at least one correct option', false);
            return;
          }
          finalCorrect = JSON.stringify(selectedTexts);
        }
      } else {
        finalOptions = null;
        finalCorrect = null;
      }

      await questionApi.create({
        subject_id: parseInt(qSubjectId),
        type: qType, // MCQ, multi_select, short_answer, long_answer, image_upload, pdf_upload, code_upload
        text: qText,
        options: finalOptions,
        correct_answer: finalCorrect,
        points: parseFloat(qPoints),
        model_answer: ['short_answer', 'long_answer', 'image_upload', 'pdf_upload', 'code_upload'].includes(qType) ? qModelAnswer : null,
        reference_file_url: qRefFile
      });

      // Reset Form states
      setQText('');
      setQModelAnswer('');
      setQOptions(['', '']);
      setQCorrectOptionIndex(0);
      setQCorrectMultiIndices([]);
      setQPoints(1.0);
      setQRefFile(null);
      showFeedback('Question added to Bank successfully');
      fetchData();
    } catch (err) {
      showFeedback(err.response?.data?.detail || 'Failed to add question', false);
    }
  };

  const handleDeleteQuestion = async (id) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    try {
      await questionApi.delete(id);
      showFeedback('Question deleted successfully');
      fetchData();
    } catch (err) {
      showFeedback('Failed to delete question', false);
    }
  };

  // Exam Actions
  const handleCreateExam = async (e) => {
    e.preventDefault();
    if (!exStart || !exEnd) {
      showFeedback('Start and End dates/times are required', false);
      return;
    }
    try {
      await examApi.create({
        title: exTitle,
        subject_id: parseInt(exSubjectId),
        duration_minutes: parseInt(exDuration),
        total_questions: parseInt(exCount),
        negative_marking_val: parseFloat(exNegative),
        randomize_questions: exRandomQ,
        randomize_options: exRandomO,
        start_time: new Date(exStart).toISOString(),
        end_time: new Date(exEnd).toISOString(),
      });

      // Reset scheduler form
      setExTitle('');
      setExDuration(60);
      setExCount(10);
      setExNegative(0.0);
      setExStart('');
      setExEnd('');
      showFeedback('Exam scheduled successfully');
      fetchData();
      fetchDashboardStats();
    } catch (err) {
      showFeedback(err.response?.data?.detail || 'Failed to schedule exam', false);
    }
  };

  const handleDeleteExam = async (id) => {
    if (!confirm('Are you sure you want to delete this exam scheduler?')) return;
    try {
      await examApi.delete(id);
      showFeedback('Exam deleted successfully');
      fetchData();
      fetchDashboardStats();
    } catch (err) {
      showFeedback('Failed to delete exam', false);
    }
  };

  const getDisplayStats = () => {
    const defaultStats = {
      active_sessions: 0,
      exams_today: 0,
      completed_exams_today: 0,
      flagged_sessions: 0,
      grading_queue: 0,
      ai_prescored: 0,
      avg_score: 0,
      live_sessions: [],
      alerts: [],
      grading_items: [],
      upcoming_exams: [],
      recent_activity: []
    };

    if (!stats) return defaultStats;

    return {
      active_sessions: stats.active_sessions || 0,
      exams_today: stats.exams_today || 0,
      completed_exams_today: stats.completed_exams_today || 0,
      flagged_sessions: stats.flagged_sessions || 0,
      grading_queue: stats.grading_queue || 0,
      ai_prescored: stats.ai_prescored || 0,
      avg_score: stats.avg_score || 0,
      live_sessions: stats.live_sessions || [],
      alerts: stats.alerts || [],
      grading_items: stats.grading_items || [],
      upcoming_exams: stats.upcoming_exams || [],
      recent_activity: stats.recent_activity || []
    };
  };

  const displayStats = getDisplayStats();

  // Find the selected exam details for showing exam questions
  const selectedExamObj = exams.find(e => String(e.id) === String(selectedExamForQuestions));
  const examQuestions = selectedExamObj 
    ? questions.filter(q => q.subject_id === selectedExamObj.subject_id)
    : [];

  return (
    <div>
      <Navbar />
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 2rem 4rem 2rem' }}>
        
        {/* Banner Title */}
        <div className="glass-panel" style={{
          padding: '2rem',
          marginBottom: '2rem',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(157, 78, 221, 0.15) 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: '800', letterSpacing: '-0.025em' }}>{t('Examiner Dashboard')}</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '0.2rem' }}>
              {t('Grade student submissions, view AI proctoring logs, and manage exams/questions.')}
            </p>
          </div>
          <button onClick={() => { fetchData(); fetchDashboardStats(); }} className="btn-secondary" style={{ padding: '0.5rem 1rem' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {t('Sync Data')}
          </button>
        </div>

        {/* Feedback alerts */}
        {success && (
          <div className="badge-emerald animate-fade-in" style={{ padding: '0.8rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem', width: '100%', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle size={16} /> {t(success)}
          </div>
        )}
        {error && (
          <div className="badge-rose animate-fade-in" style={{ padding: '0.8rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem', width: '100%', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={16} /> {t(error)}
          </div>
        )}

        {/* Tab Selection Navigation */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '2rem' }}>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={activeTab === 'dashboard' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: '1 0 150px', display: 'flex', gap: '0.5rem', fontSize: '0.85rem' }}
          >
            <Activity size={16} /> {t('Dashboard')}
          </button>
          <button
            onClick={() => setActiveTab('submissions')}
            className={activeTab === 'submissions' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: '1 0 150px', display: 'flex', gap: '0.5rem', fontSize: '0.85rem' }}
          >
            <FileText size={16} /> {t('Submissions')}
          </button>
          <button
            onClick={() => setActiveTab('subjects')}
            className={activeTab === 'subjects' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: '1 0 150px', display: 'flex', gap: '0.5rem', fontSize: '0.85rem' }}
          >
            <BookOpen size={16} /> {t('Subjects')}
          </button>
          <button
            onClick={() => setActiveTab('questions')}
            className={activeTab === 'questions' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: '1 0 150px', display: 'flex', gap: '0.5rem', fontSize: '0.85rem' }}
          >
            <HelpCircle size={16} /> {t('Question Bank')}
          </button>
          <button
            onClick={() => setActiveTab('exams')}
            className={activeTab === 'exams' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: '1 0 150px', display: 'flex', gap: '0.5rem', fontSize: '0.85rem' }}
          >
            <Calendar size={16} /> {t('Exams Scheduler')}
          </button>
          <button
            onClick={() => setActiveTab('exam_questions')}
            className={activeTab === 'exam_questions' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: '1 0 150px', display: 'flex', gap: '0.5rem', fontSize: '0.85rem' }}
          >
            <Award size={16} /> {t('Exam Questions')}
          </button>
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* Live Metrics Grid */}
            <div className="dashboard-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem' }}>
              <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'left', background: 'rgba(20, 26, 45, 0.4)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500', textTransform: 'capitalize' }}>{t('active sessions')}</span>
                <h1 style={{ fontSize: '2.2rem', fontWeight: '800', margin: '0.2rem 0' }}>{displayStats.active_sessions}</h1>
                <span className="badge badge-cyan" style={{ fontSize: '0.7rem' }}>{t('Real-time Exam Taking')}</span>
              </div>

              <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'left', background: 'rgba(20, 26, 45, 0.4)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500', textTransform: 'capitalize' }}>{t('exams today')}</span>
                <h1 style={{ fontSize: '2.2rem', fontWeight: '800', margin: '0.2rem 0' }}>{displayStats.exams_today}</h1>
                <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>{displayStats.completed_exams_today} {t('completed')}</span>
              </div>

              <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'left', background: 'rgba(20, 26, 45, 0.4)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500', textTransform: 'capitalize' }}>{t('flagged sessions')}</span>
                <h1 style={{ fontSize: '2.2rem', fontWeight: '800', margin: '0.2rem 0', color: 'var(--accent-rose)' }}>{displayStats.flagged_sessions}</h1>
                <span className="badge badge-rose" style={{ fontSize: '0.7rem' }}>{t('Suspicion Score > 40%')}</span>
              </div>

              <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'left', background: 'rgba(20, 26, 45, 0.4)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500', textTransform: 'capitalize' }}>{t('grading queue')}</span>
                <h1 style={{ fontSize: '2.2rem', fontWeight: '800', margin: '0.2rem 0' }}>{displayStats.grading_queue}</h1>
                <span className="badge badge-amber" style={{ fontSize: '0.7rem' }}>{t('AI Pre-graded:')} {displayStats.ai_prescored}</span>
              </div>

              <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'left', background: 'rgba(20, 26, 45, 0.4)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500', textTransform: 'capitalize' }}>{t('avg score')}</span>
                <h1 style={{ fontSize: '2.2rem', fontWeight: '800', margin: '0.2rem 0', color: 'var(--accent-emerald)' }}>{displayStats.avg_score}%</h1>
                <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>{t('Updated just now')}</span>
              </div>
            </div>

            {/* Split layout: Live sessions & Alerts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
              
              {/* Live sessions monitor */}
              <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'left' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Activity size={18} style={{ color: 'var(--accent-cyan)' }} />
                  {t('LIVE')} {t('Exams')}
                </h3>
                {displayStats.live_sessions.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '2rem 0', textAlign: 'center' }}>No students are currently taking exams.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {displayStats.live_sessions.map((s, idx) => {
                      const formattedTime = s.time_remaining_seconds 
                        ? `${Math.floor(s.time_remaining_seconds / 60)}m` 
                        : '0m';
                      return (
                        <div key={s.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.8rem', borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <div>
                            <span style={{ fontWeight: '700', display: 'block' }}>{s.student_username}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.exam_title} · Q{s.questions_answered}/{s.total_questions}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}><Clock size={12} style={{ display: 'inline', marginRight: '0.2rem' }} />{formattedTime}</span>
                            {getSuspicionLevel(s.suspicion_score)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Proctor alerts feed */}
              <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'left' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShieldAlert size={18} style={{ color: 'var(--accent-rose)' }} />
                  Recent Proctor Violations
                </h3>
                {displayStats.alerts.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '2rem 0', textAlign: 'center' }}>No proctoring violation alerts logged recently.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '350px', overflowY: 'auto' }}>
                    {displayStats.alerts.map((a, idx) => (
                      <div key={a.id || idx} style={{ display: 'flex', gap: '0.75rem', paddingBottom: '0.8rem', borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <div style={{ color: 'var(--accent-rose)', marginTop: '0.15rem' }}><ShieldAlert size={16} /></div>
                        <div>
                          <span style={{ fontSize: '0.85rem', fontWeight: '700', display: 'block' }}>{a.event_type.replace('_', ' ').toUpperCase()}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>{a.student_username} ({a.exam_title})</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.description}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Awaiting Grading & Review */}
              <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'left' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Award size={18} style={{ color: 'var(--accent-purple)' }} />
                  Awaiting Grading & Review
                </h3>
                {displayStats.grading_items.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '2rem 0', textAlign: 'center' }}>
                    No pending items in subjective grading queue.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '350px', overflowY: 'auto' }}>
                    {displayStats.grading_items.map((item, idx) => {
                      let typeBadge = <span className="badge badge-cyan" style={{ fontSize: '0.7rem' }}>SHORT</span>;
                      if (item.question_type === 'long') {
                        typeBadge = <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>LONG</span>;
                      } else if (item.question_type === 'image' || item.question_type === 'image_upload') {
                        typeBadge = <span className="badge badge-amber" style={{ fontSize: '0.7rem' }}>IMAGE</span>;
                      }

                      return (
                        <div key={item.evaluation_id || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', paddingBottom: '0.8rem', borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                            <div style={{ flexShrink: 0 }}>{typeBadge}</div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'left' }}>
                                {item.question_text}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                Student: {item.student_username}
                              </span>
                            </div>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-secondary)' }}>
                              AI Score: {item.ai_score !== null ? `${item.ai_score}/${item.total_points}` : 'N/A'}
                            </span>
                            <button 
                              onClick={() => {
                                if (item.session_id) {
                                  router.push(`/examiner/grade/${item.session_id}`);
                                }
                              }}
                              className="btn-primary" 
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                            >
                              Grade <Edit3 size={10} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Submissions Tab */}
        {activeTab === 'submissions' && (
          <div className="glass-panel animate-fade-in" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0 }}>Grading Submissions Queue</h3>
              
              <div style={{ position: 'relative', width: '320px' }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                  <Search size={16} />
                </span>
                <input
                  type="text"
                  className="glass-input"
                  placeholder="Search by student, exam title or subject..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: '2.5rem', height: '36px', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              {filteredSubmissions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                  No submission records found matching search.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-glass)', background: 'rgba(255,255,255,0.01)' }}>
                      <th style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>STUDENT</th>
                      <th style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>EXAM SCHEDULE</th>
                      <th style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>DATE SUBMITTED</th>
                      <th style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>PROCTOR LOGS</th>
                      <th style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>FINAL GRADE</th>
                      <th style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', textAlign: 'right' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubmissions.map((sub, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                        <td style={{ padding: '1rem 1.25rem' }}>
                          <span style={{ fontWeight: '700' }}>{sub.student_username}</span>
                        </td>
                        <td style={{ padding: '1rem 1.25rem' }}>
                          <span style={{ fontWeight: '500', display: 'block' }}>{sub.exam_title}</span>
                          <span className="badge badge-purple" style={{ fontSize: '0.65rem', marginTop: '0.2rem' }}>{sub.subject_name}</span>
                        </td>
                        <td style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {new Date(sub.start_time).toLocaleString()}
                        </td>
                        <td style={{ padding: '1rem 1.25rem' }}>
                          {getSuspicionLevel(sub.proctoring_suspicion_score)}
                        </td>
                        <td style={{ padding: '1rem 1.25rem' }}>
                          <span style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>
                            {sub.final_score !== null ? `${sub.final_score} / ${sub.total_points}` : 'Needs grading'}
                          </span>
                        </td>
                        <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                          <button
                            onClick={() => router.push(`/examiner/grade/${sub.session_id}`)}
                            className="btn-primary"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                          >
                            <Edit3 size={12} /> Grade & Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Subjects Tab */}
        {activeTab === 'subjects' && (
          <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
            
            {/* Create Subject */}
            <div className="glass-panel" style={{ padding: '2rem', height: 'fit-content', textAlign: 'left' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={18} style={{ color: 'var(--accent-cyan)' }} />
                Add New Subject
              </h3>
              <form onSubmit={handleAddSubject} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Subject Name</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. Artificial Intelligence, Cryptography..."
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem' }}>
                  <Plus size={16} /> Create Subject
                </button>
              </form>
            </div>

            {/* Subjects List */}
            <div className="glass-panel" style={{ padding: '2rem', textAlign: 'left' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BookOpen size={18} style={{ color: 'var(--accent-purple)' }} />
                Active Subjects ({subjects.length})
              </h3>
              
              {subjects.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem' }}>No subjects defined yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {subjects.map((sub) => (
                    <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                      <span style={{ fontWeight: '600' }}>{sub.name}</span>
                      <button 
                        onClick={() => handleDeleteSubject(sub.id)}
                        className="btn-secondary" 
                        style={{ padding: '0.35rem', color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.2)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* Question Bank Tab */}
        {activeTab === 'questions' && (
          <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
            
            {/* Create Question Form */}
            <div className="glass-panel" style={{ padding: '2rem', textAlign: 'left', height: 'fit-content' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={18} style={{ color: 'var(--accent-cyan)' }} />
                Add to Question Bank
              </h3>

              <form onSubmit={handleAddQuestion} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Subject Category</label>
                  <select 
                    className="glass-input" 
                    value={qSubjectId}
                    onChange={(e) => setQSubjectId(e.target.value)}
                    required
                  >
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.id} style={{ background: 'var(--bg-secondary)', color: 'white' }}>{sub.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Question Type (Enum)</label>
                  <select 
                    className="glass-input" 
                    value={qType}
                    onChange={(e) => {
                      setQType(e.target.value);
                      // Set default options structure for MCQ/multi-select
                      if (['MCQ', 'multi_select'].includes(e.target.value)) {
                        setQOptions(['', '']);
                        setQCorrectOptionIndex(0);
                        setQCorrectMultiIndices([]);
                      }
                    }}
                    required
                  >
                    <option value="MCQ" style={{ background: 'var(--bg-secondary)', color: 'white' }}>MCQ (Single Choice)</option>
                    <option value="multi_select" style={{ background: 'var(--bg-secondary)', color: 'white' }}>multi_select (Multiple Checkboxes)</option>
                    <option value="short_answer" style={{ background: 'var(--bg-secondary)', color: 'white' }}>short_answer</option>
                    <option value="long_answer" style={{ background: 'var(--bg-secondary)', color: 'white' }}>long_answer</option>
                    <option value="image_upload" style={{ background: 'var(--bg-secondary)', color: 'white' }}>image_upload (Handwritten Upload)</option>
                    <option value="pdf_upload" style={{ background: 'var(--bg-secondary)', color: 'white' }}>pdf_upload (PDF Document Upload)</option>
                    <option value="code_upload" style={{ background: 'var(--bg-secondary)', color: 'white' }}>code_upload (CS / Code File Upload)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Question Prompt / Text</label>
                  <textarea 
                    className="glass-input"
                    rows="3"
                    placeholder="Enter the complete question text..."
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                    required
                  />
                </div>

                {/* Option management for MCQ and multi_select */}
                {['MCQ', 'multi_select'].includes(qType) && (
                  <div style={{ border: '1px solid var(--border-glass)', padding: '1rem', borderRadius: '8px', background: 'rgba(255,255,255,0.01)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Choices & Correct Answer</span>
                      <button type="button" onClick={handleAddOptionField} className="btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
                        + Add Choice
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {qOptions.map((opt, index) => (
                        <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          
                          {/* MCQ Selector */}
                          {qType === 'MCQ' && (
                            <input 
                              type="radio" 
                              name="mcq-correct" 
                              checked={qCorrectOptionIndex === index}
                              onChange={() => setQCorrectOptionIndex(index)}
                              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                          )}

                          {/* Multi Select Checkbox */}
                          {qType === 'multi_select' && (
                            <input 
                              type="checkbox" 
                              checked={qCorrectMultiIndices.includes(index)}
                              onChange={() => handleToggleMultiCorrect(index)}
                              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                          )}

                          <input
                            type="text"
                            className="glass-input"
                            placeholder={`Option ${index + 1}`}
                            value={opt}
                            onChange={(e) => handleOptionTextChange(index, e.target.value)}
                            style={{ height: '36px', fontSize: '0.85rem' }}
                            required
                          />

                          <button 
                            type="button" 
                            onClick={() => handleRemoveOptionField(index)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--accent-rose)', cursor: 'pointer', padding: '0.2rem' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.5rem' }}>
                      * Use the radio/checkbox to set correct answers.
                    </span>
                  </div>
                )}

                {/* Subjective Model Answer */}
                {['short_answer', 'long_answer', 'image_upload', 'pdf_upload', 'code_upload'].includes(qType) && (
                  <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Model Answer / Grading Rubric</label>
                    <textarea 
                      className="glass-input"
                      rows="3"
                      placeholder="Specify reference explanation or keywords for automatic AI grading..."
                      value={qModelAnswer}
                      onChange={(e) => setQModelAnswer(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Reference Attachment (PDF, Image, CS File)</label>
                  <input
                    type="file"
                    className="glass-input"
                    accept=".pdf,.png,.jpg,.jpeg,.cs,.java,.py,.cpp,.js,.txt"
                    onChange={handleRefFileUpload}
                    disabled={uploadingRefFile}
                  />
                  {qRefFile && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', marginTop: '0.3rem' }}>
                      Attached: <a href={`http://localhost:8000${qRefFile}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>View Reference File</a>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Points / Weight</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      className="glass-input"
                      value={qPoints}
                      onChange={(e) => setQPoints(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem' }}>
                  <Plus size={16} /> Save Question
                </button>
              </form>
            </div>

            {/* Questions Bank List */}
            <div className="glass-panel" style={{ padding: '2rem', textAlign: 'left', maxHeight: '80vh', overflowY: 'auto' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <HelpCircle size={18} style={{ color: 'var(--accent-cyan)' }} />
                Question Bank ({questions.length})
              </h3>

              {questions.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem' }}>No questions in the bank yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {questions.map((q) => {
                    const subName = subjects.find(s => s.id === q.subject_id)?.name || 'Subject';
                    let optsText = [];
                    try {
                      if (q.options) optsText = JSON.parse(q.options);
                    } catch (_) {}

                    return (
                      <div key={q.id} style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.01)', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                          <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>{subName}</span>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>{q.type.toUpperCase()}</span>
                            <span className="badge" style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.05)' }}>{q.points} pt</span>
                            <button 
                              onClick={() => handleDeleteQuestion(q.id)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--accent-rose)', cursor: 'pointer', padding: '0.2rem' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <p style={{ fontWeight: '600', fontSize: '0.95rem', marginBottom: '0.5rem' }}>{q.text}</p>
                        
                        {q.reference_file_url && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', margin: '0.4rem 0' }}>
                            📁 <strong>Reference File:</strong> <a href={`http://localhost:8000${q.reference_file_url}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Download / View Attachment</a>
                          </div>
                        )}
                        
                        {optsText.length > 0 && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', paddingLeft: '0.8rem', borderLeft: '2px solid var(--border-glass)', margin: '0.5rem 0' }}>
                            {optsText.map((o, idx) => (
                              <div key={idx} style={{ 
                                color: String(q.correct_answer).toLowerCase().includes(String(o).toLowerCase()) ? 'var(--accent-emerald)' : 'inherit',
                                fontWeight: String(q.correct_answer).toLowerCase().includes(String(o).toLowerCase()) ? '700' : 'normal'
                              }}>
                                • {o} {String(q.correct_answer).toLowerCase().includes(String(o).toLowerCase()) && '✓'}
                              </div>
                            ))}
                          </div>
                        )}

                        {q.model_answer && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--accent-purple)', background: 'rgba(157, 78, 221, 0.04)', padding: '0.4rem 0.6rem', borderRadius: '4px', marginTop: '0.5rem' }}>
                            <strong>Rubric:</strong> {q.model_answer}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* Exams Scheduler Tab */}
        {activeTab === 'exams' && (
          <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
            
            {/* Create Exam Scheduler Form */}
            <div className="glass-panel" style={{ padding: '2rem', textAlign: 'left', height: 'fit-content' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={18} style={{ color: 'var(--accent-cyan)' }} />
                Schedule New Exam
              </h3>

              <form onSubmit={handleCreateExam} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Exam Title</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. Midterm Algorithms, Final Data Structures..."
                    value={exTitle}
                    onChange={(e) => setExTitle(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Subject Category</label>
                  <select 
                    className="glass-input" 
                    value={exSubjectId}
                    onChange={(e) => setExSubjectId(e.target.value)}
                    required
                  >
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.id} style={{ background: 'var(--bg-secondary)', color: 'white' }}>{sub.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Duration (min)</label>
                    <input
                      type="number"
                      className="glass-input"
                      value={exDuration}
                      onChange={(e) => setExDuration(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Total Questions</label>
                    <input
                      type="number"
                      className="glass-input"
                      value={exCount}
                      onChange={(e) => setExCount(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Negative Penalty per Wrong Answer</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    className="glass-input"
                    value={exNegative}
                    onChange={(e) => setExNegative(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', margin: '0.5rem 0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={exRandomQ}
                      onChange={(e) => setExRandomQ(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    Randomize Questions order
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={exRandomO}
                      onChange={(e) => setExRandomO(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    Randomize Options order
                  </label>
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Exam Starts At</label>
                  <input
                    type="datetime-local"
                    className="glass-input"
                    value={exStart}
                    onChange={(e) => setExStart(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Exam Ends At</label>
                  <input
                    type="datetime-local"
                    className="glass-input"
                    value={exEnd}
                    onChange={(e) => setExEnd(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem' }}>
                  <Plus size={16} /> Schedule Exam Session
                </button>
              </form>
            </div>

            {/* Scheduled Exams List */}
            <div className="glass-panel" style={{ padding: '2rem', textAlign: 'left' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={18} style={{ color: 'var(--accent-purple)' }} />
                Scheduled Exams ({exams.length})
              </h3>

              {exams.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem' }}>No exams scheduled currently.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {exams.map((ex) => {
                    const sub = subjects.find(s => s.id === ex.subject_id);
                    return (
                      <div key={ex.id} style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.01)', borderRadius: '10px', border: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <span style={{ fontWeight: '700', fontSize: '1.05rem', display: 'block' }}>{ex.title}</span>
                          <span className="badge badge-purple" style={{ fontSize: '0.65rem', margin: '0.3rem 0' }}>{sub?.name || 'Subject'}</span>
                          
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.5rem' }}>
                            <span><strong>Duration:</strong> {ex.duration_minutes} minutes</span>
                            <span><strong>Questions:</strong> {ex.total_questions} (Pen: -{ex.negative_marking_val})</span>
                            <span><strong>Start:</strong> {new Date(ex.start_time).toLocaleString()}</span>
                            <span><strong>End:</strong> {new Date(ex.end_time).toLocaleString()}</span>
                          </div>
                        </div>

                        <button 
                          onClick={() => handleDeleteExam(ex.id)}
                          className="btn-secondary" 
                          style={{ padding: '0.35rem', color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.2)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* Exam Questions Tab */}
        {activeTab === 'exam_questions' && (
          <div className="glass-panel animate-fade-in" style={{ padding: '2rem', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0 }}>Exam Paper Content Checker</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Review the pool of questions linked to the subject category of an exam.</p>
              </div>

              <div>
                <select 
                  className="glass-input" 
                  value={selectedExamForQuestions}
                  onChange={(e) => setSelectedExamForQuestions(e.target.value)}
                  style={{ width: '280px', height: '38px', fontSize: '0.85rem' }}
                >
                  <option value="">Select Scheduled Exam...</option>
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id} style={{ background: 'var(--bg-secondary)', color: 'white' }}>{ex.title}</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedExamForQuestions && selectedExamObj ? (
              <div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-glass)', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
                    <span><strong>Exam Title:</strong> {selectedExamObj.title}</span>
                    <span><strong>Subject Category:</strong> {subjects.find(s => s.id === selectedExamObj.subject_id)?.name}</span>
                    <span><strong>Questions Needed:</strong> {selectedExamObj.total_questions}</span>
                    <span><strong>Questions in Bank:</strong> {examQuestions.length}</span>
                  </div>
                </div>

                {examQuestions.length === 0 ? (
                  <div className="badge-rose" style={{ padding: '1rem', borderRadius: '6px', fontSize: '0.9rem', color: 'var(--accent-rose)' }}>
                    Warning: There are no questions in this subject's question bank! Students will not be able to load this exam!
                  </div>
                ) : examQuestions.length < selectedExamObj.total_questions ? (
                  <div className="badge-amber" style={{ padding: '1rem', borderRadius: '6px', fontSize: '0.9rem', color: 'var(--accent-amber)', marginBottom: '1rem' }}>
                    Caution: Question bank only contains {examQuestions.length} questions, which is less than the required {selectedExamObj.total_questions} questions for this exam. Please add more questions.
                  </div>
                ) : (
                  <div className="badge-emerald" style={{ padding: '1rem', borderRadius: '6px', fontSize: '0.9rem', color: 'var(--accent-emerald)', marginBottom: '1rem' }}>
                    Optimal Status: Sufficient questions available to perform random drawing for sessions.
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
                  {examQuestions.map((q, idx) => {
                    let optsList = [];
                    try {
                      if (q.options) optsList = JSON.parse(q.options);
                    } catch (_) {}

                    return (
                      <div key={q.id} style={{ padding: '1rem 1.25rem', background: 'rgba(255,255,255,0.01)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Q{idx + 1}. <span className="badge badge-cyan" style={{ fontSize: '0.65rem', marginLeft: '0.5rem' }}>{q.type.toUpperCase()}</span></span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Points: {q.points}</span>
                        </div>
                        <p style={{ fontWeight: '500', fontSize: '0.95rem' }}>{q.text}</p>
                        
                        {optsList.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.5rem', paddingLeft: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {optsList.map((o, oidx) => (
                              <span key={oidx} style={{
                                color: String(q.correct_answer).toLowerCase().includes(String(o).toLowerCase()) ? 'var(--accent-emerald)' : 'inherit',
                                fontWeight: String(q.correct_answer).toLowerCase().includes(String(o).toLowerCase()) ? 'bold' : 'normal'
                              }}>
                                • {o} {String(q.correct_answer).toLowerCase().includes(String(o).toLowerCase()) && '✓'}
                              </span>
                            ))}
                          </div>
                        )}

                        {q.model_answer && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--accent-purple)', background: 'rgba(157, 78, 221, 0.04)', padding: '0.3rem 0.5rem', borderRadius: '4px', marginTop: '0.5rem' }}>
                            <strong>Model Rubric:</strong> {q.model_answer}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', padding: '4rem 0', textAlign: 'center' }}>
                Please select a scheduled exam from the dropdown to audit its question pool.
              </p>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
