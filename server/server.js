const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { nanoid } = require('nanoid');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const LeaderboardModel = require('./models/leaderboard');
const { generateGrid, generateUniqueGrid, checkWin, getUnmarkedNumbers, generateUniquePlayerGrid } = require('./utils/gameUtils');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
app.use(cors());
app.use(express.json()); // Add JSON body parser middleware

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'https://bingo-buzz.vercel.app',
    methods: ['GET', 'POST']
  }
});

// Add game cleanup mechanism
const GAME_CLEANUP_INTERVAL = 1000 * 60 * 15; // 15 minutes
const GAME_TIMEOUT = 1000 * 60 * 60 * 24; // 24 hours
const INACTIVE_GAME_TIMEOUT = 1000 * 60 * 30; // 30 minutes

function cleanupOldGames() {
  const now = Date.now();
  for (const [roomCode, game] of Object.entries(games)) {
    let shouldCleanup = false;
    let reason = '';

    // Check for timeout
    if (now - game.createdAt > GAME_TIMEOUT) {
      shouldCleanup = true;
      reason = 'game timeout';
    }
    // Check for inactive games
    else if (game.lastActivity && now - game.lastActivity > INACTIVE_GAME_TIMEOUT) {
      shouldCleanup = true;
      reason = 'inactive game';
    }
    // Check for empty games
    else if (!game.players || game.players.length === 0) {
      shouldCleanup = true;
      reason = 'empty game';
    }

    if (shouldCleanup) {
      console.log(`Cleaning up game: ${roomCode} (${reason})`);
      
      // Notify remaining players if any
      if (game.players && game.players.length > 0) {
        io.to(roomCode).emit('game-ended', {
          reason: reason,
          message: `Game ended due to ${reason}`
        });
      }

      // Clean up socket rooms
      io.in(roomCode).socketsLeave(roomCode);
      
      // Delete the game
      delete games[roomCode];
    }
  }
}

// Track game activity
function updateGameActivity(roomCode) {
  if (games[roomCode]) {
    games[roomCode].lastActivity = Date.now();
  }
}

// Start cleanup interval
setInterval(cleanupOldGames, GAME_CLEANUP_INTERVAL);

// Improve MongoDB connection handling
let mongoConnected = false;
let mongoRetryCount = 0;
const MAX_MONGO_RETRIES = 3;
const MONGO_RETRY_DELAY = 5000; // 5 seconds

async function connectToMongoDB() {
  try {
    if (mongoose.connection.readyState === 1) {
      console.log('Already connected to MongoDB');
      mongoConnected = true;
      return;
    }

    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bingo-buzz', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority',
      connectTimeoutMS: 10000,
    });
    console.log('Connected to MongoDB');
    mongoConnected = true;
    mongoRetryCount = 0;
  } catch (err) {
    console.warn('MongoDB connection error:', err.message);
    mongoConnected = false;
    
    if (mongoRetryCount < MAX_MONGO_RETRIES) {
      mongoRetryCount++;
      console.log(`Retrying MongoDB connection (attempt ${mongoRetryCount}/${MAX_MONGO_RETRIES})...`);
      setTimeout(connectToMongoDB, MONGO_RETRY_DELAY * mongoRetryCount);
    } else {
      console.error('Max MongoDB retry attempts reached. Continuing without MongoDB - leaderboard functionality will be limited');
      // Emit a server-wide event to notify about MongoDB status
      io.emit('mongodb-status', { connected: false });
    }
  }
}

// Handle MongoDB disconnection
mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
  mongoConnected = false;
  io.emit('mongodb-status', { connected: false });
  connectToMongoDB();
});

mongoose.connection.on('connected', () => {
  console.log('MongoDB reconnected');
  mongoConnected = true;
  io.emit('mongodb-status', { connected: true });
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
  mongoConnected = false;
  io.emit('mongodb-status', { connected: false });
});

// Initial connection attempt
connectToMongoDB();

// In-memory store for games
const games = {};

