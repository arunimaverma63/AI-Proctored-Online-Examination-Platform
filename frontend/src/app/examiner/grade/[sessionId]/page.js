'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navbar from '../../../components/Navbar';
import { gradingApi } from '../../../../api';
import { 
  ShieldAlert, Award, FileText, CheckCircle, ArrowLeft, 
  ExternalLink, Eye, Play, Sparkles, User, RefreshCw
} from 'lucide-react';

export default function GradingPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId;

  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Grading edit states
  const [selectedEvaluation, setSelectedEvaluation] = useState(null); // evaluation data object
  const [scoreInput, setScoreInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');
  const [savingGrade, setSavingGrade] = useState(false);
  const [modalImage, setModalImage] = useState(null);

  useEffect(() => {
    fetchSessionDetails();
  }, []);

  const fetchSessionDetails = async () => {
    try {
      setLoading(true);
      const res = await gradingApi.getSubmissionDetails(sessionId);
      setDetails(res.data);
    } catch (err) {
      setError('Failed to load session details.');
    } finally {
      setLoading(false);
    }
  };

  const [annotations, setAnnotations] = useState([]);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [dragStart, setDragStart] = useState(null);

  const startGrading = (evaluation, maxPoints) => {
    setSelectedEvaluation({ ...evaluation, maxPoints });
    setScoreInput(evaluation.examiner_score !== null ? evaluation.examiner_score : evaluation.ai_score || 0);
    setFeedbackInput(evaluation.examiner_feedback || evaluation.ai_justification || '');
    
    // Parse annotations
    let parsed = [];
    if (evaluation.annotations) {
      try {
        parsed = JSON.parse(evaluation.annotations);
      } catch (_) { parsed = []; }
    }
    setAnnotations(parsed);
    setIsAnnotating(false);
  };

  const handleGradeSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEvaluation) return;

    if (parseFloat(scoreInput) < 0 || parseFloat(scoreInput) > selectedEvaluation.maxPoints) {
      alert(`Score must be between 0 and ${selectedEvaluation.maxPoints}`);
      return;
    }

    setSavingGrade(true);
    try {
      await gradingApi.submitGrade(
        selectedEvaluation.evaluation_id,
        scoreInput,
        feedbackInput,
        JSON.stringify(annotations)
      );
      setSuccess('Grade updated successfully!');
      setSelectedEvaluation(null);
      fetchSessionDetails();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      alert('Failed to save grade: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingGrade(false);
    }
  };

  const getSuspicionStyle = (score) => {
    if (score >= 40) return { color: 'var(--accent-rose)', border: '1px solid rgba(244, 63, 94, 0.4)', background: 'rgba(244, 63, 94, 0.05)' };
    if (score >= 20) return { color: 'var(--accent-amber)', border: '1px solid rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.05)' };
    return { color: 'var(--accent-emerald)', border: '1px solid rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.05)' };
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <RefreshCw className="animate-spin" size={40} style={{ color: 'var(--accent-cyan)' }} />
        <span>Loading submission details and proctor snapshots...</span>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div>
        <Navbar />
        <div style={{ maxWidth: '800px', margin: '4rem auto', textAlign: 'center' }}>
          <div className="badge-rose" style={{ padding: '2rem', borderRadius: '12px' }}>
            <h2>Error Loading Details</h2>
            <p>{error || 'Session not found.'}</p>
          </div>
          <button onClick={() => router.push('/examiner')} className="btn-secondary" style={{ marginTop: '2rem' }}>
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navbar />
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 2rem 4rem 2rem' }}>
        
        {/* Back navigation & Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <button onClick={() => router.push('/examiner')} className="btn-secondary" style={{ display: 'flex', gap: '0.4rem', padding: '0.5rem 1rem' }}>
            <ArrowLeft size={16} /> Back
          </button>
          
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: '800' }}>
              Submissions Grading: <span style={{ color: 'var(--accent-cyan)' }}>{details.student_username}</span>
            </h1>
            <span className="badge badge-purple">{details.exam_title}</span>
          </div>
        </div>

        {success && (
          <div className="badge-emerald animate-fade-in" style={{ padding: '0.8rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem', width: '100%', marginBottom: '1.5rem' }}>
            {success}
          </div>
        )}

        {/* Outer Split View Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: '2rem' }}>
          
          {/* LEFT: Student Responses / Questions List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '800', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={20} style={{ color: 'var(--accent-cyan)' }} />
              Exam Paper Responses
            </h2>

            {details.questions.map((q, idx) => {
              const hasEvaluation = q.evaluation !== null;
              const isMcqCorrect = q.type === 'mcq' && String(q.student_answer).trim().toLowerCase() === String(q.correct_answer).trim().toLowerCase();
              const isMultiCorrect = q.type === 'multiselect' && (() => {
                try {
                  const correct = JSON.parse(q.correct_answer);
                  const ans = q.student_answer;
                  return Array.isArray(ans) && correct.length === ans.length && correct.every(v => ans.includes(v));
                } catch (_) { return false; }
              })();
              const isCorrect = isMcqCorrect || isMultiCorrect;

              return (
                <div key={q.id} className="glass-panel animate-fade-in" style={{ padding: '2rem', textAlign: 'left' }}>
                  
                  {/* Header info */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>
                    <span className="badge badge-cyan">Question {idx + 1} ({q.type.toUpperCase()})</span>
                    <span className="badge badge-purple">Max Points: {q.points}</span>
                  </div>

                  {/* Question text */}
                  <p style={{ fontWeight: '600', fontSize: '1.05rem', marginBottom: '1.5rem' }}>{q.text}</p>

                  {/* Model Answer (if subjective) */}
                  {['short', 'long', 'image'].includes(q.type) && (
                    <div style={{ background: 'rgba(157, 78, 221, 0.05)', border: '1px solid rgba(157, 78, 221, 0.2)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--accent-purple)', display: 'block', marginBottom: '0.25rem' }}>MODEL ANSWER / RUBRIC:</span>
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{q.model_answer}</p>
                    </div>
                  )}

                  {/* Student Response */}
                  <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-glass)', padding: '1.25rem', borderRadius: '8px', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>STUDENT ANSWER:</span>
                    
                    {/* Render standard text response */}
                    {['mcq', 'multiselect', 'short', 'long'].includes(q.type) && (
                      <p style={{ fontSize: '0.95rem', fontWeight: '500', color: q.student_answer ? 'white' : 'var(--text-muted)' }}>
                        {q.student_answer ? (
                          q.type === 'multiselect' ? (Array.isArray(q.student_answer) ? q.student_answer.join(', ') : q.student_answer) : q.student_answer
                        ) : '[No response submitted]'}
                      </p>
                    )}

                    {/* Render Image submission */}
                    {q.type === 'image' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {q.student_answer && (
                          <div style={{ fontSize: '0.85rem', color: 'var(--accent-cyan)', background: 'rgba(0, 242, 254, 0.05)', padding: '0.5rem', borderRadius: '4px' }}>
                            <strong>AI OCR Extracted Text:</strong> "{q.evaluation?.student_answer}"
                          </div>
                        )}
                        {q.evaluation?.handwritten_image_url ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <img 
                              src={`http://localhost:8000${q.evaluation.handwritten_image_url}`} 
                              alt="Handwritten answers" 
                              style={{ maxHeight: '140px', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--border-glass)' }}
                              onClick={() => setModalImage(`http://localhost:8000${q.evaluation.handwritten_image_url}`)}
                            />
                            <button className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setModalImage(`http://localhost:8000${q.evaluation.handwritten_image_url}`)}>
                              <Eye size={14} /> Zoom Image
                            </button>
                          </div>
                        ) : (
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>[No image uploaded]</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* MCQ Auto-grading result block */}
                  {(q.type === 'mcq' || q.type === 'multiselect') && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      borderRadius: '6px',
                      background: isCorrect ? 'rgba(16, 185, 129, 0.06)' : 'rgba(244, 63, 94, 0.06)',
                      border: isCorrect ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(244, 63, 94, 0.2)'
                    }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: '500', color: isCorrect ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                        {isCorrect ? 'Auto-Graded: Correct Answer' : `Auto-Graded: Incorrect (Correct: ${q.correct_answer})`}
                      </span>
                      <span style={{ fontWeight: 'bold' }}>
                        Score: {isCorrect ? q.points : q.student_answer ? `-${details.negative_marking_val}` : '0.0'}
                      </span>
                    </div>
                  )}

                  {/* AI Evaluation Pre-grade block for subjective */}
                  {['short', 'long', 'image'].includes(q.type) && hasEvaluation && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem', borderTop: '1px solid var(--border-glass)', paddingTop: '1.25rem' }}>
                      <div className="glass-card" style={{ background: 'rgba(0, 242, 254, 0.02)', borderColor: 'rgba(0, 242, 254, 0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <Sparkles size={16} style={{ color: 'var(--accent-cyan)' }} />
                          <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--accent-cyan)' }}>AI ASSISTED SCORING</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>AI Proposed Grade:</span>
                          <span style={{ fontWeight: 'bold', color: 'var(--accent-cyan)' }}>{q.evaluation.ai_score} / {q.points}</span>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: '1.4', whiteSpace: 'pre-line' }}>
                          "{q.evaluation.ai_justification}"
                        </p>
                      </div>

                      {/* Grading Status */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Grading Status: </span>
                          {q.evaluation.is_graded ? (
                            <span className="badge badge-emerald">Finalized</span>
                          ) : (
                            <span className="badge badge-purple">Pending Review</span>
                          )}
                        </div>

                        <button onClick={() => startGrading(q.evaluation, q.points)} className="btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}>
                          <Award size={14} /> Review & Override
                        </button>
                      </div>

                      {/* Final examiner score shown if graded */}
                      {q.evaluation.is_graded && (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          background: 'rgba(16, 185, 129, 0.04)',
                          border: '1px solid rgba(16, 185, 129, 0.15)',
                          padding: '0.8rem 1rem',
                          borderRadius: '6px',
                          fontSize: '0.85rem'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', color: 'var(--accent-emerald)', marginBottom: '0.2rem' }}>
                            <span>Final Grade Assigned:</span>
                            <span>{q.evaluation.examiner_score} / {q.points}</span>
                          </div>
                          {q.evaluation.examiner_feedback && (
                            <span style={{ color: 'var(--text-secondary)' }}><strong>Comments:</strong> {q.evaluation.examiner_feedback}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              );
            })}
          </div>

          {/* RIGHT: Proctoring Review & Timeline Panel */}
          <div>
            <div className="glass-panel" style={{ padding: '2rem', position: 'sticky', top: '100px', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'left' }}>
              
              {/* Proctoring Suspicion Score Banner */}
              <div style={{
                padding: '1.5rem',
                borderRadius: '12px',
                textAlign: 'center',
                ...getSuspicionLevelStyle(details.proctoring_suspicion_score)
              }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 'bold', tracking: '0.05em', marginBottom: '0.5rem' }}>PROCTOR SUSPICION INDEX</h3>
                <h1 style={{ fontSize: '2.5rem', fontWeight: '900' }}>{details.proctoring_suspicion_score}%</h1>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.8 }}>
                  {details.proctoring_suspicion_score >= 40 ? 'Action Needed: Highly suspicious behavior flagged.' : details.proctoring_suspicion_score >= 20 ? 'Mild violations recorded.' : 'Session is clean.'}
                </p>
              </div>

              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldAlert size={18} style={{ color: 'var(--accent-rose)' }} />
                Proctor Violation Timeline
              </h3>

              {details.proctor_timeline.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem' }}>
                  No proctor violations detected during this exam session.
                </p>
              ) : (
                <div className="timeline">
                  {details.proctor_timeline.map((log) => {
                    const isOk = log.event_type.toLowerCase() === 'ok';
                    return (
                      <div key={log.id} className="timeline-item">
                        <div className={`timeline-dot ${isOk ? 'ok' : ''}`} />
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                          <span>{log.event_type.toUpperCase()}</span>
                          <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        </div>
                        
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{log.description}</p>
                        
                        {log.screenshot_url && (
                          <div style={{ display: 'inline-block', position: 'relative' }}>
                            <img 
                              src={`http://localhost:8000${log.screenshot_url}`} 
                              alt="Proctor snapshot" 
                              style={{ width: '120px', borderRadius: '4px', border: '1px solid var(--border-glass)', cursor: 'pointer', transition: 'var(--transition-smooth)' }}
                              onClick={() => setModalImage(`http://localhost:8000${log.screenshot_url}`)}
                              className="hover:scale-105"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      </main>

      {/* Modal: Subjective Evaluation Grade Form Overlay */}
      {selectedEvaluation && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(6, 9, 19, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }} className="animate-fade-in">
          <div className="glass-panel" style={{ width: '100%', maxWidth: '550px', padding: '2.5rem', textAlign: 'left' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '800', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Award size={20} style={{ color: 'var(--accent-cyan)' }} />
              Override Subjective Grade
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Evaluate this response and overwrite the score. Max allowed points: <strong>{selectedEvaluation.maxPoints}</strong>.
            </p>

            <form onSubmit={handleGradeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* CANVAS ANNOTATOR FOR IMAGE QUESTIONS */}
              {selectedEvaluation.handwritten_image_url && (
                <div style={{ border: '1px solid var(--border-glass)', padding: '1rem', borderRadius: '8px', background: 'rgba(255,255,255,0.02)' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    Canvas Annotation Highlights
                  </label>
                  
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.8rem' }}>
                    <button
                      type="button"
                      className={isAnnotating ? "btn-primary" : "btn-secondary"}
                      onClick={() => setIsAnnotating(!isAnnotating)}
                      style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                    >
                      {isAnnotating ? "Drawing Mode: Enabled" : "Enable Drawing Mode"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setAnnotations([])}
                      style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', color: 'var(--accent-rose)' }}
                    >
                      Clear All
                    </button>
                  </div>

                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    {isAnnotating ? "Click and drag across the image to highlight a region and add feedback." : "Toggle Drawing Mode to highlight specific answers directly on the image."}
                  </p>

                  <div style={{ position: 'relative', width: '100%', userSelect: 'none' }}>
                    <img
                      src={`http://localhost:8000${selectedEvaluation.handwritten_image_url}`}
                      alt="Student Answer paper"
                      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '6px', pointerEvents: 'auto', cursor: isAnnotating ? 'crosshair' : 'default' }}
                      onMouseDown={(e) => {
                        if (!isAnnotating) return;
                        const rect = e.target.getBoundingClientRect();
                        const x = ((e.clientX - rect.left) / rect.width) * 100;
                        const y = ((e.clientY - rect.top) / rect.height) * 100;
                        setDragStart({ x, y });
                      }}
                      onMouseUp={(e) => {
                        if (!isAnnotating || !dragStart) return;
                        const rect = e.target.getBoundingClientRect();
                        const x = ((e.clientX - rect.left) / rect.width) * 100;
                        const y = ((e.clientY - rect.top) / rect.height) * 100;
                        
                        const left = Math.min(dragStart.x, x);
                        const top = Math.min(dragStart.y, y);
                        const width = Math.abs(x - dragStart.x);
                        const height = Math.abs(y - dragStart.y);
                        
                        setDragStart(null);
                        
                        if (width < 2 && height < 2) return; // avoid tiny clicks
                        
                        const comment = prompt("Enter annotation comment for this region:");
                        if (comment !== null && comment.trim() !== '') {
                          setAnnotations([...annotations, { x: left, y: top, w: width, h: height, text: comment }]);
                        }
                      }}
                    />

                    {/* Render active drawn boxes */}
                    {annotations.map((ann, index) => (
                      <div
                        key={index}
                        style={{
                          position: 'absolute',
                          left: `${ann.x}%`,
                          top: `${ann.y}%`,
                          width: `${ann.w}%`,
                          height: `${ann.h}%`,
                          border: '2px solid var(--accent-rose)',
                          background: 'rgba(244, 63, 94, 0.15)',
                          pointerEvents: 'auto',
                          cursor: 'pointer'
                        }}
                        title={ann.text}
                        onClick={() => {
                          if (confirm(`Remove this highlight annotation? "${ann.text}"`)) {
                            setAnnotations(annotations.filter((_, idx) => idx !== index));
                          }
                        }}
                      >
                        <span style={{
                          position: 'absolute',
                          top: '-18px',
                          left: '0',
                          background: 'var(--accent-rose)',
                          color: 'white',
                          fontSize: '0.65rem',
                          padding: '0.1rem 0.3rem',
                          borderRadius: '3px',
                          whiteSpace: 'nowrap',
                          zIndex: 10
                        }}>
                          #{index + 1}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* List of comments */}
                  {annotations.length > 0 && (
                    <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Annotations List:</span>
                      {annotations.map((ann, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', background: 'rgba(255,255,255,0.02)', padding: '0.3rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                          <span><strong>#{idx + 1}:</strong> {ann.text}</span>
                          <button
                            type="button"
                            onClick={() => setAnnotations(annotations.filter((_, i) => i !== idx))}
                            style={{ border: 'none', background: 'transparent', color: 'var(--accent-rose)', cursor: 'pointer' }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Examiner Score (out of {selectedEvaluation.maxPoints})
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max={selectedEvaluation.maxPoints}
                  className="glass-input"
                  value={scoreInput}
                  onChange={(e) => setScoreInput(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Feedback / Comments
                </label>
                <textarea
                  className="glass-input"
                  rows="4"
                  placeholder="Enter notes explaining point deductions..."
                  value={feedbackInput}
                  onChange={(e) => setFeedbackInput(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setSelectedEvaluation(null)} className="btn-secondary" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={savingGrade}>
                  {savingGrade ? 'Saving Grade...' : 'Save Grade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Zoom Image Overlay */}
      {modalImage && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(6, 9, 19, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001,
          padding: '1rem'
        }} onClick={() => setModalImage(null)}>
          <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }} onClick={(e) => e.stopPropagation()}>
            <img 
              src={modalImage} 
              alt="Zoomed Snapshot" 
              style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '8px', border: '2px solid var(--border-glass)' }}
            />
            <p style={{ color: 'white', textAlign: 'center', marginTop: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Click anywhere outside to close this preview.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}

function getSuspicionLevelStyle(score) {
  if (score >= 40) {
    return {
      color: 'var(--accent-rose)',
      border: '1px solid rgba(244, 63, 94, 0.4)',
      background: 'rgba(244, 63, 94, 0.08)'
    };
  } else if (score >= 20) {
    return {
      color: 'var(--accent-amber)',
      border: '1px solid rgba(245, 158, 11, 0.4)',
      background: 'rgba(245, 158, 11, 0.08)'
    };
  } else {
    return {
      color: 'var(--accent-emerald)',
      border: '1px solid rgba(16, 185, 129, 0.4)',
      background: 'rgba(16, 185, 129, 0.08)'
    };
  }
}
