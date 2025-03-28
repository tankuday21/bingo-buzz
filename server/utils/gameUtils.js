/**
 * Game utility functions for Bingo Buzz
 */

/**
 * Generate a random Bingo grid of the specified size with guaranteed uniqueness
 * @param {string} size - Grid size in format "5x5", "6x6", etc.
 * @param {string} playerIdentifier - Unique identifier for the player to ensure unique grid generation
 * @param {Set} usedNumbers - Optional set of numbers that should be avoided to ensure uniqueness between players
 * @returns {Object} Object containing the grid and the set of numbers used in this grid
 */
function generateUniqueGrid(size, playerIdentifier = '', usedNumbers = new Set()) {
  // Parse the grid dimensions
  const [rows, cols] = size.split('x').map(Number);
  
  // Calculate total number of cells and max number
  const total = rows * cols;
  const maxNumber = total; // Numbers should be from 1 to total
  
  // Create a pool of available numbers (1 to total)
  const numberPool = Array.from({ length: maxNumber }, (_, i) => i + 1);
  
  // Remove numbers that have been used in other grids
  for (let i = numberPool.length - 1; i >= 0; i--) {
    if (usedNumbers.has(numberPool[i])) {
      numberPool.splice(i, 1);
    }
  }
  
  // If we don't have enough numbers, expand the range
  if (numberPool.length < total) {
    console.warn(`Not enough unique numbers available for grid ${size}, expanding range`);
    const start = maxNumber + 1;
    for (let i = start; i <= start + total; i++) {
      if (!usedNumbers.has(i)) {
        numberPool.push(i);
      }
    }
  }
  
  // Shuffle the available numbers
  for (let i = numberPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numberPool[i], numberPool[j]] = [numberPool[j], numberPool[i]];
  }
  
  // Take the first 'total' numbers for this grid
  const selectedNumbers = numberPool.slice(0, total);
  
  // Create a new set of used numbers
  const newUsedNumbers = new Set([...usedNumbers, ...selectedNumbers]);
  
  // Convert to 2D array
  const grid = [];
  for (let i = 0; i < rows; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) {
      const index = i * cols + j;
      if (index < selectedNumbers.length) {
        row.push(selectedNumbers[index]);
      }
    }
    grid.push(row);
  }
  
  return {
    grid,
    usedNumbers: newUsedNumbers
  };
}

/**
 * Generate a grid of given size
 * @param {string} size - Grid size in format "5x5", "6x6", etc.
 * @param {string} seed - Seed for random number generation
 * @returns {Array<Array<number>>} The generated grid
 */
function generateGrid(size, seed) {
  // Parse grid size
  const [rows, cols] = size.split('x').map(Number);
  const total = rows * cols;
  
  // Create array of numbers from 1 to total
  const numbers = Array.from({ length: total }, (_, i) => i + 1);
  
  // Shuffle numbers using seed
  const shuffled = numbers.sort(() => {
    const x = Math.sin(seed.length + numbers.length);
    return x - Math.floor(x);
  });
  
  // Create grid
  const grid = [];
  for (let i = 0; i < rows; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) {
      const index = i * cols + j;
      if (index < shuffled.length) {
        row.push(shuffled[index]);
      }
    }
    grid.push(row);
  }
  
  return grid;
}

/**
 * Check if a player has won by completing 5 or more lines
 * @param {Object} game - The game state object
 * @returns {Object|null} The winner ID and winning lines, or null if no winner
 */
function checkWin(game) {
  // For each player's grid
  for (const [playerId, grid] of Object.entries(game.grids)) {
    const lines = [];
    const size = grid.length;
    
    // Check rows
    for (let i = 0; i < size; i++) {
      if (grid[i].every(num => game.markedNumbers.has(num))) {
        lines.push({ type: 'row', index: i });
      }
    }
    
    // Check columns
    for (let j = 0; j < size; j++) {
      const column = grid.map(row => row[j]);
      if (column.every(num => game.markedNumbers.has(num))) {
        lines.push({ type: 'col', index: j });
      }
    }
    
    // Check main diagonal (top-left to bottom-right)
    const mainDiag = grid.map((row, i) => row[i]);
    if (mainDiag.every(num => game.markedNumbers.has(num))) {
      lines.push({ type: 'diag', index: 0 });
    }
    
    // Check other diagonal (top-right to bottom-left)
    const otherDiag = grid.map((row, i) => row[size - 1 - i]);
    if (otherDiag.every(num => game.markedNumbers.has(num))) {
      lines.push({ type: 'diag', index: 1 });
    }
    
    // Check if player has 5 or more completed lines
    if (lines.length >= 5) {
      return { playerId, lines };
    }
  }
  
  // No winner found
  return null;
}

/**
 * Get all unmarked numbers in the game
 * @param {Object} game - The game state object
 * @returns {Array<number>} Array of unmarked numbers
 */
function getUnmarkedNumbers(game) {
  // Get the size of the grid
  const gridSize = game.gridSize.split('x').map(Number);
  const maxNum = gridSize[0] * gridSize[1];
  
  // Create a set of all numbers in the grid
  const allNumbers = new Set(Array.from({ length: maxNum }, (_, i) => i + 1));
  
  // Remove marked numbers
  for (const num of game.markedNumbers) {
    allNumbers.delete(num);
  }
  
  // Convert back to array
  return Array.from(allNumbers);
}

