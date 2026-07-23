'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import { studentApi } from '../../api';
import { BookOpen, Clock, AlertTriangle, Play, CheckCircle, ArrowRight } from 'lucide-react';

export default function StudentPage() {
  const [exams, setExams] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    try {
      setLoading(true);
      const res = await studentApi.getExamsList();
      setExams(res.data);
    } catch (err) {
      setError('Failed to load scheduled exams list. Please login again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartExam = (examId) => {
    if (confirm('Are you ready to start the exam? Your webcam monitoring and browser focus tracking will begin immediately.')) {
      router.push(`/student/exam/${examId}`);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
      case 'submitted':
      case 'timed_out':
        return <span className="badge badge-emerald">Submitted</span>;
      case 'available':
        return <span className="badge badge-cyan">Available</span>;
      case 'expired':
        return <span className="badge badge-rose">Expired</span>;
      default:
        return <span className="badge badge-purple">Scheduled</span>;
    }
  };

  return (
    <div>
      <Navbar />
      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 2rem 4rem 2rem' }}>
        
        {/* Banner */}
        <div className="glass-panel" style={{
          padding: '2.5rem',
          marginBottom: '2.5rem',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(59, 130, 246, 0.1) 100%)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '0.5rem' }}>
            Welcome to your Examination Portal
          </h1>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '600px', fontSize: '0.95rem' }}>
            Please select an exam below. Ensure your webcam is enabled and you maintain window focus throughout your examination window.
          </p>
        </div>

        {error && (
          <div className="badge-rose" style={{ padding: '1rem', borderRadius: '8px', fontSize: '0.9rem', width: '100%', marginBottom: '2rem' }}>
            {error}
          </div>
        )}

        <h2 style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Clock size={22} style={{ color: 'var(--accent-cyan)' }} />
          Your Exam Schedule
        </h2>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            Loading examinations list...
          </div>
        ) : exams.length === 0 ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            No exams scheduled at this time.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {exams.map((ex, i) => (
              <div key={i} className="glass-card" style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '1.5rem',
                gap: '1.5rem'
              }}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <span className="badge badge-purple" style={{ display: 'flex', gap: '0.2rem' }}>
                      <BookOpen size={12} /> {ex.subject_name}
                    </span>
                    {getStatusBadge(ex.status)}
                  </div>
                  
                  <h3 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '0.5rem' }}>{ex.exam_title}</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Clock size={14} /> Duration: {ex.duration_minutes} Minutes
                    </div>
                    <div>
                      <strong>Scheduled:</strong> {new Date(ex.start_time).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                  {ex.status === 'available' && (
                    <button onClick={() => handleStartExam(ex.exam_id)} className="btn-primary" style={{ width: '100%' }}>
                      <Play size={16} /> Start Exam
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
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
