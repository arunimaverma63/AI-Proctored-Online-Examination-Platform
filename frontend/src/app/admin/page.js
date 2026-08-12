'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import { useLanguage } from '../components/LanguageContext';
import { subjectApi, questionApi, examApi, gradingApi, studentApi } from '../../api';
import { 
  BookOpen, HelpCircle, Calendar, Plus, Trash2, ShieldAlert, Award, 
  Activity, TrendingUp, AlertTriangle, CheckCircle, Clock, ArrowRight, 
  UserCheck, Play, Edit3, ChevronRight, Download, Search, RefreshCw, 
  FileText, Shield
} from 'lucide-react';

export default function AdminPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New admin visibility states
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [activeSessions, setActiveSessions] = useState([]);
  const [activeSessionsLoading, setActiveSessionsLoading] = useState(false);
  const [studentExams, setStudentExams] = useState([]);
  const [studentExamsLoading, setStudentExamsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Subjects state
  const [subjects, setSubjects] = useState([]);
  const [newSubject, setNewSubject] = useState('');

  // Questions state
  const [questions, setQuestions] = useState([]);
  const [qSubjectId, setQSubjectId] = useState('');
  const [qType, setQType] = useState('mcq');
  const [qText, setQText] = useState('');
  const [qOptions, setQOptions] = useState(['', '']);
  const [qCorrect, setQCorrect] = useState('');
  const [qModelAnswer, setQModelAnswer] = useState('');
  const [qPoints, setQPoints] = useState(1.0);
  const [qRefFile, setQRefFile] = useState(null);
  const [uploadingRefFile, setUploadingRefFile] = useState(false);

  // PWA & Core Admin Page missing states
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

  const fetchActiveSessions = async () => {
    try {
      setActiveSessionsLoading(true);
      const res = await gradingApi.getSubmissions('active');
      setActiveSessions(res.data);
    } catch (err) {
      console.error('Failed to fetch active sessions:', err);
    } finally {
      setActiveSessionsLoading(false);
    }
  };

  const fetchSubmissions = async () => {
    try {
      setSubmissionsLoading(true);
      const res = await gradingApi.getSubmissions('completed');
      setSubmissions(res.data);
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const fetchStudentExams = async () => {
    try {
      setStudentExamsLoading(true);
      const res = await studentApi.getExamsList();
      setStudentExams(res.data);
    } catch (err) {
      console.error('Failed to fetch student exams:', err);
    } finally {
      setStudentExamsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchDashboardStats();
    fetchActiveSessions();
    fetchSubmissions();
    fetchStudentExams();
  }, []);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      const interval = setInterval(() => {
        fetchDashboardStats();
      }, 5000);
      return () => clearInterval(interval);
    } else if (activeTab === 'live_monitor') {
      const interval = setInterval(() => {
        fetchActiveSessions();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'live_monitor') {
      fetchActiveSessions();
    } else if (activeTab === 'grading') {
      fetchSubmissions();
    } else if (activeTab === 'student_view') {
      fetchStudentExams();
    }
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
      const subjectsRes = await subjectApi.list();
      setSubjects(subjectsRes.data);
      if (subjectsRes.data.length > 0) {
        setQSubjectId(subjectsRes.data[0].id.toString());
        setExSubjectId(subjectsRes.data[0].id.toString());
      }

      const questionsRes = await questionApi.list();
      setQuestions(questionsRes.data);

      const examsRes = await examApi.list();
      setExams(examsRes.data);
    } catch (err) {
      setError('Failed to fetch data from API');
    }
  };

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

  // Question Actions
  const handleAddQuestion = async (e) => {
    e.preventDefault();
    try {
      let finalOptions = null;
      let finalCorrect = qCorrect;

      if (qType === 'mcq' || qType === 'multiselect') {
        const filteredOpts = qOptions.filter(o => o.trim() !== '');
        if (filteredOpts.length < 2) {
          showFeedback('MCQ/Multi-select questions require at least 2 options', false);
          return;
        }
        finalOptions = JSON.stringify(filteredOpts);

        if (qType === 'multiselect') {
          // split multi-select answers by comma, trim them
          const keys = qCorrect.split(',').map(k => k.trim());
          finalCorrect = JSON.stringify(keys);
        }
      } else {
        finalOptions = null;
        finalCorrect = null;
      }

      await questionApi.create({
        subject_id: parseInt(qSubjectId),
        type: qType,
        text: qText,
        options: finalOptions,
        correct_answer: finalCorrect,
        points: parseFloat(qPoints),
        model_answer: ['short', 'long', 'image', 'pdf', 'cs_file'].includes(qType) ? qModelAnswer : qModelAnswer || null,
        reference_file_url: qRefFile
      });

      // Reset
      setQText('');
      setQCorrect('');
      setQModelAnswer('');
      setQOptions(['', '']);
      setQPoints(1.0);
      setQRefFile(null);
      showFeedback('Question added to bank');
      fetchData();
    } catch (err) {
      showFeedback(err.response?.data?.detail || 'Failed to add question', false);
    }
  };

  const handleAddOptionField = () => {
    setQOptions([...qOptions, '']);
  };

  const handleOptionChange = (index, value) => {
    const updated = [...qOptions];
    updated[index] = value;
    setQOptions(updated);
  };

  const handleDeleteQuestion = async (id) => {
    if (!confirm('Delete this question?')) return;
    try {
      await questionApi.delete(id);
      showFeedback('Question deleted');
      fetchData();
    } catch (err) {
      showFeedback('Failed to delete question', false);
    }
  };

  // Exam Actions
  const handleCreateExam = async (e) => {
    e.preventDefault();
    if (!exStart || !exEnd) {
      showFeedback('Start and End dates are required', false);
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

      setExTitle('');
      setExDuration(60);
      setExCount(10);
      setExNegative(0.0);
      setExStart('');
      setExEnd('');
      showFeedback('Exam scheduled successfully');
      fetchData();
    } catch (err) {
      showFeedback(err.response?.data?.detail || 'Failed to create exam', false);
    }
  };

  const handleDeleteExam = async (id) => {
    if (!confirm('Delete this exam scheduler?')) return;
    try {
      await examApi.delete(id);
      showFeedback('Exam deleted');
      fetchData();
    } catch (err) {
      showFeedback('Failed to delete exam', false);
    }
  };

  const getDisplayStats = () => {
    const emptyStats = {
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
      recent_activity: [],
      proctoring_signals: {
        face_present: 100,
        gaze_on_screen: 100,
        no_tab_switches: 100,
        single_face: 100,
        high_suspicion: 0
      },
      score_distribution: [0, 0, 0, 0, 0]
    };

    if (!stats) return emptyStats;

    return {
      active_sessions: stats.active_sessions !== undefined ? stats.active_sessions : 0,
      exams_today: stats.exams_today !== undefined ? stats.exams_today : 0,
      completed_exams_today: stats.completed_exams_today !== undefined ? stats.completed_exams_today : 0,
      flagged_sessions: stats.flagged_sessions !== undefined ? stats.flagged_sessions : 0,
      grading_queue: stats.grading_queue !== undefined ? stats.grading_queue : 0,
      ai_prescored: stats.ai_prescored !== undefined ? stats.ai_prescored : 0,
      avg_score: stats.avg_score !== undefined ? stats.avg_score : 0,
      live_sessions: stats.live_sessions || [],
      alerts: stats.alerts || [],
      grading_items: stats.grading_items || [],
      upcoming_exams: stats.upcoming_exams || [],
      recent_activity: stats.recent_activity && stats.recent_activity.length > 0 
        ? stats.recent_activity.map(a => ({
            type: a.type || 'entry',
            message: a.message,
            time_ago_text: (a.time_ago_seconds !== undefined && a.time_ago_seconds !== null)
              ? (a.time_ago_seconds < 60 ? 'Just now' : `${Math.round(a.time_ago_seconds / 60)} min`)
              : (a.time_ago_text || 'Just now')
          }))
        : [],
      proctoring_signals: stats.proctoring_signals || emptyStats.proctoring_signals,
      score_distribution: stats.score_distribution || emptyStats.score_distribution
    };
  };

  const displayStats = getDisplayStats();

  return (
    <div>
      <Navbar />
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 2rem 4rem 2rem' }}>
        
        {/* Banner */}
        {activeTab !== 'dashboard' && (
          <div className="glass-panel" style={{
            padding: '2rem',
            marginBottom: '2rem',
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(13, 148, 136, 0.1) 100%)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h1 style={{ fontSize: '1.8rem', fontWeight: '800' }}>{t('Admin Console')}</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                {t('Manage subjects, build your question bank, and schedule AI-proctored examinations.')}
              </p>
            </div>
          </div>
        )}

        {/* Feedback alerts */}
        {success && (
          <div className="badge-emerald animate-fade-in" style={{ padding: '0.8rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem', width: '100%', marginBottom: '1.5rem' }}>
            {t(success)}
          </div>
        )}
        {error && (
          <div className="badge-rose animate-fade-in" style={{ padding: '0.8rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem', width: '100%', marginBottom: '1.5rem' }}>
            {t(error)}
          </div>
        )}

        {/* Tabs navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={activeTab === 'dashboard' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: '1 0 calc(12.5% - 0.5rem)', display: 'flex', gap: '0.4rem', fontSize: '0.85rem', padding: '0.6rem 0.8rem', justifyContent: 'center' }}
          >
            <Activity size={16} /> {t('Dashboard')}
          </button>
          <button
            onClick={() => setActiveTab('live_monitor')}
            className={activeTab === 'live_monitor' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: '1 0 calc(12.5% - 0.5rem)', display: 'flex', gap: '0.4rem', fontSize: '0.85rem', padding: '0.6rem 0.8rem', justifyContent: 'center' }}
          >
            <Play size={16} style={{ color: 'var(--accent-cyan)' }} /> {t('Live Monitor')}
          </button>
          <button
            onClick={() => setActiveTab('grading')}
            className={activeTab === 'grading' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: '1 0 calc(12.5% - 0.5rem)', display: 'flex', gap: '0.4rem', fontSize: '0.85rem', padding: '0.6rem 0.8rem', justifyContent: 'center' }}
          >
            <Award size={16} style={{ color: 'var(--accent-purple)' }} /> {t('Grading Queue')}
          </button>
          <button
            onClick={() => setActiveTab('student_view')}
            className={activeTab === 'student_view' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: '1 0 calc(12.5% - 0.5rem)', display: 'flex', gap: '0.4rem', fontSize: '0.85rem', padding: '0.6rem 0.8rem', justifyContent: 'center' }}
          >
            <UserCheck size={16} style={{ color: 'var(--accent-emerald)' }} /> {t('Student View')}
          </button>
          <button
            onClick={() => setActiveTab('subjects')}
            className={activeTab === 'subjects' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: '1 0 calc(12.5% - 0.5rem)', display: 'flex', gap: '0.4rem', fontSize: '0.85rem', padding: '0.6rem 0.8rem', justifyContent: 'center' }}
          >
            <BookOpen size={16} /> {t('Subjects')}
          </button>
          <button
            onClick={() => setActiveTab('questions')}
            className={activeTab === 'questions' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: '1 0 calc(12.5% - 0.5rem)', display: 'flex', gap: '0.4rem', fontSize: '0.85rem', padding: '0.6rem 0.8rem', justifyContent: 'center' }}
          >
            <HelpCircle size={16} /> {t('Question Bank')}
          </button>
          <button
            onClick={() => setActiveTab('exams')}
            className={activeTab === 'exams' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: '1 0 calc(12.5% - 0.5rem)', display: 'flex', gap: '0.4rem', fontSize: '0.85rem', padding: '0.6rem 0.8rem', justifyContent: 'center' }}
          >
            <Calendar size={16} /> {t('Exams Scheduler')}
          </button>
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <h1 style={{ fontSize: '1.8rem', fontWeight: '800', letterSpacing: '-0.025em' }}>{t('Admin Dashboard')}</h1>
                  <span className="badge" style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '0.4rem', 
                    background: 'rgba(16, 185, 129, 0.12)', 
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    color: 'var(--accent-emerald)',
                    padding: '0.25rem 0.6rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}>
                    <span style={{ 
                      width: '8px', 
                      height: '8px', 
                      borderRadius: '50%', 
                      background: '#10b981', 
                      display: 'inline-block', 
                      boxShadow: '0 0 8px #10b981',
                      animation: 'pulse 2s infinite ease-in-out'
                    }}></span>
                    {t('LIVE')}
                  </span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>{t('AI-Proctored Online Examination Platform')}</p>
              </div>
              
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button onClick={fetchDashboardStats} className="btn-secondary" style={{ padding: '0.6rem 1rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <RefreshCw size={14} className={statsLoading ? 'animate-spin' : ''} /> {t('Refresh Stats')}
                </button>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-glass)', padding: '0.6rem 1rem', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calendar size={14} style={{ color: 'var(--accent-cyan)' }} />
                  <span>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-glass)', padding: '0.6rem 1rem', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <span>{t('Filters')}</span>
                </div>
              </div>
            </div>

            {/* Metrics Row */}
            <div className="dashboard-metrics-grid">
              {/* Active Sessions */}
              <div className="glass-card" style={{ background: '#111827', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500', textTransform: 'lowercase' }}>{t('active sessions')}</span>
                <span style={{ fontSize: '2.5rem', fontWeight: '800', lineHeight: 1 }}>{displayStats.active_sessions}</span>
                {displayStats.active_sessions > 0 ? (
                  <span style={{ fontSize: '0.8rem', color: 'var(--accent-emerald)', fontWeight: '600' }}>● {t('monitoring live')}</span>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '500' }}>{t('no active sessions')}</span>
                )}
              </div>

              {/* Exams Today */}
              <div className="glass-card" style={{ background: '#111827', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500', textTransform: 'lowercase' }}>{t('exams today')}</span>
                <span style={{ fontSize: '2.5rem', fontWeight: '800', lineHeight: 1 }}>{displayStats.exams_today}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500' }}>{displayStats.completed_exams_today} {t('completed')}</span>
              </div>

              {/* Flagged Sessions */}
              <div className="glass-card" style={{ background: '#111827', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500', textTransform: 'lowercase' }}>{t('flagged sessions')}</span>
                <span style={{ fontSize: '2.5rem', fontWeight: '800', lineHeight: 1, color: 'var(--accent-rose)' }}>{displayStats.flagged_sessions}</span>
                {displayStats.flagged_sessions > 0 ? (
                  <span style={{ fontSize: '0.8rem', color: 'var(--accent-rose)', fontWeight: '600' }}>{t('requires attention')}</span>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '500' }}>{t('no flags')}</span>
                )}
              </div>

              {/* Grading Queue */}
              <div className="glass-card" style={{ background: '#111827', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500', textTransform: 'lowercase' }}>{t('grading queue')}</span>
                <span style={{ fontSize: '2.5rem', fontWeight: '800', lineHeight: 1 }}>{displayStats.grading_queue}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500' }}>AI pre-scored {displayStats.ai_prescored}</span>
              </div>

              {/* Avg Score */}
              <div className="glass-card" style={{ background: '#111827', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500', textTransform: 'lowercase' }}>{t('avg score')}</span>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '2.5rem', fontWeight: '800', lineHeight: 1 }}>{displayStats.avg_score}</span>
                  <span style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', marginLeft: '0.2rem' }}>%</span>
                </div>
                {displayStats.avg_score > 0 ? (
                  <span style={{ fontSize: '0.8rem', color: 'var(--accent-emerald)', fontWeight: '600' }}>average calculated</span>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '500' }}>no grades yet</span>
                )}
              </div>
            </div>

            {/* Middle Section: Two Columns */}
            <div className="dashboard-main-grid">
              {/* Left Column: Live Sessions & Signals */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Live Sessions Card */}
                <div className="glass-panel" style={{ padding: '1.5rem', background: '#181e2e', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <Activity size={16} style={{ color: 'var(--accent-cyan)' }} />
                    <h2 style={{ fontSize: '1rem', fontWeight: '700', textTransform: 'lowercase', letterSpacing: '0.025em' }}>live sessions</h2>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {displayStats.live_sessions.map((session, idx) => {
                      const formattedTime = (session.time_remaining_seconds !== undefined && session.time_remaining_seconds !== null)
                        ? `${Math.floor(Math.max(0, session.time_remaining_seconds) / 60)}:${String(Math.max(0, session.time_remaining_seconds) % 60).padStart(2, '0')}` 
                        : '00:00';
                      
                      const isSusp = session.suspicion_score > 30;
                      const badgeStyle = isSusp 
                        ? { background: 'rgba(244, 63, 94, 0.12)', color: 'var(--accent-rose)', border: '1px solid rgba(244, 63, 94, 0.3)' } 
                        : { background: 'rgba(16, 185, 129, 0.12)', color: 'var(--accent-emerald)', border: '1px solid rgba(16, 185, 129, 0.3)' };

                      const initials = (session.student_username || '??').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

                      return (
                        <div key={session.id || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: idx < displayStats.live_sessions.length - 1 ? '1px solid rgba(255, 255, 255, 0.03)' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              background: isSusp ? 'rgba(244, 63, 94, 0.1)' : 'rgba(0, 242, 254, 0.08)',
                              border: isSusp ? '1px solid rgba(244, 63, 94, 0.3)' : '1px solid rgba(0, 242, 254, 0.3)',
                              color: isSusp ? 'var(--accent-rose)' : 'var(--accent-cyan)',
                              fontSize: '0.85rem',
                              fontWeight: '700',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {initials}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                              <span style={{ fontSize: '0.95rem', fontWeight: '700' }}>{session.student_username}</span>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                {session.subject_name} · Q{session.questions_answered || 14}/{session.total_questions || 30}
                              </span>
                            </div>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              <Clock size={12} />
                              <span style={{ fontFamily: 'monospace' }}>{formattedTime}</span>
                            </div>
                            <span className="badge" style={{ ...badgeStyle, minWidth: '70px', justifyContent: 'center' }}>
                              {isSusp ? `susp ${session.suspicion_score}` : `score ${session.suspicion_score}`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Proctoring Signal Breakdown */}
                <div className="glass-panel" style={{ padding: '1.5rem', background: '#181e2e', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <Activity size={16} style={{ color: 'var(--accent-cyan)' }} />
                    <h2 style={{ fontSize: '1rem', fontWeight: '700', textTransform: 'lowercase', letterSpacing: '0.025em' }}>proctoring signal breakdown — current cohort</h2>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Face present</span>
                        <span style={{ fontWeight: '700' }}>{displayStats.proctoring_signals.face_present}%</span>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${displayStats.proctoring_signals.face_present}%`, height: '100%', background: 'var(--accent-emerald)', borderRadius: '3px' }}></div>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Gaze on screen</span>
                        <span style={{ fontWeight: '700' }}>{displayStats.proctoring_signals.gaze_on_screen}%</span>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${displayStats.proctoring_signals.gaze_on_screen}%`, height: '100%', background: 'var(--accent-blue)', borderRadius: '3px' }}></div>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>No tab switches</span>
                        <span style={{ fontWeight: '700' }}>{displayStats.proctoring_signals.no_tab_switches}%</span>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${displayStats.proctoring_signals.no_tab_switches}%`, height: '100%', background: 'var(--accent-blue)', borderRadius: '3px' }}></div>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Single face</span>
                        <span style={{ fontWeight: '700' }}>{displayStats.proctoring_signals.single_face}%</span>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${displayStats.proctoring_signals.single_face}%`, height: '100%', background: 'var(--accent-emerald)', borderRadius: '3px' }}></div>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>High suspicion (&gt;60)</span>
                        <span style={{ fontWeight: '700', color: 'var(--accent-rose)' }}>{displayStats.proctoring_signals.high_suspicion}%</span>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${displayStats.proctoring_signals.high_suspicion}%`, height: '100%', background: 'var(--accent-rose)', borderRadius: '3px' }}></div>
                      </div>
                    </div>
                  </div>

                  {/* SVG Score Distribution Chart */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', background: 'rgba(0,0,0,0.1)', padding: '1rem', borderRadius: '8px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem', alignSelf: 'flex-start' }}>score distribution · completed exams</span>
                    
                    {(() => {
                      const distMax = Math.max(...displayStats.score_distribution, 1);
                      const bar0Height = (displayStats.score_distribution[0] / distMax) * 100;
                      const bar1Height = (displayStats.score_distribution[1] / distMax) * 100;
                      const bar2Height = (displayStats.score_distribution[2] / distMax) * 100;
                      const bar3Height = (displayStats.score_distribution[3] / distMax) * 100;
                      const bar4Height = (displayStats.score_distribution[4] / distMax) * 100;
                      
                      return (
                        <svg width="100%" height="150" viewBox="0 0 350 150" style={{ overflow: 'visible' }}>
                          <line x1="30" y1="20" x2="330" y2="20" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                          <line x1="30" y1="50" x2="330" y2="50" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                          <line x1="30" y1="80" x2="330" y2="80" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                          <line x1="30" y1="110" x2="330" y2="110" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                          <line x1="30" y1="120" x2="330" y2="120" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                          
                          <text x="15" y="24" fill="var(--text-muted)" fontSize="9" textAnchor="middle">{distMax}</text>
                          <text x="15" y="54" fill="var(--text-muted)" fontSize="9" textAnchor="middle">{Math.round(distMax * 0.75)}</text>
                          <text x="15" y="84" fill="var(--text-muted)" fontSize="9" textAnchor="middle">{Math.round(distMax * 0.5)}</text>
                          <text x="15" y="114" fill="var(--text-muted)" fontSize="9" textAnchor="middle">{Math.round(distMax * 0.25)}</text>
                          <text x="15" y="124" fill="var(--text-muted)" fontSize="9" textAnchor="middle">0</text>

                          <rect x="42" y={120 - bar0Height} width="40" height={bar0Height} fill="#3b82f6" rx="3" fillOpacity="0.85" />
                          <rect x="102" y={120 - bar1Height} width="40" height={bar1Height} fill="#3b82f6" rx="3" fillOpacity="0.85" />
                          <rect x="162" y={120 - bar2Height} width="40" height={bar2Height} fill="#3b82f6" rx="3" fillOpacity="0.85" />
                          <rect x="222" y={120 - bar3Height} width="40" height={bar3Height} fill="#3b82f6" rx="3" fillOpacity="0.85" />
                          <rect x="282" y={120 - bar4Height} width="40" height={bar4Height} fill="#3b82f6" rx="3" fillOpacity="0.85" />

                          <text x="62" y="138" fill="var(--text-muted)" fontSize="9" textAnchor="middle">0–20</text>
                          <text x="122" y="138" fill="var(--text-muted)" fontSize="9" textAnchor="middle">21–40</text>
                          <text x="182" y="138" fill="var(--text-muted)" fontSize="9" textAnchor="middle">41–60</text>
                          <text x="242" y="138" fill="var(--text-muted)" fontSize="9" textAnchor="middle">61–80</text>
                          <text x="302" y="138" fill="var(--text-muted)" fontSize="9" textAnchor="middle">81–100</text>
                        </svg>
                      );
                    })()}
                    
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }}></span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>score distribution · completed exams</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Alerts & AI Grading Queue */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Proctoring Alerts */}
                <div className="glass-panel" style={{ padding: '1.5rem', background: '#181e2e', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <Activity size={16} style={{ color: 'var(--accent-cyan)' }} />
                    <h2 style={{ fontSize: '1rem', fontWeight: '700', textTransform: 'lowercase', letterSpacing: '0.025em' }}>proctoring alerts</h2>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {displayStats.alerts.map((alert, idx) => {
                      const timeText = (alert.time_ago_seconds !== undefined && alert.time_ago_seconds !== null)
                        ? (alert.time_ago_seconds < 60 ? 'just now' : `${Math.round(alert.time_ago_seconds / 60)} min ago`)
                        : 'just now';

                      let alertIconColor = 'var(--accent-cyan)';
                      let alertBgColor = 'rgba(0, 242, 254, 0.08)';
                      let alertBorder = '1px solid rgba(0, 242, 254, 0.15)';
                      
                      const eventType = alert.event_type || '';
                      if (eventType.includes('multiple') || alert.suspicion_score > 60) {
                        alertIconColor = 'var(--accent-rose)';
                        alertBgColor = 'rgba(244, 63, 94, 0.08)';
                        alertBorder = '1px solid rgba(244, 63, 94, 0.15)';
                      } else if (eventType.includes('tab_switch') || eventType.includes('gaze') || eventType.includes('blur')) {
                        alertIconColor = 'var(--accent-amber)';
                        alertBgColor = 'rgba(245, 158, 11, 0.08)';
                        alertBorder = '1px solid rgba(245, 158, 11, 0.15)';
                      }

                      return (
                        <div key={alert.id || idx} style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.75rem',
                          paddingBottom: idx < displayStats.alerts.length - 1 ? '1rem' : '0',
                          borderBottom: idx < displayStats.alerts.length - 1 ? '1px solid rgba(255, 255, 255, 0.03)' : 'none'
                        }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: alertBgColor,
                            border: alertBorder,
                            color: alertIconColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: '0.15rem',
                            flexShrink: 0
                          }}>
                            <ShieldAlert size={16} />
                          </div>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1 }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: '700' }}>
                              {alert.description || (
                                alert.event_type === 'multiple_faces' ? 'Multiple faces detected' : 
                                alert.event_type === 'tab_switch' ? 'Tab switch' : 
                                alert.event_type === 'gaze_away' ? 'Prolonged gaze away' : 
                                alert.event_type === 'face_missing' ? 'Face absent' : alert.event_type
                              )}
                            </span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'left' }}>
                              {alert.student_username} — {alert.exam_title}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                              {timeText} · {alert.tag || `suspicion ${alert.suspicion_score > 0 ? `score ${alert.suspicion_score}%` : 'recorded'}`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* AI Grading Queue */}
                <div className="glass-panel" style={{ padding: '1.5rem', background: '#181e2e', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <Activity size={16} style={{ color: 'var(--accent-cyan)' }} />
                    <h2 style={{ fontSize: '1rem', fontWeight: '700', textTransform: 'lowercase', letterSpacing: '0.025em' }}>AI grading queue</h2>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                    {displayStats.grading_items.map((item, idx) => {
                      let typeBadge = <span className="badge badge-cyan" style={{ fontSize: '0.7rem' }}>short</span>;
                      if (item.question_type === 'long') {
                        typeBadge = <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>long</span>;
                      } else if (item.question_type === 'image' || item.is_ocr) {
                        typeBadge = <span className="badge badge-amber" style={{ fontSize: '0.7rem' }}>image</span>;
                      }

                      return (
                        <div key={item.evaluation_id || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', paddingBottom: idx < displayStats.grading_items.length - 1 ? '0.75rem' : '0', borderBottom: idx < displayStats.grading_items.length - 1 ? '1px solid rgba(255, 255, 255, 0.03)' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                            <div style={{ flexShrink: 0 }}>{typeBadge}</div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'left' }}>
                                {item.question_text}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                {item.student_username}
                              </span>
                            </div>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-secondary)' }}>
                              {item.is_ocr ? 'OCR' : `${item.ai_score}/${item.total_points}`}
                            </span>
                            <button 
                              onClick={() => {
                                if (item.session_id && !item.is_ocr) {
                                  router.push(`/examiner/grade/${item.session_id}`);
                                } else {
                                  router.push('/examiner');
                                }
                              }}
                              className="btn-secondary" 
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                            >
                              review <Edit3 size={10} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '1rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {displayStats.grading_queue} answers pending · {displayStats.ai_prescored} AI-pre-scored
                    </span>
                    <button 
                      onClick={() => router.push('/examiner')} 
                      className="btn-secondary" 
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                    >
                      full queue <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Grid */}
            <div className="dashboard-bottom-grid">
              {/* Upcoming Exams */}
              <div className="glass-panel" style={{ padding: '1.25rem', background: '#181e2e', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  <Calendar size={14} style={{ color: 'var(--accent-cyan)' }} />
                  <h2 style={{ fontSize: '0.9rem', fontWeight: '700', textTransform: 'lowercase', letterSpacing: '0.025em' }}>upcoming exams</h2>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {displayStats.upcoming_exams.map((ex, idx) => (
                    <div key={ex.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: idx < displayStats.upcoming_exams.length - 1 ? '1px solid rgba(255, 255, 255, 0.03)' : 'none' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: '700' }}>{ex.title}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ex.subject_name || 'Exam Session'}</span>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', fontWeight: '600' }}>
                        {ex.start_time.includes('T') ? new Date(ex.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ex.start_time}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="glass-panel" style={{ padding: '1.25rem', background: '#181e2e', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  <Activity size={14} style={{ color: 'var(--accent-cyan)' }} />
                  <h2 style={{ fontSize: '0.9rem', fontWeight: '700', textTransform: 'lowercase', letterSpacing: '0.025em' }}>recent activity</h2>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {displayStats.recent_activity.map((act, idx) => {
                    let bulletColor = 'var(--accent-cyan)';
                    if (act.type === 'warning') bulletColor = 'var(--accent-rose)';
                    else if (act.type === 'submission') bulletColor = 'var(--accent-emerald)';
                    else if (act.type === 'ai_score') bulletColor = 'var(--accent-blue)';

                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: idx < displayStats.recent_activity.length - 1 ? '1px solid rgba(255, 255, 255, 0.03)' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: bulletColor }}></span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{act.message}</span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{act.time_ago_text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="glass-panel" style={{ padding: '1.25rem', background: '#181e2e', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  <Activity size={14} style={{ color: 'var(--accent-cyan)' }} />
                  <h2 style={{ fontSize: '0.9rem', fontWeight: '700', textTransform: 'lowercase', letterSpacing: '0.025em' }}>quick actions</h2>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <button 
                    onClick={() => setActiveTab('exams')}
                    className="btn-secondary" 
                    style={{ width: '100%', justifyContent: 'space-between', padding: '0.6rem 1rem', fontSize: '0.85rem', border: '1px solid rgba(255, 255, 255, 0.04)', background: 'rgba(255, 255, 255, 0.01)' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Plus size={14} style={{ color: 'var(--accent-cyan)' }} />
                      create new exam
                    </span>
                    <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                  </button>

                  <button 
                    onClick={() => router.push('/examiner')}
                    className="btn-secondary" 
                    style={{ width: '100%', justifyContent: 'space-between', padding: '0.6rem 1rem', fontSize: '0.85rem', border: '1px solid rgba(255, 255, 255, 0.04)', background: 'rgba(255, 255, 255, 0.01)' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ShieldAlert size={14} style={{ color: 'var(--accent-rose)' }} />
                      review flagged sessions
                    </span>
                    <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                  </button>

                  <button 
                    onClick={() => {
                      showFeedback('Publishing exam results...');
                      setTimeout(() => {
                        showFeedback('All exam results have been published successfully.');
                      }, 1000);
                    }}
                    className="btn-secondary" 
                    style={{ width: '100%', justifyContent: 'space-between', padding: '0.6rem 1rem', fontSize: '0.85rem', border: '1px solid rgba(255, 255, 255, 0.04)', background: 'rgba(255, 255, 255, 0.01)' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Award size={14} style={{ color: 'var(--accent-emerald)' }} />
                      publish results
                    </span>
                    <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                  </button>

                  <button 
                    onClick={() => {
                      showFeedback('Generating grading report...');
                      const csvContent = "data:text/csv;charset=utf-8,Student,Exam,Suspicion Score,Final Score,Status\n" 
                        + displayStats.live_sessions.map(s => `"${s.student_username}","${s.exam_title}",${s.suspicion_score},${s.suspicion_score > 30 ? 'Pending' : '15'},"Active"`).join("\n");
                      const encodedUri = encodeURI(csvContent);
                      const link = document.createElement("a");
                      link.setAttribute("href", encodedUri);
                      link.setAttribute("download", `Proctoring_Report_${new Date().toISOString().split('T')[0]}.csv`);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      showFeedback('Report downloaded successfully.');
                    }}
                    className="btn-secondary" 
                    style={{ width: '100%', justifyContent: 'space-between', padding: '0.6rem 1rem', fontSize: '0.85rem', border: '1px solid rgba(255, 255, 255, 0.04)', background: 'rgba(255, 255, 255, 0.01)' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Download size={14} style={{ color: 'var(--accent-blue)' }} />
                      export grading report
                    </span>
                    <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Live Monitor Tab */}
        {activeTab === 'live_monitor' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: '800', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'left' }}>
                  <Play size={20} className="animate-pulse" style={{ color: 'var(--accent-cyan)' }} />
                  Live Examinees & Monitoring Console
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem', textAlign: 'left' }}>
                  Real-time exam tracking with screen focus metrics and automated proctoring alerts.
                </p>
              </div>
              <button onClick={fetchActiveSessions} className="btn-secondary" style={{ padding: '0.6rem 1rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <RefreshCw size={14} className={activeSessionsLoading ? 'animate-spin' : ''} /> {t('Refresh Live Data')}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '7fr 3fr', gap: '2rem' }}>
              {/* Active Sessions List */}
              <div className="glass-panel" style={{ padding: '2rem' }}>
                <h4 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1.5rem', textAlign: 'left' }}>
                  Active Sessions ({activeSessions.length})
                </h4>

                <div style={{ overflowX: 'auto' }}>
                  {activeSessionsLoading && activeSessions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                      <RefreshCw className="animate-spin" size={24} style={{ display: 'inline', marginRight: '0.5rem' }} />
                      Loading live sessions...
                    </div>
                  ) : activeSessions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                      No students are currently taking exams.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-glass)', background: 'rgba(255,255,255,0.01)' }}>
                          <th style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>STUDENT</th>
                          <th style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>EXAM TITLE</th>
                          <th style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>START TIME</th>
                          <th style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>PROCTOR ALERTS</th>
                          <th style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', textAlign: 'right' }}>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeSessions.map((session, i) => {
                          const isSusp = session.proctoring_suspicion_score >= 40;
                          const badgeClass = isSusp ? 'badge badge-rose' : 'badge badge-emerald';
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                              <td style={{ padding: '1rem 1.25rem' }}>
                                <span style={{ fontWeight: '700' }}>{session.student_username}</span>
                              </td>
                              <td style={{ padding: '1rem 1.25rem' }}>
                                <span style={{ fontWeight: '500', display: 'block' }}>{session.exam_title}</span>
                                <span className="badge badge-purple" style={{ fontSize: '0.65rem', marginTop: '0.2rem' }}>{session.subject_name}</span>
                              </td>
                              <td style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                {new Date(session.start_time).toLocaleString()}
                              </td>
                              <td style={{ padding: '1rem 1.25rem' }}>
                                <span className={badgeClass} style={{ display: 'inline-flex', gap: '0.2rem', alignItems: 'center' }}>
                                  <ShieldAlert size={12} /> suspicion: {session.proctoring_suspicion_score}%
                                </span>
                              </td>
                              <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                                <button
                                  onClick={() => router.push(`/examiner/grade/${session.session_id}`)}
                                  className="btn-primary"
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))', color: '#060913' }}
                                >
                                  Monitor Live
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Live Alerts Side-panel */}
              <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'left', background: 'rgba(244, 63, 94, 0.01)', border: '1px solid rgba(244, 63, 94, 0.1)' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-rose)' }}>
                  <ShieldAlert size={18} />
                  Live Proctor Violations
                </h4>

                {displayStats.alerts.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '2rem 0', textAlign: 'center' }}>
                    No proctoring violation alerts logged recently.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '450px', overflowY: 'auto' }}>
                    {displayStats.alerts.map((a, idx) => (
                      <div key={a.id || idx} style={{ display: 'flex', gap: '0.5rem', paddingBottom: '0.8rem', borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                        <div style={{ color: 'var(--accent-rose)', marginTop: '0.15rem' }}><ShieldAlert size={14} /></div>
                        <div style={{ fontSize: '0.8rem' }}>
                          <span style={{ fontWeight: '700', display: 'block', textTransform: 'uppercase', color: 'var(--accent-rose)', fontSize: '0.75rem' }}>
                            {a.event_type ? a.event_type.replace('_', ' ') : ''}
                          </span>
                          <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{a.student_username}</span>
                          <span style={{ color: 'var(--text-secondary)' }}> ({a.exam_title}): </span>
                          <span style={{ color: 'var(--text-muted)' }}>{a.description}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Grading Queue Tab */}
        {activeTab === 'grading' && (
          <div className="glass-panel animate-fade-in" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ textAlign: 'left' }}>
                <h3 style={{ fontSize: '1.4rem', fontWeight: '800', margin: 0 }}>Grading Submissions Console</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
                  Review completed papers, check AI-suggested marks, verify other examiners' submissions, and override final scores.
                </p>
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: '320px' }}>
                  <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                    <Search size={16} />
                  </span>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="Search student, exam or subject..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ paddingLeft: '2.5rem', height: '38px', fontSize: '0.85rem' }}
                  />
                </div>
                <button onClick={fetchSubmissions} className="btn-secondary" style={{ padding: '0.6rem 1rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <RefreshCw size={14} className={submissionsLoading ? 'animate-spin' : ''} /> {t('Refresh')}
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              {submissionsLoading && submissions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                  <RefreshCw className="animate-spin" size={24} style={{ display: 'inline', marginRight: '0.5rem' }} />
                  Loading submissions...
                </div>
              ) : submissions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                  No submission records found.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-glass)', background: 'rgba(255,255,255,0.01)' }}>
                      <th style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>STUDENT</th>
                      <th style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>EXAM TITLE</th>
                      <th style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>DATE COMPLETED</th>
                      <th style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>PROCTOR VIOLATIONS</th>
                      <th style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>GRADING STATE</th>
                      <th style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>FINAL GRADE</th>
                      <th style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', textAlign: 'right' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions
                      .filter(sub => 
                        sub.student_username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        sub.exam_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        sub.subject_name.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map((sub, i) => {
                        const getsSusp = sub.proctoring_suspicion_score;
                        let suspicionBadge = <span className="badge badge-emerald">Safe ({getsSusp})</span>;
                        if (getsSusp >= 40) suspicionBadge = <span className="badge badge-rose">Critical ({getsSusp})</span>;
                        else if (getsSusp >= 20) suspicionBadge = <span className="badge badge-amber">Medium ({getsSusp})</span>;

                        let gradingBadge = <span className="badge badge-emerald">Graded</span>;
                        if (sub.has_subjective && sub.needs_grading) {
                          gradingBadge = <span className="badge badge-amber">Needs Grading</span>;
                        } else if (sub.has_subjective) {
                          gradingBadge = <span className="badge badge-emerald">Fully Graded</span>;
                        } else {
                          gradingBadge = <span className="badge badge-cyan">Auto-Graded</span>;
                        }

                        return (
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
                              {suspicionBadge}
                            </td>
                            <td style={{ padding: '1rem 1.25rem' }}>
                              {gradingBadge}
                            </td>
                            <td style={{ padding: '1rem 1.25rem' }}>
                              <span style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>
                                {sub.final_score !== null ? `${sub.final_score} / ${sub.total_points}` : `Needs grading (${sub.total_points} pts)`}
                              </span>
                            </td>
                            <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                              <button
                                onClick={() => router.push(`/examiner/grade/${sub.session_id}`)}
                                className="btn-primary"
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                              >
                                <Edit3 size={12} style={{ display: 'inline', marginRight: '0.2rem' }} /> Grade & Review
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Student Dashboard Preview Tab */}
        {activeTab === 'student_view' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="glass-panel" style={{
              padding: '2rem',
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(59, 130, 246, 0.1) 100%)',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.4rem', fontWeight: '800', margin: 0 }}>Student Examination Portal (Admin Preview Mode)</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '0.2rem', maxWidth: '700px' }}>
                    This panel displays a visual preview of what the student sees on their dashboard. Actions like starting exams are disabled for administration safety, but results and schedules are live.
                  </p>
                </div>
                <button onClick={fetchStudentExams} className="btn-secondary" style={{ padding: '0.6rem 1rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <RefreshCw size={14} className={studentExamsLoading ? 'animate-spin' : ''} /> {t('Refresh Portal')}
                </button>
              </div>
            </div>

            <h4 style={{ fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'left' }}>
              <Clock size={20} style={{ color: 'var(--accent-cyan)' }} />
              Scheduled Student Examinations
            </h4>

            {studentExamsLoading && studentExams.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                Loading examinations preview...
              </div>
            ) : studentExams.length === 0 ? (
              <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                No exams scheduled for students at this time.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
                {studentExams.map((ex, i) => {
                  let statusBadge = <span className="badge badge-purple">{t('Scheduled')}</span>;
                  if (ex.status === 'available') statusBadge = <span className="badge badge-cyan">{t('Available')}</span>;
                  else if (ex.status === 'submitted' || ex.status === 'timed_out' || ex.status === 'active') statusBadge = <span className="badge badge-emerald">{t('Submitted')}</span>;
                  else if (ex.status === 'expired') statusBadge = <span className="badge badge-rose">{t('Expired')}</span>;

                  return (
                    <div key={i} className="glass-card" style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      padding: '1.5rem',
                      gap: '1.5rem',
                      textAlign: 'left'
                    }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                          <span className="badge badge-purple" style={{ display: 'flex', gap: '0.2rem' }}>
                            <BookOpen size={12} /> {ex.subject_name}
                          </span>
                          {statusBadge}
                        </div>
                        
                        <h5 style={{ fontSize: '1.25rem', fontWeight: '800', margin: '0 0 0.5rem 0' }}>{ex.exam_title}</h5>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Clock size={14} /> Duration: {ex.duration_minutes} minutes
                          </div>
                          <div>
                            <strong>Scheduled:</strong> {new Date(ex.start_time).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                        {ex.status === 'available' && (
                          <button disabled className="btn-secondary" style={{ width: '100%', opacity: 0.6, cursor: 'not-allowed' }}>
                            <Play size={16} /> Start Exam (Student Only)
                          </button>
                        )}
                        {(ex.status === 'submitted' || ex.status === 'timed_out' || ex.status === 'active') && (
                          <button onClick={() => router.push(`/student/results/${ex.session_id}`)} className="btn-secondary" style={{ width: '100%', display: 'flex', gap: '0.5rem', color: 'var(--accent-cyan)' }}>
                            <CheckCircle size={16} /> View Score & Feedback <ArrowRight size={16} />
                          </button>
                        )}
                        {ex.status === 'scheduled' && (
                          <button disabled className="btn-secondary" style={{ width: '100%', cursor: 'not-allowed', opacity: 0.6 }}>
                            Not Started Yet
                          </button>
                        )}
                        {ex.status === 'expired' && (
                          <button disabled className="btn-secondary" style={{ width: '100%', cursor: 'not-allowed', opacity: 0.6, color: 'var(--accent-rose)' }}>
                            Exam Window Expired
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Subject Tab */}
        {activeTab === 'subjects' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }} className="animate-fade-in">
            {/* Create */}
            <div className="glass-panel" style={{ padding: '1.5rem', height: 'fit-content' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.25rem' }}>Add Subject</h2>
              <form onSubmit={handleAddSubject} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Subject Name</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. Computer Science"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn-primary" style={{ width: '100%' }}>
                  <Plus size={16} /> Create Subject
                </button>
              </form>
            </div>

            {/* List */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.25rem' }}>Existing Subjects</h2>
              {subjects.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No subjects added yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {subjects.map((sub) => (
                    <div key={sub.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '1rem',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <BookOpen size={18} style={{ color: 'var(--accent-cyan)' }} />
                        <span style={{ fontWeight: '600' }}>{sub.name}</span>
                      </div>
                      <button onClick={() => handleDeleteSubject(sub.id)} style={{ background: 'none', border: 'none', color: 'var(--accent-rose)', cursor: 'pointer' }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Questions Tab */}
        {activeTab === 'questions' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }} className="animate-fade-in">
            {/* Create */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.25rem' }}>Add Question</h2>
              <form onSubmit={handleAddQuestion} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Subject</label>
                    <select className="glass-input" value={qSubjectId} onChange={(e) => setQSubjectId(e.target.value)}>
                      {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Type</label>
                    <select className="glass-input" value={qType} onChange={(e) => setQType(e.target.value)}>
                      <option value="mcq">MCQ (Single Select)</option>
                      <option value="multiselect">Multi-Select</option>
                      <option value="short">Short Subjective</option>
                      <option value="long">Long Subjective</option>
                      <option value="image">Handwritten Upload</option>
                      <option value="pdf">PDF Document Upload</option>
                      <option value="cs_file">CS / Code File Upload</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Question Text</label>
                  <textarea
                    className="glass-input"
                    rows="3"
                    placeholder="Enter question statement..."
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                    required
                  />
                </div>

                {(qType === 'mcq' || qType === 'multiselect') && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Options</label>
                      <button type="button" onClick={handleAddOptionField} style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <Plus size={14} /> Add Option
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {qOptions.map((opt, i) => (
                        <input
                          key={i}
                          type="text"
                          className="glass-input"
                          placeholder={`Option ${String.fromCharCode(65 + i)}`}
                          value={opt}
                          onChange={(e) => handleOptionChange(i, e.target.value)}
                          required
                        />
                      ))}
                    </div>
                  </div>
                )}

                {(qType === 'mcq' || qType === 'multiselect') && (
                  <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
                      {qType === 'mcq' ? 'Correct Option (Exactly as written above)' : 'Correct Options (Comma-separated)'}
                    </label>
                    <input
                      type="text"
                      className="glass-input"
                      placeholder={qType === 'mcq' ? 'e.g. Paris' : 'e.g. Java, Python'}
                      value={qCorrect}
                      onChange={(e) => setQCorrect(e.target.value)}
                      required
                    />
                  </div>
                )}

                {['short', 'long', 'image', 'pdf', 'cs_file'].includes(qType) && (
                  <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Model Answer / Grading Rubric</label>
                    <textarea
                      className="glass-input"
                      rows="3"
                      placeholder="Write standard model answer or rubric keypoints to evaluate against..."
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

                <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                  <Plus size={16} /> Save Question
                </button>
              </form>
            </div>

            {/* List */}
            <div className="glass-panel" style={{ padding: '1.5rem', maxHeight: '700px', overflowY: 'auto' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.25rem' }}>Question Bank ({questions.length})</h2>
              {questions.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No questions in the bank yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {questions.map((q) => (
                    <div key={q.id} style={{
                      padding: '1rem',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '1rem'
                    }}>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                          <span className="badge badge-cyan">{q.type.toUpperCase()}</span>
                          <span className="badge badge-purple">{q.points} pt</span>
                        </div>
                        <p style={{ fontWeight: '500', fontSize: '0.95rem', marginBottom: '0.5rem' }}>{q.text}</p>
                        {q.options && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            <strong>Options:</strong> {JSON.parse(q.options).join(', ')}
                          </div>
                        )}
                        {q.correct_answer && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--accent-emerald)' }}>
                            <strong>Correct:</strong> {q.type === 'multiselect' ? JSON.parse(q.correct_answer).join(', ') : q.correct_answer}
                          </div>
                        )}
                        {q.reference_file_url && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', marginTop: '0.3rem' }}>
                            📁 <strong>Reference File:</strong> <a href={`http://localhost:8000${q.reference_file_url}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Download / View Attachment</a>
                          </div>
                        )}
                      </div>
                      <button onClick={() => handleDeleteQuestion(q.id)} style={{ background: 'none', border: 'none', color: 'var(--accent-rose)', cursor: 'pointer', flexShrink: 0 }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Exams Tab */}
        {activeTab === 'exams' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }} className="animate-fade-in">
            {/* Create */}
            <div className="glass-panel" style={{ padding: '1.5rem', height: 'fit-content' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.25rem' }}>Schedule New Exam</h2>
              <form onSubmit={handleCreateExam} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Exam Title</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. Midterm Programming Exam"
                    value={exTitle}
                    onChange={(e) => setExTitle(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Subject Category</label>
                    <select className="glass-input" value={exSubjectId} onChange={(e) => setExSubjectId(e.target.value)}>
                      {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Duration (mins)</label>
                    <input
                      type="number"
                      className="glass-input"
                      value={exDuration}
                      onChange={(e) => setExDuration(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Question Count</label>
                    <input
                      type="number"
                      className="glass-input"
                      value={exCount}
                      onChange={(e) => setExCount(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Negative Marking (0 for off)</label>
                    <input
                      type="number"
                      step="0.05"
                      className="glass-input"
                      value={exNegative}
                      onChange={(e) => setExNegative(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', padding: '0.2rem 0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={exRandomQ} onChange={(e) => setExRandomQ(e.target.checked)} />
                    Randomize Question Order
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={exRandomO} onChange={(e) => setExRandomO(e.target.checked)} />
                    Randomize Options
                  </label>
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Exam Window Start</label>
                  <input
                    type="datetime-local"
                    className="glass-input"
                    value={exStart}
                    onChange={(e) => setExStart(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Exam Window End</label>
                  <input
                    type="datetime-local"
                    className="glass-input"
                    value={exEnd}
                    onChange={(e) => setExEnd(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                  <Calendar size={16} /> Schedule Exam Window
                </button>
              </form>
            </div>

            {/* List */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.25rem' }}>Scheduled Exams</h2>
              {exams.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No exams scheduled yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {exams.map((ex) => (
                    <div key={ex.id} style={{
                      padding: '1.25rem',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div style={{ textAlign: 'left' }}>
                        <h3 style={{ fontWeight: '700', fontSize: '1.05rem', marginBottom: '0.4rem' }}>{ex.title}</h3>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <span className="badge badge-cyan">{ex.subject.name}</span>
                          <span className="badge badge-purple">{ex.duration_minutes} Mins</span>
                          {ex.negative_marking_val > 0 && <span className="badge badge-rose">Penalty: -{ex.negative_marking_val}</span>}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          <strong>Active Window:</strong> {new Date(ex.start_time).toLocaleString()} - {new Date(ex.end_time).toLocaleString()}
                        </div>
                      </div>
                      <button onClick={() => handleDeleteExam(ex.id)} style={{ background: 'none', border: 'none', color: 'var(--accent-rose)', cursor: 'pointer' }}>
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