/**
 * Get remaining lines needed for a player to win
 * @param {Object} game - The game state object
 * @param {string} playerId - Player ID
 * @returns {Array<Object>} Array of potential winning lines with completion percentage
 */
function getRemainingLines(game, playerId) {
  const grid = game.grids[playerId];
  if (!grid) return [];
  
  const size = grid.length;
  const potentialLines = [];
  
  // Check rows
  for (let i = 0; i < size; i++) {
    const row = grid[i];
    const markedCount = row.filter(num => game.markedNumbers.has(num)).length;
    potentialLines.push({
      type: 'row',
      index: i,
      completion: (markedCount / size) * 100,
      remaining: size - markedCount
    });
  }
  
  // Check columns
  for (let j = 0; j < size; j++) {
    const column = grid.map(row => row[j]);
    const markedCount = column.filter(num => game.markedNumbers.has(num)).length;
    potentialLines.push({
      type: 'col',
      index: j,
      completion: (markedCount / size) * 100,
      remaining: size - markedCount
    });
  }
  
  // Check main diagonal
  const mainDiag = grid.map((row, i) => row[i]);
  const mainDiagMarkedCount = mainDiag.filter(num => game.markedNumbers.has(num)).length;
  potentialLines.push({
    type: 'diag',
    index: 0,
    completion: (mainDiagMarkedCount / size) * 100,
    remaining: size - mainDiagMarkedCount
  });
  
  // Check other diagonal
  const otherDiag = grid.map((row, i) => row[size - 1 - i]);
  const otherDiagMarkedCount = otherDiag.filter(num => game.markedNumbers.has(num)).length;
  potentialLines.push({
    type: 'diag',
    index: 1,
    completion: (otherDiagMarkedCount / size) * 100,
    remaining: size - otherDiagMarkedCount
  });
  
  // Sort by completion (highest first)
  return potentialLines.sort((a, b) => b.completion - a.completion);
}

/**
 * Validate a grid for uniqueness and correctness
 * @param {Array<Array<number>>} grid - The grid to validate
 * @param {Set} usedGrids - Set of already used grid strings
 * @returns {boolean} Whether the grid is valid
 */
function validateGrid(grid, usedGrids = new Set()) {
  if (!grid || !Array.isArray(grid) || grid.length === 0) {
    console.error('Invalid grid structure');
    return false;
  }

  const rows = grid.length;
  const cols = grid[0].length;
  const total = rows * cols;
  const numbers = new Set();
  
  // Check grid dimensions
  if (!grid.every(row => Array.isArray(row) && row.length === cols)) {
    console.error('Inconsistent grid dimensions');
    return false;
  }

  // Check for duplicate numbers and invalid values
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const num = grid[i][j];
      // Check if number is within valid range (1 to total)
      if (typeof num !== 'number' || num <= 0 || num > total) {
        console.error(`Invalid number in grid: ${num} (should be between 1 and ${total})`);
        return false;
      }
      if (numbers.has(num)) {
        console.error(`Duplicate number in grid: ${num}`);
        return false;
      }
      numbers.add(num);
    }
  }

  // Check if all numbers are unique and within range
  if (numbers.size !== total) {
    console.error(`Grid contains ${numbers.size} unique numbers, expected ${total}`);
    return false;
  }

  // Convert grid to string for comparison
  const gridString = grid.map(row => row.join(',')).join('|');
  
  // Check if this grid has been used before
  if (usedGrids.has(gridString)) {
    console.error('Grid has been used before');
    return false;
  }

  return true;
}

/**
 * Generate a unique grid for a player
 * @param {string} size - Grid size in format "5x5", "6x6", etc.
 * @param {string} playerIdentifier - Unique identifier for the player
 * @param {Set} usedGrids - Set of already used grid strings
 * @returns {Array<Array<number>>} The generated grid
 */
function generateUniquePlayerGrid(size, playerIdentifier, usedGrids = new Set()) {
  const maxAttempts = 100; // Prevent infinite loops
  let attempts = 0;
  
  // Parse grid size
  const [rows, cols] = size.split('x').map(Number);
  const total = rows * cols;
  
  while (attempts < maxAttempts) {
    // Create array of numbers from 1 to total
    const numbers = Array.from({ length: total }, (_, i) => i + 1);
    
    // Shuffle numbers
    for (let i = numbers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    
    // Create grid
    const grid = [];
    for (let i = 0; i < rows; i++) {
      const row = [];
      for (let j = 0; j < cols; j++) {
        const index = i * cols + j;
        if (index < numbers.length) {
          row.push(numbers[index]);
        }
      }
      grid.push(row);
    }
    
    // Check if grid is unique
    const gridString = grid.map(row => row.join(',')).join('|');
    if (!usedGrids.has(gridString)) {
      usedGrids.add(gridString);
      return grid;
    }
    
    attempts++;
  }
  
  // If we couldn't generate a unique grid after max attempts,
  // generate a new grid with a different seed
  console.warn('Could not generate unique grid after max attempts, using fallback method');
  return generateGrid(size, playerIdentifier + Date.now());
}

module.exports = {
  generateGrid,
  generateUniqueGrid,
  generateUniquePlayerGrid,
  checkWin,
  getUnmarkedNumbers,
  getRemainingLines,
  validateGrid
};