// API Routes
app.post('/api/games', (req, res) => {
  try {
    console.log('Received game creation request:', req.body);
    
    // Check if request body exists and has content
    if (!req.body || Object.keys(req.body).length === 0) {
      console.error('Game creation failed: Empty request body');
      return res.status(400).json({ error: 'Empty request body' });
    }
    
    const { username, gridSize = '5x5' } = req.body;
    
    if (!username) {
      console.log('Game creation failed: Username is required');
      return res.status(400).json({ error: 'Username is required' });
    }
    
    console.log(`Creating game with username: ${username}, grid size: ${gridSize}`);
    
    // Generate a unique room code
    let roomCode;
    try {
      roomCode = nanoid(6).toUpperCase();
      console.log(`Generated room code: ${roomCode}`);
    } catch (nanoidError) {
      console.error('Error generating room code with nanoid:', nanoidError);
      roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      console.log(`Using fallback room code: ${roomCode}`);
    }
    
    // Create game object
    games[roomCode] = {
      roomCode,
      gridSize,
      players: [],
      grids: {},
      playerNumbers: {}, // Track which numbers are assigned to which player
      started: false,
      startTime: null,
      turnIndex: 0,
      turnDuration: 15, // seconds
      markedNumbers: new Set(),
      lastMarkedNumber: undefined,
      lastMarkedTurn: -1, // Initialize to -1 to ensure it doesn't match the first turn (0)
      createdAt: Date.now(),
      host: username,
      usedGrids: new Set() // Add tracking for used grids
    };
    
    console.log(`New game created: ${roomCode} by ${username}, grid size: ${gridSize}`);
    console.log(`Current games:`, Object.keys(games));
    
    // Return the room code to the client
    return res.status(201).json({ roomCode });
  } catch (error) {
    console.error('Error in game creation API:', error);
    return res.status(500).json({ error: 'Failed to create game: ' + error.message });
  }
});

