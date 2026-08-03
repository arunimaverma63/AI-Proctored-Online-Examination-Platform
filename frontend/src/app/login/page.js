'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '../../api';
import { LogIn, UserPlus, ShieldAlert, Award, GraduationCap, Globe, ChevronDown, Check } from 'lucide-react';
import { useLanguage } from '../components/LanguageContext';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const { language, setLanguage, t } = useLanguage();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    // Clear storage on mount
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!event.target.closest('.lang-selector-container')) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const response = await authApi.login(username, password);
        const { access_token, role: userRole, username: name } = response.data;
        
        localStorage.setItem('token', access_token);
        localStorage.setItem('role', userRole);
        localStorage.setItem('username', name);

        // Redirect based on role
        if (userRole === 'admin') router.push('/admin');
        else if (userRole === 'examiner') router.push('/examiner');
        else router.push('/student');
      } else {
        await authApi.register(username, password, role);
        setIsLogin(true);
        setError('Registration successful! Please login with your credentials.');
        setUsername('');
        setPassword('');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'An authentication error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '1rem',
      position: 'relative'
    }}>
      {/* Floating Language Selector */}
      <div className="floating-lang-container">
        <div className="lang-selector-container">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="lang-selector-btn"
          >
            <Globe size={14} />
            <span>{language.toUpperCase()}</span>
            <ChevronDown size={12} style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
          
          <div className={`lang-dropdown-menu ${dropdownOpen ? 'show' : ''}`}>
            {[
              { code: 'en', label: 'English' },
              { code: 'hi', label: 'हिन्दी' },
              { code: 'bn', label: 'বাংলা' },
              { code: 'te', label: 'తెలుగు' },
              { code: 'ta', label: 'தமிழ்' },
              { code: 'mr', label: 'मराठी' }
            ].map((lang) => (
              <button
                key={lang.code}
                className={`lang-dropdown-item ${language === lang.code ? 'active' : ''}`}
                onClick={() => {
                  setLanguage(lang.code);
                  setDropdownOpen(false);
                }}
              >
                <span>{lang.label}</span>
                {language === lang.code && <Check size={12} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-panel animate-fade-in" style={{
        width: '100%',
        maxWidth: '450px',
        padding: '2.5rem',
        textAlign: 'center'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))',
            borderRadius: '50%',
            padding: '0.8rem',
            display: 'inline-flex',
            color: '#0b0f19'
          }}>
            <GraduationCap size={40} />
          </div>
        </div>

        <h1 style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '0.5rem', background: 'linear-gradient(135deg, #fff, var(--text-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          ExamShield AI
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem' }}>
          {t('AI-Proctored Online Examination Platform')}
        </p>

        {error && (
          <div className="badge-rose" style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            fontSize: '0.85rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            textAlign: 'left'
          }}>
            <ShieldAlert size={18} style={{ flexShrink: 0 }} />
            <span>{t(error)}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', textAlign: 'left' }}>
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              {t('Username')}
            </label>
            <input
              type="text"
              className="glass-input"
              placeholder={t('Enter username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              {t('Password')}
            </label>
            <input
              type="password"
              className="glass-input"
              placeholder={t('Enter password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {!isLogin && (
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                {t('Account Role')}
              </label>
              <select
                className="glass-input"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{ appearance: 'none', cursor: 'pointer' }}
              >
                <option value="student">{t('Student / Examinee')}</option>
                <option value="examiner">{t('Examiner / Grader')}</option>
                <option value="admin">{t('Platform Administrator')}</option>
              </select>
            </div>
          )}

          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
            {loading ? t('Processing...') : isLogin ? (
              <>
                <LogIn size={18} /> {t('Sign In')}
              </>
            ) : (
              <>
                <UserPlus size={18} /> {t('Register Account')}
              </>
            )}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-glass)', paddingTop: '1.5rem' }}>
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-cyan)',
              fontSize: '0.85rem',
              cursor: 'pointer',
              fontWeight: '500',
              textDecoration: 'underline'
            }}
          >
            {isLogin ? t("Don't have an account? Sign Up") : t('Already have an account? Sign In')}
          </button>
        </div>

        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
            <Award size={14} /> {t('Full Evaluation')}
          </div>
          <span>•</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
            <ShieldAlert size={14} /> {t('Intelligent Proctoring')}
          </div>
        </div>
      </div>
    </div>
  );
}
