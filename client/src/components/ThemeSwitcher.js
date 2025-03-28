import React, { useContext, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThemeContext } from '../context/ThemeContext';

const ThemeSwitcher = () => {
  const { currentThemeName, toggleTheme, availableThemes, theme } = useContext(ThemeContext);
  const [isOpen, setIsOpen] = useState(false);

  const dropdownVariants = {
    hidden: { 
      opacity: 0,
      y: -10,
      scale: 0.95
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.2
      }
    },
    exit: {
      opacity: 0,
      y: -10,
      scale: 0.95,
      transition: {
        duration: 0.15
      }
    }
  };

  const buttonVariants = {
    hover: {
      scale: 1.05,
      transition: {
        duration: 0.2
      }
    },
    tap: {
      scale: 0.95
    }
  };

  const getThemeIcon = (themeId) => {
    switch (themeId) {
      case 'default':
        return '🌞';
      case 'neon':
        return '💜';
      case 'retro':
        return '📺';
      case 'cartoon':
        return '🎨';
      case 'galaxy':
        return '🌌';
      case 'midnight':
        return '🌙';
      case 'crystal':
        return '💎';
      case 'festive':
        return '🎄';
      default:
        return '🎨';
    }
  };

  return (
    <div className="relative">
      <motion.button
        variants={buttonVariants}
        whileHover="hover"
        whileTap="tap"
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200"
        style={{
          backgroundColor: theme.colors.card,
          color: theme.colors.text,
          border: `1px solid ${theme.colors.border}`,
          boxShadow: theme.effects?.cardShadow || '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
          opacity: 0.8
        }}
      >
        <span>{getThemeIcon(currentThemeName)}</span>
        <span>Theme</span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            variants={dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute right-0 mt-2 w-48 rounded-lg overflow-hidden shadow-lg z-50"
            style={{
              backgroundColor: theme.colors.card,
              border: `1px solid ${theme.colors.border}`,
              boxShadow: theme.effects?.cardShadow || '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              backdropFilter: 'blur(10px)',
              opacity: 0.8
            }}
          >
            {availableThemes.map((themeOption) => (
              <motion.button
                key={themeOption.id}
                onClick={() => {
                  toggleTheme(themeOption.id);
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2 flex items-center space-x-2 transition-colors duration-200"
                style={{
                  backgroundColor: currentThemeName === themeOption.id 
                    ? theme.colors.primary[500] 
                    : 'transparent',
                  color: currentThemeName === themeOption.id 
                    ? 'white' 
                    : theme.colors.text
                }}
                whileHover={{ x: 4 }}
              >
                <span>{getThemeIcon(themeOption.id)}</span>
                <span>{themeOption.name}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ThemeSwitcher;
