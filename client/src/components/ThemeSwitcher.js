import React, { useContext, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThemeContext } from '../context/ThemeContext';

const ThemeSwitcher = () => {
  const { theme, changeTheme } = useContext(ThemeContext);
  const [isOpen, setIsOpen] = useState(false);
  
  const themes = [
    { id: 'default', name: 'Default', icon: '🔵' },
    { id: 'dark', name: 'Dark', icon: '🌙' },
    { id: 'neon', name: 'Neon', icon: '🌈' },
    { id: 'pastel', name: 'Pastel', icon: '🍭' }
  ];
  
  const toggleDropdown = () => setIsOpen(!isOpen);
  
  const handleThemeChange = (themeId) => {
    changeTheme(themeId);
    setIsOpen(false);
  };
  
  const currentTheme = themes.find(t => t.id === theme) || themes[0];
  
  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="flex items-center space-x-1 bg-white bg-opacity-20 hover:bg-opacity-30 px-3 py-1 rounded transition-colors"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span>{currentTheme.icon}</span>
        <span className="hidden sm:inline">Theme</span>
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg z-20"
          >
            <div className="py-2">
              {themes.map((themeOption) => (
                <button
                  key={themeOption.id}
                  onClick={() => handleThemeChange(themeOption.id)}
                  className={`
                    flex items-center w-full px-4 py-2 text-left hover:bg-gray-100
                    ${theme === themeOption.id ? 'font-bold bg-gray-50' : ''}
                  `}
                >
                  <span className="mr-2">{themeOption.icon}</span>
                  <span>{themeOption.name}</span>
                  {theme === themeOption.id && (
                    <span className="ml-auto text-primary-600">✓</span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ThemeSwitcher;