app.post('/api/join-room', (req, res) => {
  try {
    const { roomCode } = req.body;
    
    if (!games[roomCode]) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    if (games[roomCode].started) {
      return res.status(400).json({ error: 'Game already in progress' });
    }
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error joining room:', error);
    return res.status(500).json({ error: 'Failed to join room' });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Leaderboard unavailable due to MongoDB connection issue' });
    }
    
    const leaderboard = await LeaderboardModel.find()
      .sort({ score: -1 })
      .limit(10);
    
    return res.status(200).json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mongodb: mongoConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Socket.io logic
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Handle player joining a room
  socket.on('join-room', ({ roomCode, username }) => {
    console.log(`Player ${username} (${socket.id}) joining room ${roomCode}`);
    
    try {
      // Check if room code is valid
      if (!roomCode) {
        console.log('Join attempt with invalid room code');
        socket.emit('join-error', { message: 'Invalid room code' });
        return;
      }
      
      const game = games[roomCode];
      if (!game) {
        console.log(`Room not found: ${roomCode}`);
        socket.emit('join-error', { message: 'Room not found' });
        return;
      }
      
      // Update game activity
      updateGameActivity(roomCode);
      
      // Store the room code in socket data for reconnection handling
      socket.data.roomCode = roomCode;
      
      if (game.started) {
        console.log(`Rejected join: Game already in progress, room: ${roomCode}`);
        socket.emit('join-error', { message: 'Game already in progress' });
        return;
      }
      
      // Check if player with same username already exists
      const existingPlayerIndex = game.players.findIndex(p => p.username === username);
      if (existingPlayerIndex !== -1) {
        // Update the existing player's socket ID
        const existingPlayer = game.players[existingPlayerIndex];
        console.log(`Player ${username} rejoining. Old ID: ${existingPlayer.id}, New ID: ${socket.id}`);
        
        // Update the socket ID
        existingPlayer.id = socket.id;
        
        // Update the grid reference
        if (game.grids[existingPlayer.id]) {
          game.grids[socket.id] = game.grids[existingPlayer.id];
          delete game.grids[existingPlayer.id];
        } else {
          // Generate a new grid using the improved system
          const grid = generateUniquePlayerGrid(game.gridSize, username, game.usedGrids);
          game.grids[socket.id] = grid;
        }
      } else {
        // Generate a new grid for new player
        const grid = generateUniquePlayerGrid(game.gridSize, username, game.usedGrids);
        game.grids[socket.id] = grid;
        
        // Add player to the game
        game.players.push({
          id: socket.id,
          username,
          joinedAt: Date.now()
        });
      }
      
      // Join the socket room
      socket.join(roomCode);
      
      // Emit success event with game state
      socket.emit('joined-room', {
        grid: game.grids[socket.id],
        players: game.players,
        isHost: game.players[0].id === socket.id
      });
      
      // Notify other players
      socket.to(roomCode).emit('player-joined', {
        players: game.players,
        player: { username }
      });
      
    } catch (error) {
      console.error('Error in join-room handler:', error);
      socket.emit('join-error', { message: 'Failed to join room' });
    }
  });
  
  // Handle starting the game
  socket.on('start-game', ({ roomCode }) => {
    const game = games[roomCode];
    if (!game) {
      return socket.emit('error', 'Room not found');
    }
    
    if (game.players.length < 1) {
      return socket.emit('error', 'Not enough players');
    }
    
    // Start the game
    game.started = true;
    game.startTime = Date.now();
    
    // Select the first player for the first turn
    game.currentTurn = game.players[0].id;
    
    // Make sure all players have a grid
    for (const player of game.players) {
      if (!game.grids[player.id] || !game.grids[player.id].length) {
        console.log(`Creating missing grid for player ${player.username} at game start`);
        const [rows, cols] = game.gridSize.split('x').map(Number);
        const total = rows * cols;
        
        // Generate a completely unique grid for this player
        // First, create a pool of numbers from 1 to total (e.g., 1-25 for 5x5)
        const allNumbers = Array.from({ length: total }, (_, i) => i + 1);
        
        // Shuffle the numbers
        for (let i = allNumbers.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allNumbers[i], allNumbers[j]] = [allNumbers[j], allNumbers[i]];
        }
        
        // Select numbers that aren't used by other players
        const selectedNumbers = [];
        const usedNumbersSet = new Set();
        
        // Collect all numbers used by other players
        for (const pid in game.grids) {
          if (pid !== player.id) {
            const playerGrid = game.grids[pid];
            if (playerGrid) {
              const flatGrid = playerGrid.flat();
              flatGrid.forEach(num => usedNumbersSet.add(num));
            }
          }
        }
        
        // Select unique numbers for this player
        for (const num of allNumbers) {
          if (!usedNumbersSet.has(num) && selectedNumbers.length < total) {
            selectedNumbers.push(num);
          }
          if (selectedNumbers.length >= total) break;
        }
        
        // Create the grid
        const newGrid = [];
        for (let i = 0; i < rows; i++) {
          const row = [];
          for (let j = 0; j < cols; j++) {
            const index = i * cols + j;
            if (index < selectedNumbers.length) {
              row.push(selectedNumbers[index]);
            }
          }
          newGrid.push(row);
        }
        
        // Store the grid
        game.grids[player.id] = newGrid;
        
        // Store which numbers belong to this player
        game.playerNumbers[player.id] = new Set(selectedNumbers);
      }
    }
    
    // Notify all players
    io.to(roomCode).emit('game-started', {
      players: game.players,
      currentTurn: game.currentTurn
    });
    
    // Send each player their own grid
    for (const player of game.players) {
      console.log(`Sending grid to player ${player.username} (${player.id}):`, JSON.stringify(game.grids[player.id]));
      io.to(player.id).emit('grid-assigned', game.grids[player.id]);
    }
    
    // Start the first turn
    startTurn(roomCode);
  });
  
  // Handle marking a number
  socket.on('mark-number', ({ roomCode, number }) => {
    console.log(`Player ${socket.id} attempting to mark number ${number} in room ${roomCode}`);
    const game = games[roomCode];
    
    if (!game) {
      return socket.emit('error', 'Room not found');
    }
    
    if (!game.started) {
      return socket.emit('error', 'Game has not started yet');
    }
    
    if (socket.id !== game.currentTurn) {
      return socket.emit('error', 'Not your turn');
    }
    
    // Check if the player already marked a number during this turn
    if (game.lastMarkedTurn === game.turnIndex && game.lastMarkedNumber !== undefined) {
      console.log(`Player ${socket.id} already marked number ${game.lastMarkedNumber} during this turn`);
      return socket.emit('error', 'You already marked a number during this turn');
    }
    
    // Check if the number is already marked
    if (game.markedNumbers.has(number)) {
      return socket.emit('error', 'This number is already marked');
    }
    
    // Check if the number exists in any player's grid
    let numberExists = false;
    for (const playerId in game.grids) {
      const playerGrid = game.grids[playerId];
      if (playerGrid && playerGrid.some(row => row.includes(number))) {
        numberExists = true;
        break;
      }
    }
    
    if (!numberExists) {
      return socket.emit('error', 'Invalid number');
    }
    
    // Clear the turn timer
    clearTimeout(game.timer);
    
    console.log(`Player ${socket.id} marked number ${number} in room ${roomCode}`);
    
    // Mark the number
    game.markedNumbers.add(number);
    
    // Update last marked info for tracking
    game.lastMarkedNumber = number;
    game.lastMarkedTurn = game.turnIndex;
    
    // Find the player who marked the number
    const player = game.players.find(p => p.id === socket.id);
    
    // Notify all players
    io.to(roomCode).emit('number-marked', {
      number,
      markedBy: socket.id,
      player: player,
      automatic: false
    });
    
    // Check for a winner
    const winner = checkWin(game);
    if (winner) {
      const winningPlayer = game.players.find(p => p.id === winner.playerId);
      
      // Calculate score based on time and turns
      const gameTime = (Date.now() - game.startTime) / 1000;
      const score = Math.max(100 - Math.floor(gameTime / 10), 10);
      
      // Update winning player's score
      winningPlayer.score += score;
      
      // Save to leaderboard
      updateLeaderboard(winningPlayer, score);
      
      // Notify all players of the winner
      io.to(roomCode).emit('game-won', {
        player: winningPlayer,
        lines: winner.lines,
        score
      });
      
      // End the game
      game.started = false;
      return;
    }
    
    // Move to next turn
    moveToNextTurn(roomCode);
  });
  
  // Handle end-turn (when timer expires or player manually ends their turn)
  socket.on('end-turn', ({ roomCode }) => {
    console.log(`Player ${socket.id} ended their turn in room ${roomCode}`);
    const game = games[roomCode];
    
    if (!game) {
      return socket.emit('error', 'Room not found');
    }
    
    if (!game.started) {
      return socket.emit('error', 'Game has not started yet');
    }
    
    // Only the current player can end their turn
    if (socket.id !== game.currentTurn) {
      console.log(`Not ${socket.id}'s turn to end! Current turn: ${game.currentTurn}`);
      return socket.emit('error', 'Not your turn');
    }
    
    // Clear the turn timer
    clearTimeout(game.timer);
    
    // Check if the player didn't mark any number during their turn
    // This logic compares the current turnIndex with the last marked turn index
    const playerDidntMarkNumber = game.lastMarkedTurn !== game.turnIndex || typeof game.lastMarkedNumber === 'undefined';
    console.log(`Player marked number check: last marked turn ${game.lastMarkedTurn}, current turn index ${game.turnIndex}, result: ${playerDidntMarkNumber ? 'did not mark' : 'did mark'}`);
    
    if (playerDidntMarkNumber) {
      const playerGrid = game.grids[socket.id];
      if (playerGrid) {
        const flatGrid = playerGrid.flat();
        const unmarkedNumbers = flatGrid.filter(num => !game.markedNumbers.has(num));
        
        if (unmarkedNumbers.length > 0) {
          // Pick a random unmarked number
          const randomIndex = Math.floor(Math.random() * unmarkedNumbers.length);
          const randomNumber = unmarkedNumbers[randomIndex];
          
          console.log(`Player ${socket.id} did not mark a number, automatically marking ${randomNumber}`);
          
          // Mark the number
          game.markedNumbers.add(randomNumber);
          
          // Update last marked info
          game.lastMarkedNumber = randomNumber;
          game.lastMarkedTurn = game.turnIndex;
          
          // Find the player
          const player = game.players.find(p => p.id === socket.id);
          
          // Notify all players of the automatic marking
          io.to(roomCode).emit('number-marked', {
            number: randomNumber,
            markedBy: socket.id,
            player: player,
            automatic: true
          });
          
          // Check for winner after automatic marking
          const winner = checkWin(game);
          if (winner) {
            const winningPlayer = game.players.find(p => p.id === winner.playerId);
            
            // Calculate score based on time and turns
            const gameTime = (Date.now() - game.startTime) / 1000;
            const score = Math.max(100 - Math.floor(gameTime / 10), 10);
            
            // Update winning player's score
            winningPlayer.score += score;
            
            // Save to leaderboard
            updateLeaderboard(winningPlayer, score);
            
            // Notify all players
            io.to(roomCode).emit('game-won', {
              player: winningPlayer,
              lines: winner.lines,
              score
            });
            
            // Don't go to next turn if we have a winner
            return;
          }
        }
      }
    }
    
    console.log(`Moving to next player's turn after ${socket.id} ended their turn in room ${roomCode}`);
    
    // Increment the turn index for the game
    game.turnIndex++;
    
    // Move to the next player's turn
    nextTurn(roomCode);
  });
  
  // Handle grid request (for debugging)
  socket.on('request-grid', ({ roomCode }) => {
    console.log(`Player ${socket.id} requesting grid for room ${roomCode}`);
    const game = games[roomCode];
    
    if (!game) {
      return socket.emit('error', 'Room not found');
    }
    
    // Check if player has a grid
    if (game.grids[socket.id]) {
      console.log(`Sending requested grid to player ${socket.id}:`, JSON.stringify(game.grids[socket.id]));
      socket.emit('grid-assigned', game.grids[socket.id]);
    } else {
      console.log(`No grid found for player ${socket.id}, generating new grid`);
      
      // Find the player
      const player = game.players.find(p => p.id === socket.id);
      if (!player) {
        return socket.emit('error', 'Player not found in game');
      }
      
      // Parse grid size
      const [rows, cols] = game.gridSize.split('x').map(Number);
      const total = rows * cols;
      
      // Generate a completely unique grid for this player
      // First, create a pool of numbers from 1 to total (e.g., 1-25 for 5x5)
      const allNumbers = Array.from({ length: total }, (_, i) => i + 1);
      
      // Shuffle the numbers
      for (let i = allNumbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allNumbers[i], allNumbers[j]] = [allNumbers[j], allNumbers[i]];
      }
      
      // Create the grid
      const newGrid = [];
      for (let i = 0; i < rows; i++) {
        const row = [];
        for (let j = 0; j < cols; j++) {
          const index = i * cols + j;
          if (index < allNumbers.length) {
            row.push(allNumbers[index]);
          }
        }
        newGrid.push(row);
      }
      
      // Store the grid
      game.grids[socket.id] = newGrid;
      
      console.log(`Generated and sending new grid to player ${socket.id}:`, JSON.stringify(newGrid));
      socket.emit('grid-assigned', newGrid);
    }
  });
  
  // Handle player disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    const roomCode = socket.data.roomCode;
    if (roomCode && games[roomCode]) {
      const game = games[roomCode];
      
      // Remove player from the game
      game.players = game.players.filter(player => player.id !== socket.id);
      
      // Clean up player's grid
      delete game.grids[socket.id];
      
      // If it was this player's turn, move to the next player
      if (game.currentTurn === socket.id) {
        clearTimeout(game.timer);
        
        if (game.players.length > 0) {
          nextTurn(roomCode);
        }
      }
      
      // If no players left, clean up the game
      if (game.players.length === 0) {
        delete games[roomCode];
      } else {
        // Notify remaining players
        io.to(roomCode).emit('player-left', {
          players: game.players,
          disconnectedId: socket.id
        });
      }
    }
  });
});

