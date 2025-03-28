import React, { createContext, useState, useEffect } from 'react';
import { themes } from '../styles/themes';

export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme && themes[savedTheme] ? savedTheme : 'default';
  });

  useEffect(() => {
    localStorage.setItem('theme', currentTheme);
    
    // Apply theme-specific styles to body
    const theme = themes[currentTheme];
    document.body.style.backgroundColor = theme.colors.background;
    document.body.style.color = theme.colors.text;
    
    if (theme.effects.texture) {
      document.body.style.backgroundImage = theme.effects.texture;
    } else {
      document.body.style.backgroundImage = 'none';
    }
    
    if (theme.effects.stars) {
      document.body.style.backgroundImage = theme.effects.stars;
      document.body.style.backgroundSize = '30px 30px';
    }
    
    if (theme.effects.festive) {
      document.body.style.backgroundImage = theme.effects.festive;
      document.body.style.backgroundSize = '24px 24px';
    }
  }, [currentTheme]);

  const getThemeValue = () => themes[currentTheme];

  const toggleTheme = (themeName) => {
    if (themes[themeName]) {
      setCurrentTheme(themeName);
    }
  };

  return (
    <ThemeContext.Provider value={{ 
      theme: getThemeValue(),
      currentThemeName: currentTheme,
      toggleTheme,
      availableThemes: Object.keys(themes).map(key => ({
        id: key,
        name: themes[key].name
      }))
    }}>
      {children}
    </ThemeContext.Provider>
  );
};
