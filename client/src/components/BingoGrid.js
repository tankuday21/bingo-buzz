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
    <div className="bg-white rounded-lg shadow-lg p-4">
      <div 
        className="grid gap-2" 
        style={{ 
          gridTemplateColumns: `repeat(${grid.length}, ${cellSize})`,
          gridTemplateRows: `repeat(${grid.length}, ${cellSize})`
        }}
      >
        {processedGrid.map((row, i) => 
          row.map((number, j) => {
            const isMarked = marked.has(number);
            const isWinningCell = winningLines?.some(line => {
              if (line.type === 'row' && line.index === i) return true;
              if (line.type === 'col' && line.index === j) return true;
              if (line.type === 'diag' && line.index === 0 && i === j) return true;
              if (line.type === 'diag' && line.index === 1 && i === (grid.length - 1 - j)) return true;
              return false;
            });

            return (
              <button
                key={`${i}-${j}`}
                onClick={() => onMarkNumber(number)}
                disabled={!isMyTurn || isMarked}
                className={`
                  relative aspect-square flex items-center justify-center
                  text-lg sm:text-xl font-semibold rounded-lg
                  transition-all duration-200 ease-in-out
                  ${isWinningCell ? 'bg-success-500 text-white' : 
                    isMarked ? 'bg-primary-500 text-white' : 'bg-gray-50'}
                  ${isMyTurn && !isMarked ? 'hover:bg-primary-100 cursor-pointer' : 'cursor-not-allowed'}
                  border-2 border-transparent
                  ${isMyTurn && !isMarked ? 'hover:border-primary-500' : ''}
                `}
                style={{ fontSize: `calc(16px + (24 - 16) * ((100vw - 320px) / (1600 - 320)))` }}
              >
                {number}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default BingoGrid;
