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
  marked, 
  onMarkNumber, 
  isMyTurn, 
  winningLines,
  symbols,
  customSymbols
}) => {
  const { theme } = useContext(ThemeContext);

  if (!grid || grid.length === 0) {
    // Show debug info when grid is missing but game may have started
    console.error("Grid is empty or missing:", { grid, isMyTurn, gameStarted: isMyTurn !== undefined });
    
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

  // Cell animation variants
  const cellVariants = {
    unmarked: {
      scale: 1,
      backgroundColor: theme.colors.card,
      transition: { duration: 0.2 }
    },
    marked: {
      scale: 1.05,
      backgroundColor: theme.colors.primary[500],
      transition: { 
        type: "spring",
        stiffness: 300,
        damping: 20
      }
    },
    winning: {
      scale: 1.1,
      backgroundColor: theme.colors.success[500],
      transition: { 
        type: "spring",
        stiffness: 300,
        damping: 20
      }
    }
  };

  // Get cell state for animations
  const getCellState = (i, j, number) => {
    const isMarked = marked.has(number);
    const isWinningCell = winningLines?.some(line => {
      if (line.type === 'row' && line.index === i) return true;
      if (line.type === 'col' && line.index === j) return true;
      if (line.type === 'diag' && line.index === 0 && i === j) return true;
      if (line.type === 'diag' && line.index === 1 && i === (grid.length - 1 - j)) return true;
      return false;
    });

    return isWinningCell ? 'winning' : isMarked ? 'marked' : 'unmarked';
  };

  return (
    <div 
      className="rounded-lg p-4"
      style={{
        background: theme.colors.card,
        boxShadow: theme.effects.cardShadow,
        backdropFilter: theme.effects.glassMorphism
      }}
    >
      <div 
        className="grid gap-2" 
        style={{ 
          gridTemplateColumns: `repeat(${grid.length}, ${cellSize})`,
          gridTemplateRows: `repeat(${grid.length}, ${cellSize})`
        }}
      >
        {processedGrid.map((row, i) => 
          row.map((number, j) => {
            const cellState = getCellState(i, j, number);
            const isMarked = marked.has(number);

            return (
              <motion.button
                key={`${i}-${j}`}
                onClick={() => onMarkNumber(number)}
                disabled={!isMyTurn || isMarked}
                variants={cellVariants}
                initial="unmarked"
                animate={cellState}
                whileHover={!isMarked && isMyTurn ? { scale: 1.05 } : {}}
                whileTap={!isMarked && isMyTurn ? { scale: 0.95 } : {}}
                className={`
                  relative aspect-square flex items-center justify-center
                  text-lg sm:text-xl font-semibold rounded-lg
                  transition-all duration-200 ease-in-out
                  ${isMyTurn && !isMarked ? 'cursor-pointer' : 'cursor-not-allowed'}
                  ${cellState === 'winning' ? 'text-white' : 
                    cellState === 'marked' ? 'text-white' : 
                    theme.colors.text}
                `}
                style={{
                  fontSize: `calc(16px + (24 - 16) * ((100vw - 320px) / (1600 - 320)))`,
                  border: `2px solid ${theme.colors.border}`,
                  boxShadow: theme.effects.cardShadow
                }}
              >
                {number}
                {cellState === 'marked' && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <div 
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: theme.colors.primary[500],
                        opacity: 0.2
                      }}
                    />
                  </motion.div>
                )}
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default BingoGrid;