// Helper function to start a turn
function startTurn(roomCode) {
  const game = games[roomCode];
  if (!game) {
    console.error(`Cannot start turn: Game not found for room ${roomCode}`);
    return;
  }
  
  if (!game.players || game.players.length === 0) {
    console.error(`Cannot start turn: No players in room ${roomCode}`);
    return;
  }
  
  if (!game.currentTurn) {
    console.error(`No current turn set for room ${roomCode}, setting to first player`);
    game.currentTurn = game.players[0].id;
  }
  
  // Find the current player
  let currentPlayer = game.players.find(p => p.id === game.currentTurn);
  if (!currentPlayer) {
    console.error(`Current player ${game.currentTurn} not found in room ${roomCode}`);
    // Failsafe: set to first player
    game.currentTurn = game.players[0].id;
    currentPlayer = game.players[0];
  }
  
  console.log(`Starting turn for ${currentPlayer.username} (${game.currentTurn}) in room ${roomCode}`);
  
  // Notify all players about whose turn it is
  io.to(roomCode).emit('turn-started', {
    playerId: game.currentTurn,
    player: currentPlayer
  });
  
  // Set a timer for this turn (15 seconds)
  clearTimeout(game.timer); // Clear any existing timer
  game.timer = setTimeout(() => {
    console.log(`Timer expired for ${currentPlayer.username} (${game.currentTurn}) in room ${roomCode}`);
    
    // Get unmarked numbers
    const unmarked = getUnmarkedNumbers(game);
    
    if (unmarked.length > 0) {
      // Select a random unmarked number
      const randomNum = unmarked[Math.floor(Math.random() * unmarked.length)];
      
      // Find the current player
      const currentPlayer = game.players.find(p => p.id === game.currentTurn);
      
      // Mark the number
      game.markedNumbers.add(randomNum);
      
      console.log(`Automatically marking number ${randomNum} for ${currentPlayer.username} in room ${roomCode}`);
      
      // Notify all players
      io.to(roomCode).emit('number-marked', {
        number: randomNum,
        markedBy: game.currentTurn,
        player: currentPlayer,
        automatic: true
      });
      
      // Check for a winner
      const winner = checkWin(game);
      if (winner) {
        const winningPlayer = game.players.find(p => p.id === winner.playerId);
        
        // Calculate score based on time and turns
        const gameTime = (Date.now() - game.startTime) / 1000;
        const score = Math.max(100 - Math.floor(gameTime / 10), 10);
        
        // Update winning player's score
        winningPlayer.score += score;
        
        console.log(`Player ${winningPlayer.username} won in room ${roomCode}`);
        
        // Save to leaderboard
        updateLeaderboard(winningPlayer, score);
        
        // Notify all players
        io.to(roomCode).emit('game-won', {
          player: winningPlayer,
          lines: winner.lines,
          score
        });
        
        // Clean up game resources
        setTimeout(() => {
          delete games[roomCode];
        }, 1000 * 60 * 10); // Keep game data for 10 minutes
      } else {
        // Continue to next turn
        nextTurn(roomCode);
      }
    } else {
      console.log(`No unmarked numbers left in room ${roomCode}`);
    }
  }, 15000);
}

