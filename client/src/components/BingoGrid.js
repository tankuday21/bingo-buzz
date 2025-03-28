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
  size, 
  onCellClick, 
  markedCells, 
  winningLines,
  symbols,
  customSymbols
}) => {
  const { theme } = useContext(ThemeContext);
  const gridSize = parseInt(size);

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
    },
    hover: {
      scale: 1.05,
      boxShadow: theme.effects?.cardShadow || '0 4px 6px rgba(0,0,0,0.1)',
      transition: { duration: 0.2 }
    },
    tap: { scale: 0.95 }
  };

  const markVariants = {
    initial: { scale: 0, opacity: 0 },
    animate: { 
      scale: 1, 
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 500,
        damping: 30
      }
    }
  };

  const getWinningLineStyle = (index) => {
    if (!winningLines?.includes(index)) return {};
    
    return {
      backgroundColor: `${theme.colors.success}33`,
      boxShadow: `0 0 15px ${theme.colors.success}66`,
      border: `2px solid ${theme.colors.success}`,
    };
  };

  const getCellStyle = (index) => {
    const baseStyle = {
      backgroundColor: theme.colors.card,
      color: theme.colors.text,
      border: `2px solid ${theme.colors.border}`,
      transition: 'all 0.3s ease',
    };

    if (markedCells?.includes(index)) {
      return {
        ...baseStyle,
        backgroundColor: theme.colors.primary,
        color: '#ffffff',
        transform: 'scale(1.05)',
      };
    }

    if (winningLines?.includes(index)) {
      return {
        ...baseStyle,
        backgroundColor: theme.colors.success,
        color: '#ffffff',
        transform: 'scale(1.05)',
      };
    }

    return baseStyle;
  };

  if (!grid || grid.length === 0) {
    // Show debug info when grid is missing but game may have started
    console.error("Grid is empty or missing:", { grid, size, gameStarted: size !== undefined });
    
    return (
      <div 
        className="rounded-lg p-4"
        style={{
          background: theme.colors.card,
          boxShadow: theme.effects.cardShadow,
          backdropFilter: theme.effects.glassMorphism
        }}
      >
        <div className="flex flex-col items-center justify-center h-64">
          <p className="text-red-500 mb-4">Waiting for grid to load...</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 rounded"
            style={{
              background: theme.colors.primary[500],
              color: 'white'
            }}
          >
            Refresh Game
          </button>
        </div>
      </div>
    );
  }

  // Debug log to check grid dimensions
  console.log("Grid dimensions in BingoGrid:", grid.length, "x", grid[0]?.length);
  
  // Ensure we have a complete grid with the correct dimensions
  const ensureCompleteGrid = (inputGrid) => {
    // Get the actual grid size from the input grid
    const size = inputGrid.length;
    
    // If grid is already square and complete, return it
    if (inputGrid.length === size && 
        inputGrid.every(row => row.length === size)) {
      return inputGrid;
    }
    
    // Create a new grid with correct dimensions
    const completeGrid = [];
    for (let i = 0; i < size; i++) {
      const row = [];
      for (let j = 0; j < size; j++) {
        // Use existing value if available, otherwise generate a fallback
        if (inputGrid[i] && typeof inputGrid[i][j] === 'number') {
          row.push(inputGrid[i][j]);
        } else {
          // Generate a deterministic number based on position
          row.push((i * size) + j + 1);
        }
      }
      completeGrid.push(row);
    }
    
    console.log(`Created complete ${size}x${size} grid:`, completeGrid);
    return completeGrid;
  };

  // Process grid data to ensure all cells have values and grid is complete
  const processedGrid = ensureCompleteGrid(grid);

  // Calculate cell size based on grid dimensions
  const cellSize = `calc((100% - ${(grid.length - 1) * 0.5}rem) / ${grid.length})`;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid gap-2 p-4"
      style={{
        gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
      }}
    >
      {processedGrid.map((number, index) => (
        <motion.button
          key={index}
          variants={cellVariants}
          whileHover="hover"
          whileTap="tap"
          onClick={() => onCellClick(index)}
          className={`
            aspect-square rounded-lg flex items-center justify-center
            text-lg sm:text-xl font-semibold relative overflow-hidden
            transition-colors duration-300 backdrop-blur-sm bg-opacity-80
          `}
          style={getCellStyle(index)}
        >
          {markedCells?.includes(index) && (
            <motion.div
              variants={markVariants}
              initial="initial"
              animate="animate"
              className="absolute inset-0 flex items-center justify-center"
              style={{
                backgroundColor: `${theme.colors.primary}1a`
              }}
            >
              <div 
                className="w-3/4 h-3/4 rounded-full"
                style={{
                  background: `radial-gradient(circle, ${theme.colors.primary}33 0%, transparent 70%)`
                }}
              />
            </motion.div>
          )}
          <span className="relative z-10">{number}</span>
        </motion.button>
      ))}
    </motion.div>
  );
};

export default BingoGrid;
