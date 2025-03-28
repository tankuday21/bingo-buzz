import React, { useContext } from 'react';
import { motion } from 'framer-motion';
import { ThemeContext } from '../context/ThemeContext';

const Timer = ({ seconds, timeLeft }) => {
  const { theme } = useContext(ThemeContext);

  // Use either seconds or timeLeft prop (backward compatibility)
  const time = typeof timeLeft === 'number' ? timeLeft : (typeof seconds === 'number' ? seconds : 15);
  
  // Ensure time is always a valid number
  const safeTime = isNaN(time) ? 15 : Math.max(0, Math.min(time, 30));

  // Calculate progress percentage
  const progress = (safeTime / 15) * 100;

  // Get color based on remaining time
  const getColor = () => {
    if (safeTime <= 5) {
      return theme.colors.primary;
    } else if (safeTime <= 10) {
      return theme.colors.accent;
    }
    return theme.colors.success;
  };

  return (
    <div className="relative w-24 h-8 flex items-center">
      {/* Timer background */}
      <div 
        className="h-2 rounded-full w-full"
        style={{
          background: `${theme.colors.primary}33`,
          boxShadow: theme.effects?.cardShadow
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
        className="absolute -top-1 left-1/2 transform -translate-x-1/2"
        initial={{ scale: 1 }}
        animate={{ 
          scale: safeTime <= 5 ? [1, 1.2, 1] : 1,
          color: getColor()
        }}
        transition={{ 
          duration: 0.3,
          repeat: safeTime <= 5 ? Infinity : 0
        }}
      >
        <span className="font-bold">{safeTime}</span>
        <span className="text-sm ml-1">s</span>
      </motion.div>
    </div>
  );
};

export default Timer;
