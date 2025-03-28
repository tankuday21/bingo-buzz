import React, { useContext } from 'react';
import { motion } from 'framer-motion';
import { ThemeContext } from '../context/ThemeContext';

// Emoji mapping for numbers (if selected)
const emojiMap = {
  1: '😀', 2: '😎', 3: '🚀', 4: '⭐', 5: '🔥', 
  6: '🎮', 7: '🎵', 8: '🎲', 9: '🎯', 10: '💖',
  11: '🌈', 12: '🦄', 13: '🍕', 14: '🍦', 15: '🏆',
  16: '🎁', 17: '🎪', 18: '🎭', 19: '🧸', 20: '🎨',
  21: '🎧', 22: '📱', 23: '💻', 24: '🎬', 25: '📚',
  26: '🚗', 27: '✈️', 28: '🚢', 29: '🚲', 30: '🏠',
  31: '⚽', 32: '🏀', 33: '🎾', 34: '🏓', 35: '🎣',
  36: '🧩', 37: '🎸', 38: '🥁', 39: '🎺', 40: '🎻',
  41: '🌞', 42: '🌙', 43: '⛅', 44: '🌧️', 45: '❄️',
  46: '🌸', 47: '🍀', 48: '🌵', 49: '🌴', 50: '🍎',
  51: '🍌', 52: '🥝', 53: '🍇', 54: '🥑', 55: '🍓',
  56: '🐶', 57: '🐱', 58: '🐼', 59: '🐯', 60: '🦁',
  61: '🐻', 62: '🐨', 63: '🦊', 64: '🦋'
};

const BingoGrid = ({ 
  grid, 
  onCellClick, 
  markedCells, 
  winningLines
}) => {
  const { theme } = useContext(ThemeContext);
  const gridSize = grid?.length || 5;

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.5,
        staggerChildren: 0.05
      }
    }
  };

  const cellVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.3 }
    }
  };

  const getCellStyle = (index) => {
    const baseStyle = {
      backgroundColor: theme.colors.card,
      color: theme.colors.text,
      border: `2px solid ${theme.colors.border}`,
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '1.25rem',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      borderRadius: '0.5rem',
      padding: '0.5rem',
      maxWidth: '80px',
      maxHeight: '80px',
      margin: 'auto'
    };

    if (markedCells?.includes(index)) {
      return {
        ...baseStyle,
        backgroundColor: theme.colors.primary,
        color: '#ffffff',
        transform: 'scale(1.02)',
      };
    }

    if (winningLines?.includes(index)) {
      return {
        ...baseStyle,
        backgroundColor: theme.colors.success,
        color: '#ffffff',
        transform: 'scale(1.02)',
      };
    }

    return baseStyle;
  };

  const handleCellClick = (number, index) => {
    console.log(`Cell clicked: number ${number}, index ${index}`);
    if (typeof onCellClick === 'function') {
      // Pass both the number and the cell index to the parent component
      onCellClick(index, number);
    }
  };

  if (!grid || grid.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p>Waiting for grid to load...</p>
      </div>
    );
  }

  // Create a flat version of the grid for easier handling
  const flatGrid = Array.isArray(grid[0]) ? grid.flat() : grid;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-2xl mx-auto"
    >
      <div 
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
          aspectRatio: '1/1',
          width: '100%',
          maxWidth: '500px',
          margin: '0 auto'
        }}
      >
        {flatGrid.map((number, index) => (
          <motion.button
            key={index}
            variants={cellVariants}
            onClick={() => handleCellClick(number, index)}
            style={getCellStyle(index)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            data-number={number}
            data-index={index}
          >
            {number}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
};

export default BingoGrid;
