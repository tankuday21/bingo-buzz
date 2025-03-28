import React, { useContext } from 'react';
import { motion } from 'framer-motion';
import { ThemeContext } from '../context/ThemeContext';

const Timer = ({ seconds }) => {
  const { theme } = useContext(ThemeContext);

  // Calculate progress percentage
  const progress = (seconds / 15) * 100;

  // Get color based on remaining time
  const getColor = () => {
    if (seconds <= 5) {
      return theme.colors.primary[700];
    } else if (seconds <= 10) {
      return theme.colors.primary[600];
    }
    return theme.colors.primary[500];
  };

  return (
    <div className="relative">
      {/* Timer background */}
      <div 
        className="h-2 rounded-full"
        style={{
          background: theme.colors.primary[100],
          boxShadow: theme.effects.cardShadow
        }}
      >
        {/* Timer progress bar */}
        <motion.div
          className="h-full rounded-full"
          style={{
            background: getColor(),
            width: `${progress}%`,
            transition: 'width 0.3s linear'
          }}
          initial={{ width: '100%' }}
          animate={{ width: `${progress}%` }}
        />
      </div>

      {/* Timer text */}
      <motion.div
        className="absolute -top-6 left-1/2 transform -translate-x-1/2"
        initial={{ scale: 1 }}
        animate={{ 
          scale: seconds <= 5 ? [1, 1.2, 1] : 1,
          color: getColor()
        }}
        transition={{ 
          duration: 0.3,
          repeat: seconds <= 5 ? Infinity : 0
        }}
      >
        <span className="font-bold">{seconds}</span>
        <span className="text-sm ml-1">s</span>
      </motion.div>
    </div>
  );
};

export default Timer;
