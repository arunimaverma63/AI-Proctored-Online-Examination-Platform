'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations } from './translations';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState('en');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const savedLang = localStorage.getItem('app_language');
    if (savedLang && ['en', 'hi', 'bn', 'te', 'ta', 'mr'].includes(savedLang)) {
      setLanguageState(savedLang);
    }
    setIsMounted(true);
  }, []);

  const setLanguage = (lang) => {
    if (['en', 'hi', 'bn', 'te', 'ta', 'mr'].includes(lang)) {
      setLanguageState(lang);
      localStorage.setItem('app_language', lang);
    }
  };

  const t = (text) => {
    // If not mounted yet, default to English (the key itself) to avoid Next.js hydration mismatch
    if (!isMounted) return text;
    if (language === 'en') return text;
    
    const translatedText = translations[language]?.[text];
    return translatedText !== undefined ? translatedText : text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isMounted }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
