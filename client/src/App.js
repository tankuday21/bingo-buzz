import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import GamePage from './pages/GamePage';
import LeaderboardPage from './pages/LeaderboardPage';
import NotFoundPage from './pages/NotFoundPage';
import { ThemeContext } from './context/ThemeContext';

function App() {
  const [theme, setTheme] = useState('default');
  
  // Load theme from localStorage on initial render
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'default';
    setTheme(savedTheme);
    document.body.className = `theme-${savedTheme}`;
  }, []);
  
  // Update document class and localStorage when theme changes
  const changeTheme = (newTheme) => {
    setTheme(newTheme);
    document.body.className = `theme-${newTheme}`;
    localStorage.setItem('theme', newTheme);
  };
  
  return (
    <ThemeContext.Provider value={{ theme, changeTheme }}>
      <div className="min-h-screen">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/game/:roomCode" element={<GamePage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
      </div>
    </ThemeContext.Provider>
  );
}

export default App;
