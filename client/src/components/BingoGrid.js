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

const BingoGrid = React.memo(({ 
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
      fontWeight: '700',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      borderRadius: '0.5rem',
      padding: '0.5rem',
      maxWidth: '80px',
      maxHeight: '80px',
      margin: 'auto',
      position: 'relative',
      overflow: 'hidden',
      textShadow: '0px 0px 1px rgba(0,0,0,0.2)'
    };

    // Check if this cell is marked
    const isMarked = Array.isArray(markedCells) && markedCells.includes(index);
    
    // Check if this cell is part of a winning line
    const isWinningCell = Array.isArray(winningLines) && winningLines.includes(index);
    
    if (isMarked) {
      return {
        ...baseStyle,
        backgroundColor: theme.colors.primary,
        color: '#FFFFFF',
        fontWeight: '800',
        transform: 'scale(1.05)',
        boxShadow: `0 0 0 2px ${theme.colors.primary}, 0 0 10px rgba(0,0,0,0.5)`,
        textShadow: '0px 1px 2px rgba(0,0,0,0.5)',
        // Add a subtle inner glow effect
        border: 'none',
        outline: `3px solid ${theme.colors.primary}`
      };
    }

    if (isWinningCell) {
      return {
        ...baseStyle,
        backgroundColor: theme.colors.success,
        color: '#FFFFFF',
        fontWeight: '800',
        transform: 'scale(1.1)',
        boxShadow: `0 0 0 3px ${theme.colors.success}, 0 0 15px rgba(0,0,0,0.5)`,
        textShadow: '0px 1px 3px rgba(0,0,0,0.5)',
        // Add a more prominent inner glow effect
        border: 'none',
        outline: `3px solid ${theme.colors.success}`
      };
    }

    return baseStyle;
  };

  // Cell click animation (more prominent)
  const cellTapAnimation = {
    scale: 0.92,
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    transition: { duration: 0.1 }
  };

  // Cell hover animation (more visible)
  const cellHoverAnimation = {
    scale: 1.08,
    boxShadow: `0 0 5px rgba(0,0,0,0.3)`,
    backgroundColor: `${theme.colors.card}`,
    transition: { duration: 0.2 }
  };

  // Cell click handler
  const handleCellClick = (number, index) => {
    if (typeof onCellClick === 'function') {
      // Pass the cell index first, then the number to the parent component
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
            whileHover={cellHoverAnimation}
            whileTap={cellTapAnimation}
            data-number={number}
            data-index={index}
          >
            {number}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
});

export default BingoGrid;
