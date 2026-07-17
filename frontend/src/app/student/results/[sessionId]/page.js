'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navbar from '../../../components/Navbar';
import { resultsApi } from '../../../../api';
import { 
  Award, Clock, ArrowLeft, CheckCircle, XCircle, AlertCircle, 
  FileText, HelpCircle, Sparkles, RefreshCw, ZoomIn, Eye, TrendingUp
} from 'lucide-react';

export default function StudentResultsPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId;

  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalImage, setModalImage] = useState(null);
  const [hoveredAnnotation, setHoveredAnnotation] = useState(null);

  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    try {
      setLoading(true);
      const res = await resultsApi.getResultDetails(sessionId);
      setDetails(res.data);
    } catch (err) {
      setError('Failed to load exam results. Grading might still be in progress.');
    } finally {
      setLoading(false);
    }
  };

  const getPointsScored = (q, finalScore, negVal) => {
    if (['short', 'long', 'image'].includes(q.type)) {
      if (q.evaluation) {
        return q.evaluation.examiner_score !== null 
          ? q.evaluation.examiner_score 
          : (q.evaluation.ai_score || 0.0);
      }
      return 0.0;
    }
    
    // MCQ / Multiselect
    const status = getQuestionStatus(q);
    if (status === "Correct") return q.points;
    if (status === "Partial") return q.points / 2; // Simulated partial credit for visualization
    if (q.student_answer) return -negVal; // penalty
    return 0.0;
  };

  const getQuestionStatus = (q) => {
    if (!q.student_answer || q.student_answer === '' || (Array.isArray(q.student_answer) && q.student_answer.length === 0)) {
      return "Unanswered";
    }

    if (q.type === 'mcq') {
      return String(q.student_answer).trim().toLowerCase() === String(q.correct_answer).trim().toLowerCase()
        ? "Correct"
        : "Wrong";
    }

    if (q.type === 'multiselect') {
      try {
        const correct = JSON.parse(q.correct_answer);
        const ans = Array.isArray(q.student_answer) ? q.student_answer : [q.student_answer];
        const correctSet = new Set(correct);
        const ansSet = new Set(ans);
        
        const hasCommon = ans.some(val => correctSet.has(val));
        const allMatch = correct.length === ans.length && correct.every(v => ansSet.has(v));
        
        if (allMatch) return "Correct";
        if (hasCommon) return "Partial";
        return "Wrong";
      } catch (_) {
        return "Wrong";
      }
    }

    // Subjective questions
    if (q.evaluation) {
      const score = q.evaluation.examiner_score !== null ? q.evaluation.examiner_score : q.evaluation.ai_score;
      if (score === q.points) return "Correct";
      if (score > 0) return "Partial";
      return "Wrong";
    }

    return "Unanswered";
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "Correct":
        return <span className="badge badge-emerald" style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}><CheckCircle size={12} /> Correct</span>;
      case "Partial":
        return <span className="badge badge-amber" style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}><AlertCircle size={12} /> Partial</span>;
      case "Wrong":
        return <span className="badge badge-rose" style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}><XCircle size={12} /> Wrong</span>;
      default:
        return <span className="badge" style={{ display: 'flex', gap: '0.2rem', alignItems: 'center', background: 'rgba(255,255,255,0.05)' }}>Unanswered</span>;
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <RefreshCw className="animate-spin" size={40} style={{ color: 'var(--accent-cyan)' }} />
        <span>Fetching your exam results and examiner comments...</span>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div>
        <Navbar />
        <div style={{ maxWidth: '800px', margin: '4rem auto', textAlign: 'center' }}>
          <div className="badge-rose" style={{ padding: '2rem', borderRadius: '12px' }}>
            <h2>Results Unavailable</h2>
            <p>{error || 'Your exam might be in queue for evaluation. Please check back shortly.'}</p>
          </div>
          <button onClick={() => router.push('/student')} className="btn-secondary" style={{ marginTop: '2rem' }}>
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const totalPoints = details.questions.reduce((sum, q) => sum + q.points, 0);
  const obtainedScore = details.final_score !== null ? details.final_score : 0.0;
  const scorePercent = totalPoints > 0 ? ((obtainedScore / totalPoints) * 100).toFixed(1) : 0;

  // Question counts
  let correctCount = 0;
  let partialCount = 0;
  let wrongCount = 0;
  let unattendedCount = 0;

  details.questions.forEach(q => {
    const status = getQuestionStatus(q);
    if (status === "Correct") correctCount++;
    else if (status === "Partial") partialCount++;
    else if (status === "Wrong") wrongCount++;
    else unattendedCount++;
  });

  // Calculate SVG cohort distribution metrics
  const cohortScores = details.cohort_scores || [obtainedScore];
  const maxCohortScore = Math.max(...cohortScores, totalPoints);
  
  // Distribute into 5 buckets (0-20%, 21-40%, 41-60%, 61-80%, 81-100%)
  const buckets = [0, 0, 0, 0, 0];
  cohortScores.forEach(score => {
    const pct = totalPoints > 0 ? (score / totalPoints) * 100 : 0;
    if (pct <= 20) buckets[0]++;
    else if (pct <= 40) buckets[1]++;
    else if (pct <= 60) buckets[2]++;
    else if (pct <= 80) buckets[3]++;
    else buckets[4]++;
  });

  const maxBucketCount = Math.max(...buckets, 1);
  const myBucketIdx = Math.min(Math.floor((obtainedScore / (totalPoints || 1)) * 5), 4);

  return (
    <div>
      <Navbar />
      <main style={{ maxWidth: '950px', margin: '0 auto', padding: '0 2rem 4rem 2rem' }}>
        
        {/* Back Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '2rem' }}>
          <button onClick={() => router.push('/student')} className="btn-secondary" style={{ display: 'flex', gap: '0.4rem', padding: '0.5rem 1rem' }}>
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
        </div>

        {/* Overall Score Summary (Proctor Info completely removed) */}
        <div className="glass-panel" style={{
          padding: '2.5rem',
          marginBottom: '2rem',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(13, 148, 136, 0.15) 100%)',
          textAlign: 'left'
        }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '0.5rem', letterSpacing: '-0.025em' }}>
            Exam Result Breakdown
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '2rem' }}>
            Exam: <strong>{details.exam_title}</strong> • Taken on {new Date(details.start_time).toLocaleDateString()}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem', borderTop: '1px solid var(--border-glass)', paddingTop: '1.5rem' }}>
            
            {/* Primary Score */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Final Score Obtained</span>
              <h2 style={{ fontSize: '2.4rem', fontWeight: '900', color: 'var(--accent-emerald)', lineHeight: 1.1 }}>
                {details.final_score !== null ? `${obtainedScore} / ${totalPoints}` : 'Pending'}
              </h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Grade Percentage: <strong>{scorePercent}%</strong>
              </span>
            </div>

            {/* Performance Ranking */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cohort Rank Percentile</span>
              <h2 style={{ fontSize: '2.4rem', fontWeight: '900', color: 'var(--accent-cyan)', lineHeight: 1.1 }}>
                {details.percentile}{getOrdinalSuffix(details.percentile)}
              </h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Better than <strong>{details.percentile}%</strong> of the class
              </span>
            </div>

            {/* Metrics Breakdown Stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Question Stats</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.2rem' }}>
                <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>{correctCount} Correct</span>
                <span className="badge badge-amber" style={{ fontSize: '0.7rem' }}>{partialCount} Partial</span>
                <span className="badge badge-rose" style={{ fontSize: '0.7rem' }}>{wrongCount} Wrong</span>
                <span className="badge" style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.05)' }}>{unattendedCount} Unanswered</span>
              </div>
            </div>

          </div>
        </div>

        {/* Comparative Percentile Chart Grid Section */}
        <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2.5rem', textAlign: 'left' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={18} style={{ color: 'var(--accent-cyan)' }} />
            Comparative Score Cohort Distribution
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '7fr 4fr', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
            
            {/* SVG Histogram */}
            <div style={{ background: 'rgba(0,0,0,0.1)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
              <svg width="100%" height="160" viewBox="0 0 400 160" style={{ overflow: 'visible' }}>
                {/* Horizontal Guide Lines */}
                <line x1="40" y1="20" x2="380" y2="20" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
                <line x1="40" y1="55" x2="380" y2="55" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
                <line x1="40" y1="90" x2="380" y2="90" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
                <line x1="40" y1="120" x2="380" y2="120" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                
                {/* Render Bars */}
                {buckets.map((count, idx) => {
                  const barWidth = 48;
                  const gap = 16;
                  const x = 50 + idx * (barWidth + gap);
                  
                  // Scale bar height relative to max count
                  const height = (count / maxBucketCount) * 90;
                  const y = 120 - height;
                  const isMyBucket = myBucketIdx === idx;
                  
                  return (
                    <g key={idx}>
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={height}
                        fill={isMyBucket ? 'url(#myGradient)' : 'rgba(59, 130, 246, 0.2)'}
                        stroke={isMyBucket ? 'var(--accent-cyan)' : 'rgba(59, 130, 246, 0.4)'}
                        strokeWidth="1.5"
                        rx="4"
                        style={{ transition: 'var(--transition-smooth)' }}
                      />
                      
                      {/* Count label above bar */}
                      {count > 0 && (
                        <text x={x + barWidth / 2} y={y - 6} fill="var(--text-secondary)" fontSize="9" textAnchor="middle">
                          {count} {count === 1 ? 'student' : 'students'}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* X Axis Labels */}
                <text x="74" y="136" fill="var(--text-muted)" fontSize="9" textAnchor="middle">0-20%</text>
                <text x="138" y="136" fill="var(--text-muted)" fontSize="9" textAnchor="middle">21-40%</text>
                <text x="202" y="136" fill="var(--text-muted)" fontSize="9" textAnchor="middle">41-60%</text>
                <text x="266" y="136" fill="var(--text-muted)" fontSize="9" textAnchor="middle">61-80%</text>
                <text x="330" y="136" fill="var(--text-muted)" fontSize="9" textAnchor="middle">81-100%</text>

                {/* Definitions */}
                <defs>
                  <linearGradient id="myGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="var(--accent-cyan)" />
                    <stop offset="100%" stopColor="var(--accent-purple)" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* Statistics details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>COHORT CLASS AVERAGE</span>
                <span style={{ fontSize: '1.2rem', fontWeight: '800', color: 'white' }}>{details.cohort_average} / {totalPoints}</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>COHORT HIGHEST SCORE</span>
                <span style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--accent-cyan)' }}>{details.cohort_highest} / {totalPoints}</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: '1.4' }}>
                * The distribution chart represents the performance buckets of all graded submissions for this exam session.
              </p>
            </div>

          </div>
        </div>

        {/* Detailed Question Review List */}
        <h2 style={{ fontSize: '1.3rem', fontWeight: '800', marginBottom: '1.5rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileText size={20} style={{ color: 'var(--accent-cyan)' }} />
          Question-by-Question Feedback
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {details.questions.map((q, idx) => {
            const scored = getPointsScored(q, details.final_score, details.negative_marking_val);
            const status = getQuestionStatus(q);
            
            let cardBorder = '1px solid var(--border-glass)';
            if (status === "Correct") {
              cardBorder = '1px solid rgba(16, 185, 129, 0.3)';
            } else if (status === "Partial") {
              cardBorder = '1px solid rgba(245, 158, 11, 0.3)';
            } else if (status === "Wrong") {
              cardBorder = '1px solid rgba(244, 63, 94, 0.3)';
            }

            // Parse annotations overlay
            let parsedAnnotations = [];
            if (q.evaluation?.annotations) {
              try {
                parsedAnnotations = JSON.parse(q.evaluation.annotations);
              } catch (_) {}
            }

            return (
              <div key={q.id} className="glass-panel animate-fade-in" style={{ padding: '2rem', border: cardBorder, textAlign: 'left' }}>
                
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span className="badge badge-cyan">Question {idx + 1} ({q.type.toUpperCase()})</span>
                    {getStatusBadge(status)}
                  </div>
                  <span style={{ fontWeight: '700', fontSize: '0.95rem' }}>
                    Points: <span style={{ color: status === 'Correct' ? 'var(--accent-emerald)' : status === 'Partial' ? 'var(--accent-amber)' : 'white' }}>{scored}</span> / {q.points}
                  </span>
                </div>

                {/* Question Statement */}
                <p style={{ fontWeight: '600', fontSize: '1.05rem', marginBottom: '1.5rem' }}>{q.text}</p>

                {/* Student's Answer */}
                <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', padding: '1.25rem', borderRadius: '8px', marginBottom: '1rem', position: 'relative' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>YOUR SUBMITTED RESPONSE:</span>
                  
                  {['mcq', 'multiselect', 'short', 'long'].includes(q.type) && (
                    <p style={{ fontSize: '0.95rem', color: q.student_answer ? 'white' : 'var(--text-muted)', fontWeight: '500' }}>
                      {q.student_answer ? (
                        q.type === 'multiselect' ? (Array.isArray(q.student_answer) ? q.student_answer.join(', ') : q.student_answer) : q.student_answer
                      ) : '[No response submitted]'}
                    </p>
                  )}

                  {/* Render Image submission with canvas annotations overlay */}
                  {q.type === 'image' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {q.evaluation?.student_answer && (
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', background: 'rgba(255, 255, 255, 0.02)', padding: '0.5rem', borderRadius: '4px' }}>
                          <strong>Transcribed Answer text:</strong> "{q.evaluation.student_answer}"
                        </p>
                      )}
                      
                      {q.evaluation?.handwritten_image_url ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                          
                          {parsedAnnotations.length > 0 && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--accent-rose)', display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                              <Sparkles size={12} /> Hover highlighted boxes on image to read examiner annotations notes.
                            </span>
                          )}

                          <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', width: 'fit-content' }}>
                            <img 
                              src={`http://localhost:8000${q.evaluation.handwritten_image_url}`} 
                              alt="Your upload" 
                              style={{ maxHeight: '350px', borderRadius: '6px', border: '1px solid var(--border-glass)', display: 'block' }}
                            />
                            
                            {/* Render interactive annotation bounding boxes */}
                            {parsedAnnotations.map((ann, aIdx) => (
                              <div
                                key={aIdx}
                                style={{
                                  position: 'absolute',
                                  left: `${ann.x}%`,
                                  top: `${ann.y}%`,
                                  width: `${ann.w}%`,
                                  height: `${ann.h}%`,
                                  border: '2px dashed var(--accent-rose)',
                                  background: 'rgba(244, 63, 94, 0.08)',
                                  cursor: 'help',
                                  zIndex: 10
                                }}
                                onMouseEnter={() => setHoveredAnnotation({ ...ann, id: aIdx + 1, qId: q.id })}
                                onMouseLeave={() => setHoveredAnnotation(null)}
                              >
                                <span style={{
                                  position: 'absolute',
                                  top: '-15px',
                                  left: '0',
                                  background: 'var(--accent-rose)',
                                  color: 'white',
                                  fontSize: '0.55rem',
                                  padding: '0.05rem 0.2rem',
                                  borderRadius: '2px',
                                  whiteSpace: 'nowrap',
                                  pointerEvents: 'none'
                                }}>
                                  #{aIdx + 1}
                                </span>
                              </div>
                            ))}

                            {/* Annotation Tooltip overlay popup */}
                            {hoveredAnnotation && hoveredAnnotation.qId === q.id && (
                              <div style={{
                                position: 'absolute',
                                left: `${hoveredAnnotation.x}%`,
                                top: `${hoveredAnnotation.y + hoveredAnnotation.h + 2}%`,
                                background: 'rgba(19, 26, 44, 0.95)',
                                backdropFilter: 'blur(8px)',
                                border: '1px solid var(--accent-rose)',
                                color: 'white',
                                padding: '0.6rem 0.8rem',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                zIndex: 100,
                                maxWidth: '280px',
                                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)'
                              }}>
                                <strong>Feedback #{hoveredAnnotation.id}:</strong> {hoveredAnnotation.text}
                              </div>
                            )}

                          </div>
                        </div>
                      ) : (
                        <p style={{ color: 'var(--text-muted)' }}>[No image uploaded]</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Correct answer reference */}
                {['mcq', 'multiselect'].includes(q.type) && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--accent-cyan)', background: 'rgba(0, 242, 254, 0.03)', padding: '0.6rem 1rem', borderRadius: '6px', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <HelpCircle size={14} />
                    <span>
                      <strong>Correct Reference Answer:</strong> {q.type === 'multiselect' ? JSON.parse(q.correct_answer).join(', ') : q.correct_answer}
                    </span>
                  </div>
                )}

                {/* Subjective Model Rubric & Feedback */}
                {['short', 'long', 'image'].includes(q.type) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.25rem' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--accent-purple)', background: 'rgba(157, 78, 221, 0.03)', padding: '0.6rem 1rem', borderRadius: '6px' }}>
                      <strong>Model Answer Guide:</strong> {q.model_answer}
                    </div>

                    {q.evaluation && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                        
                        {/* AI comments */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <Sparkles size={12} style={{ color: 'var(--accent-cyan)', marginTop: '0.15rem', flexShrink: 0 }} />
                          <span>AI Assessment Proposed: {q.evaluation.ai_score} pts. Feedback: <span style={{ whiteSpace: 'pre-line' }}>"{q.evaluation.ai_justification}"</span></span>
                        </div>

                        {/* Examiner comments */}
                        {q.evaluation.is_graded ? (
                          <div style={{ background: 'rgba(16, 185, 129, 0.03)', borderLeft: '3px solid var(--accent-emerald)', padding: '0.75rem 1rem', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                            <strong style={{ color: 'var(--accent-emerald)' }}>Examiner Comments:</strong> <span style={{ whiteSpace: 'pre-line' }}>{q.evaluation.examiner_feedback}</span>
                          </div>
                        ) : (
                          <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.8rem', paddingLeft: '0.5rem' }}>
                            * Awaiting Examiner final evaluation override review.
                          </div>
                        )}
                        
                        {/* Canvas Annotations list review */}
                        {parsedAnnotations.length > 0 && (
                          <div style={{ border: '1px solid var(--border-glass)', padding: '0.75rem 1rem', borderRadius: '6px', marginTop: '0.5rem', background: 'rgba(255,255,255,0.01)' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--accent-rose)', display: 'block', marginBottom: '0.4rem' }}>Annotations Marks Notes:</span>
                            {parsedAnnotations.map((ann, aIdx) => (
                              <div key={aIdx} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                                <strong>Highlight #{aIdx + 1}:</strong> {ann.text}
                              </div>
                            ))}
                          </div>
                        )}

                      </div>
                    )}
                  </div>
                )}

              </div>
            );
          })}
        </div>
      </main>

      {/* Modal: Zoom Image */}
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
              alt="Zoomed Image" 
              style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '8px', border: '2px solid var(--border-glass)' }}
            />
          </div>
        </div>
      )}

    </div>
  );
}

const getOrdinalSuffix = (num) => {
  const n = Math.round(num);
  if (n % 100 >= 11 && n % 100 <= 13) {
    return 'th';
  }
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
};
