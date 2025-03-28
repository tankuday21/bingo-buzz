import React from 'react';
import { motion } from 'framer-motion';

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
  if (!grid || grid.length === 0) {
    // Show debug info when grid is missing but game may have started
    console.error("Grid is empty or missing:", { grid, isMyTurn, gameStarted: isMyTurn !== undefined });
    
    return (
      <div className="bg-white rounded-lg shadow-lg p-4">
        <div className="flex flex-col items-center justify-center h-64">
          <p className="text-gray-500 mb-4">Waiting for grid to load...</p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700"
          >
            Refresh Game
          </button>
        </div>
      </div>
    );
  }

  // Debug log to check grid dimensions
  console.log("Grid dimensions in BingoGrid:", grid.length, "x", grid[0]?.length);
  
  // Ensure we have a complete grid (should be 5x5)
  const ensureCompleteGrid = (inputGrid) => {
    // Expected size (5x5)
    const expectedSize = 5;
    
    // If grid is already correct size, return it
    if (inputGrid.length === expectedSize && 
        inputGrid.every(row => row.length === expectedSize)) {
      return inputGrid;
    }
    
    // Create a new grid with correct dimensions
    const completeGrid = [];
    for (let i = 0; i < expectedSize; i++) {
      const row = [];
      for (let j = 0; j < expectedSize; j++) {
        // Use existing value if available, otherwise generate a fallback
        if (inputGrid[i] && typeof inputGrid[i][j] === 'number') {
          row.push(inputGrid[i][j]);
        } else {
          // Generate a deterministic number based on position
          row.push((i * expectedSize) + j + 1);
        }
      }
      completeGrid.push(row);
    }
    
    console.log("Created complete 5x5 grid:", completeGrid);
    return completeGrid;
  };

  // Process grid data to ensure all cells have values and grid is complete
  const processedGrid = ensureCompleteGrid(grid);
  
  // Convert custom symbols string to array
  const customSymbolsArray = customSymbols
    ? customSymbols.split(',').map(s => s.trim())
    : [];

  // Function to get the symbol for a number
  const getSymbol = (num) => {
    if (num === undefined || num === null) {
      return '?'; // Fallback for any missing values
    }
    if (symbols === 'numbers') return num;
    if (symbols === 'emojis') return emojiMap[num] || num;
    if (symbols === 'custom') {
      // Use custom symbols if available, otherwise fallback to number
      const idx = (num - 1) % customSymbolsArray.length;
      return customSymbolsArray[idx] || num;
    }
    return num;
  };

  // Check if a cell is part of a winning line
  const isInWinningLine = (rowIdx, colIdx) => {
    if (!winningLines || winningLines.length === 0) return false;
    
    return winningLines.some(line => {
      if (line.type === 'row' && line.index === rowIdx) return true;
      if (line.type === 'col' && line.index === colIdx) return true;
      if (line.type === 'diag' && line.index === 0 && rowIdx === colIdx) return true;
      if (line.type === 'diag' && line.index === 1 && rowIdx + colIdx === processedGrid.length - 1) return true;
      return false;
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4">
      <div 
        className="grid gap-2 mx-auto max-w-2xl"
        style={{ gridTemplateColumns: `repeat(${processedGrid.length}, minmax(0, 1fr))` }}
      >
        {processedGrid.map((row, rowIdx) => 
          row.map((num, colIdx) => {
            const isMarked = marked.has(num);
            const inWinningLine = isInWinningLine(rowIdx, colIdx);
            
            return (
              <motion.div
                key={`${rowIdx}-${colIdx}`}
                whileHover={isMyTurn && !isMarked ? { scale: 1.05 } : {}}
                whileTap={isMyTurn && !isMarked ? { scale: 0.95 } : {}}
                animate={isMarked ? { 
                  backgroundColor: inWinningLine ? 'var(--accent-color)' : 'var(--primary-color)', 
                  color: '#ffffff',
                  scale: [1, 1.1, 1] 
                } : {}}
                transition={{ duration: 0.3 }}
                onClick={() => isMyTurn && !isMarked && num !== undefined && onMarkNumber(num)}
                className={`
                  grid-cell
                  aspect-square
                  flex items-center justify-center
                  ${isMarked ? 'marked' : 'bg-gray-100 hover:bg-gray-200'}
                  ${inWinningLine ? 'winning-line' : ''}
                  ${isMyTurn && !isMarked && num !== undefined ? 'cursor-pointer' : 'cursor-default'}
                  text-lg md:text-xl font-bold
                  rounded-lg
                  p-2 md:p-4
                  transition-colors
                `}
              >
                {getSymbol(num)}
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default BingoGrid;
