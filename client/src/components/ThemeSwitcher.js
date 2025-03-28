import React, { useState, useContext } from 'react';
import { ThemeContext } from '../context/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import { FaSun, FaMoon, FaSpaceShuttle, FaGem, FaPalette } from 'react-icons/fa';
import { RiAliensFill } from 'react-icons/ri';

const ThemeSwitcher = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, currentThemeName, toggleTheme, availableThemes } = useContext(ThemeContext);

  const getThemeIcon = (themeId) => {
    switch (themeId) {
      case 'default':
        return <FaSun className="text-yellow-400" />;
      case 'neon':
        return <FaPalette className="text-pink-500" />;
      case 'galaxy':
        return <RiAliensFill className="text-purple-500" />;
      case 'crystal':
        return <FaGem className="text-blue-400" />;
      case 'midnight':
        return <FaMoon className="text-indigo-400" />;
      default:
        return <FaSpaceShuttle className="text-gray-400" />;
    }
  };

  const buttonVariants = {
    initial: { scale: 1 },
    hover: { 
      scale: 1.05,
      transition: { duration: 0.2 }
    },
    tap: { scale: 0.95 }
  };

  const dropdownVariants = {
    hidden: {
      opacity: 0,
      y: -20,
      scale: 0.95
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.2,
        ease: "easeOut"
      }
    },
    exit: {
      opacity: 0,
      y: -20,
      scale: 0.95,
      transition: {
        duration: 0.15
      }
    }
  };

  const itemVariants = {
    hidden: { x: -20, opacity: 0 },
    visible: i => ({
      x: 0,
      opacity: 1,
      transition: {
        delay: i * 0.1,
        duration: 0.2
      }
    }),
    hover: {
      x: 10,
      transition: {
        duration: 0.2
      }
    }
  };

  const buttonStyle = {
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
    border: `2px solid ${theme.colors.border}`,
    boxShadow: theme.effects?.cardShadow || 'none',
  };

  const dropdownStyle = {
    backgroundColor: theme.colors.card,
    border: `2px solid ${theme.colors.border}`,
    boxShadow: theme.effects?.cardShadow || 'none',
  };

  return (
    <div className="relative z-50">
      <motion.button
        variants={buttonVariants}
        initial="initial"
        whileHover="hover"
        whileTap="tap"
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 rounded-lg flex items-center space-x-2 backdrop-blur-md bg-opacity-80"
        style={buttonStyle}
      >
        <span className="text-lg">{getThemeIcon(currentThemeName)}</span>
        <span className="font-medium">Theme</span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            variants={dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute right-0 mt-2 w-48 rounded-lg overflow-hidden backdrop-blur-md bg-opacity-80"
            style={dropdownStyle}
          >
            {availableThemes.map((themeOption, index) => (
              <motion.button
                key={themeOption.id}
                custom={index}
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                whileHover="hover"
                onClick={() => {
                  toggleTheme(themeOption.id);
                  setIsOpen(false);
                }}
                className="w-full px-4 py-3 flex items-center space-x-3 transition-colors duration-200"
                style={{
                  backgroundColor: currentThemeName === themeOption.id ? theme.colors.accent : 'transparent',
                  color: theme.colors.text
                }}
              >
                <span className="text-lg">{getThemeIcon(themeOption.id)}</span>
                <span className="font-medium">{themeOption.name}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ThemeSwitcher;
