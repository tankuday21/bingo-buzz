import React, { useState, useContext } from 'react';
import { ThemeContext } from '../context/ThemeContext';
import { themes } from '../styles/themes';

const ThemeSwitcher = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, currentThemeName, toggleTheme, availableThemes } = useContext(ThemeContext);

  const buttonStyle = {
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
    border: `2px solid ${theme.colors.border}`,
    boxShadow: theme.effects?.cardShadow || 'none',
    backdropFilter: 'blur(8px)',
  };

  const dropdownStyle = {
    backgroundColor: theme.colors.card,
    border: `2px solid ${theme.colors.border}`,
    boxShadow: theme.effects?.cardShadow || 'none',
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 rounded-lg transition-all duration-300 hover:scale-105 bg-opacity-80 backdrop-blur-md"
        style={buttonStyle}
      >
        {themes[currentThemeName]?.name || 'Default Theme'}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-48 rounded-lg shadow-lg overflow-hidden z-50 bg-opacity-80 backdrop-blur-md"
          style={dropdownStyle}
        >
          {availableThemes.map((themeOption) => (
            <button
              key={themeOption.id}
              onClick={() => {
                toggleTheme(themeOption.id);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-2 text-left hover:bg-opacity-50 transition-colors duration-200 ${
                currentThemeName === themeOption.id ? 'bg-opacity-30' : ''
              }`}
              style={{
                backgroundColor: currentThemeName === themeOption.id ? theme.colors.accent : 'transparent',
                color: theme.colors.text
              }}
            >
              {themeOption.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ThemeSwitcher;
