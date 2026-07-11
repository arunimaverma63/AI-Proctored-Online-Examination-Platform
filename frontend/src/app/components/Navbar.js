'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, User, ShieldCheck } from 'lucide-react';

export default function Navbar() {
  const router = useRouter();
  const [user, setUser] = useState({ username: '', role: '' });

  useEffect(() => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const role = localStorage.getItem('role');

    if (!token) {
      router.push('/login');
    } else {
      setUser({ username, role });
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    router.push('/login');
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return <span className="badge badge-cyan">Admin</span>;
      case 'examiner':
        return <span className="badge badge-purple">Examiner</span>;
      default:
        return <span className="badge badge-emerald">Student</span>;
    }
  };

  return (
    <nav className="glass-panel" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.75rem 2rem',
      borderRadius: '0px 0px 16px 16px',
      borderTop: 'none',
      marginBottom: '2rem',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }} onClick={() => {
        if (user.role === 'admin') router.push('/admin');
        else if (user.role === 'examiner') router.push('/examiner');
        else router.push('/student');
      }}>
        <div style={{
          background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))',
          borderRadius: '8px',
          padding: '0.4rem',
          color: '#060913',
          display: 'flex',
          alignItems: 'center'
        }}>
          <ShieldCheck size={20} />
        </div>
        <span style={{ fontSize: '1.2rem', fontWeight: '800', tracking: '-0.025em' }}>
          ExamShield <span style={{ color: 'var(--accent-cyan)' }}>AI</span>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--border-glass)',
            color: 'var(--accent-cyan)'
          }}>
            <User size={16} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>{user.username}</span>
            <div style={{ transform: 'scale(0.85) translateX(-8%)', transformOrigin: 'top left' }}>
              {getRoleBadge(user.role)}
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="btn-secondary"
          style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}
        >
          <LogOut size={14} /> Log Out
        </button>
      </div>
    </nav>
  );
}