// Helper function to move to the next turn
function nextTurn(roomCode) {
  const game = games[roomCode];
  if (!game || !game.players || game.players.length === 0) return;
  
  // Find the current player's index
  const currentIndex = game.players.findIndex(p => p.id === game.currentTurn);
  
  // If invalid current index, start with the first player
  if (currentIndex === -1) {
    game.currentTurn = game.players[0].id;
  } else {
    // Move to the next player (cyclic)
    const nextIndex = (currentIndex + 1) % game.players.length;
    game.currentTurn = game.players[nextIndex].id;
  }
  
  // Reset the lastMarkedNumber for the new turn
  game.lastMarkedNumber = undefined;
  game.lastMarkedTurn = game.turnIndex;
  
  console.log(`Next turn: ${game.currentTurn} in room ${roomCode}`);
  
  // Start the new turn
  startTurn(roomCode);
}

// Helper function to update the leaderboard
async function updateLeaderboard(player, score) {
  try {
    if (!mongoConnected) {
      console.log('Skipping leaderboard update due to MongoDB connection issue');
      return;
    }
    
    // Find existing entry or create new one
    let leaderboardEntry = await LeaderboardModel.findOne({ username: player.username });
    
    if (leaderboardEntry) {
      // Update existing entry
      leaderboardEntry.gamesPlayed += 1;
      leaderboardEntry.gamesWon += 1;
      leaderboardEntry.totalScore += score;
      leaderboardEntry.highScore = Math.max(leaderboardEntry.highScore, score);
    } else {
      // Create new entry
      leaderboardEntry = new LeaderboardModel({
        username: player.username,
        gamesPlayed: 1,
        gamesWon: 1,
        totalScore: score,
        highScore: score
      });
    }
    
    // Save the entry
    await leaderboardEntry.save();
  } catch (error) {
    console.error('Error updating leaderboard:', error);
  }
}

// Start the server
const PORT = 5000; // Server should run on port 5000 according to project specifications
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
