const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { nanoid } = require('nanoid');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const LeaderboardModel = require('./models/leaderboard');
const gameUtils = require('./utils/gameUtils');

// Destructure the imported functions
const { generateGrid, generateUniqueGrid, getUnmarkedNumbers, generateUniquePlayerGrid } = gameUtils;
const checkWinUtils = gameUtils.checkWin;

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();

// Update CORS configuration
const corsOptions = {
  origin: ['https://bingo-buzz.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200,
  preflightContinue: false
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Add headers middleware to ensure CORS headers are set
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://bingo-buzz.vercel.app');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

app.use(express.json()); // Add JSON body parser middleware

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: ['https://bingo-buzz.vercel.app', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  },
  pingTimeout: 30000,
  pingInterval: 10000,
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 1e6,
  perMessageDeflate: {
    threshold: 1024
  },
  connectTimeout: 45000,
  path: '/socket.io/'
});

// Add game cleanup mechanism
const GAME_CLEANUP_INTERVAL = 1000 * 60 * 15; // 15 minutes
const GAME_TIMEOUT = 1000 * 60 * 60 * 24; // 24 hours
const INACTIVE_GAME_TIMEOUT = 1000 * 60 * 30; // 30 minutes

// Track active connections
const activeConnections = new Map();

// Add DEBUG flag to control logging
const DEBUG = false;

// Split logs by importance level - keep critical logs, wrap frequent ones in DEBUG flag
const LOG_LEVELS = {
  ERROR: true,    // Always show errors
  INFO: true,     // Show informational logs
  DEBUG: DEBUG    // Only show debug logs when DEBUG is true
};

// Add memory monitoring
function logMemoryUsage() {
  if (!LOG_LEVELS.DEBUG) return;
  
  const memoryUsage = process.memoryUsage();
  console.log('Memory usage:');
  console.log(`  RSS: ${Math.round(memoryUsage.rss / 1024 / 1024)} MB`);
  console.log(`  Heap Total: ${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`);
  console.log(`  Heap Used: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`);
}

// Set up error handling for uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  // Perform cleanup if necessary
  cleanupOldGames();
  // Don't exit the process, but log the error
});

// Set up error handling for unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  // Perform cleanup if necessary
  cleanupOldGames();
});

// Add periodic memory checks and cleanup
setInterval(() => {
  logMemoryUsage();
  cleanupOldGames();
}, 60000); // Run every minute

// Modify cleanupOldGames to be more efficient
function cleanupOldGames() {
  const now = Date.now();
  const cutoffTime = now - (2 * 60 * 60 * 1000); // 2 hours
  
  let cleanupCount = 0;
  const roomsToDelete = [];
  
  // First identify rooms to delete to avoid modifying during iteration
  for (const roomCode in games) {
    const game = games[roomCode];
    if (!game) continue;
    
    if (!game.lastActive || game.lastActive < cutoffTime) {
      roomsToDelete.push(roomCode);
    }
  }
  
  // Then delete the identified rooms
  roomsToDelete.forEach(roomCode => {
    delete games[roomCode];
    cleanupCount++;
  });
  
  if (cleanupCount > 0 && LOG_LEVELS.INFO) {
    console.log(`Cleaned up ${cleanupCount} inactive games`);
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

    // Handle connection inside a try/catch to prevent crashing the entire server
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bingo-buzz', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      connectTimeoutMS: 30000,
      // Disable buffering to prevent memory issues
      bufferCommands: false,
    }).catch(err => {
      throw err;  // Re-throw to be caught by the outer catch
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
      // Ensure the app continues to function without MongoDB
      mongoConnected = false;
      // Emit a server-wide event to notify about MongoDB status
      io && io.emit && io.emit('mongodb-status', { connected: false });
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

// Add rate limiting for all routes
app.use((req, res, next) => {
  // Simple rate limiting by IP
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const now = Date.now();
  const rateLimitData = activeConnections.get(ip) || { count: 0, resetTime: now + 60000 };
  
  // Reset count after 1 minute
  if (now > rateLimitData.resetTime) {
    rateLimitData.count = 0;
    rateLimitData.resetTime = now + 60000;
  }
  
  // Increment request count
  rateLimitData.count++;
  activeConnections.set(ip, rateLimitData);
  
  // If too many requests, return 429
  if (rateLimitData.count > 100) { // 100 requests per minute
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  
  next();
});

// Fix API endpoints
app.post('/api/games', async (req, res) => {
  try {
    console.log('Received game creation request:', req.body);
    
    // Check if request body exists and has content
    if (!req.body || Object.keys(req.body).length === 0) {
      console.error('Game creation failed: Empty request body');
      return res.status(400).json({ 
        error: 'Empty request body',
        message: 'Please provide a username and grid size'
      });
    }
    
    const { username, gridSize = '5x5' } = req.body;
    
    if (!username) {
      console.log('Game creation failed: Username is required');
      return res.status(400).json({ 
        error: 'Username is required',
        message: 'Please provide a username to create a game'
      });
    }
    
    console.log(`Creating game with username: ${username}, grid size: ${gridSize}`);
    
    // Check the total number of active games to prevent resource exhaustion
    if (Object.keys(games).length > 500) {
      return res.status(503).json({ 
        error: 'Server at capacity',
        message: 'Too many active games. Please try again later.'
      });
    }
    
    // Generate a unique room code
    let roomCode;
    let attempts = 0;
    
    const generateCode = () => {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      return Array(6).fill().map(() => letters[Math.floor(Math.random() * letters.length)]).join('');
    };
    
    do {
      roomCode = generateCode();
      attempts++;
      if (attempts > 10) {
        return res.status(500).json({ 
          error: 'Room code generation failed',
          message: 'Could not generate a unique room code. Please try again.'
        });
      }
    } while (games[roomCode]);
    
    // Create game object
    games[roomCode] = {
      roomCode,
      gridSize,
      players: [],
      grids: {},
      playerNumbers: {},
      started: false,
      startTime: null,
      turnIndex: 0,
      turnDuration: 15000,
      markedNumbers: new Set(),
      lastMarkedNumber: undefined,
      lastMarkedTurn: -1,
      createdAt: Date.now(),
      lastActive: Date.now(),
      hostUsername: username,
      usedGrids: new Set(),
      readyPlayers: []
    };
    
    console.log(`New game created: ${roomCode} by ${username}, grid size: ${gridSize}`);
    
    // Return the room code to the client
    return res.status(201).json({ 
      roomCode,
      message: 'Game created successfully'
    });
  } catch (error) {
    console.error('Error in game creation API:', error);
    return res.status(500).json({ 
      error: 'Server error',
      message: 'Failed to create game. Please try again.',
      details: error.message
    });
  }
});

// Add a compatibility endpoint for the original /api/create-game path
app.post('/api/create-game', async (req, res) => {
  // Simply forward to the main endpoint
  try {
    const result = await new Promise((resolve, reject) => {
      app._router.handle(
        { ...req, url: '/api/games', path: '/api/games' },
        { ...res, send: resolve },
        reject
      );
    });
    return result;
  } catch (error) {
    console.error('Error forwarding to /api/games:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Add a comprehensive health check endpoint for Railway
app.get('/health', (req, res) => {
  try {
    // Check MongoDB status
    const dbStatus = mongoConnected ? 'connected' : 'disconnected';
    
    // Calculate uptime
    const uptime = process.uptime();
    const uptimeFormatted = {
      days: Math.floor(uptime / 86400),
      hours: Math.floor((uptime % 86400) / 3600),
      minutes: Math.floor((uptime % 3600) / 60),
      seconds: Math.floor(uptime % 60)
    };
    
    // Get memory usage
    const memoryUsage = process.memoryUsage();
    const memoryStats = {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`
    };
    
    // Get active games and players count
    const gamesCount = Object.keys(games).length;
    let totalPlayers = 0;
    let activePlayers = 0;
    
    for (const [roomCode, game] of Object.entries(games)) {
      const game = games[roomCode];
      if (game && game.players) {
        totalPlayers += game.players.length;
        activePlayers += game.players.filter(p => p.connected !== false).length;
      }
    }
    
    const stats = {
      status: 'healthy',
      version: process.env.npm_package_version || '1.0.0',
      database: {
        status: dbStatus,
        retries: mongoRetryCount
      },
      uptime: uptimeFormatted,
      memory: memoryStats,
      games: {
        active: gamesCount,
        totalPlayers,
        activePlayers,
        connectionCount: io.engine.clientsCount || 0
      },
      timestamp: new Date().toISOString()
    };
    
    // Set response headers for no caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    return res.status(200).json(stats);
  } catch (error) {
    console.error('Health check error:', error);
    return res.status(500).json({ 
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Add a root route for basic connectivity verification
app.get('/', (req, res) => {
  res.status(200).send({
    status: 'online',
    service: 'Bingo Buzz API',
    version: process.env.npm_package_version || '1.0.0',
    endpoints: [
      { path: '/api/games', method: 'POST', description: 'Create a new game' },
      { path: '/api/create-game', method: 'POST', description: 'Create a new game (alias)' },
      { path: '/health', method: 'GET', description: 'Get server health status' }
    ],
    message: 'Welcome to the Bingo Buzz API. Use Socket.IO to connect for real-time gameplay.'
  });
});

// Socket.io logic
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Add connection to active tracking
  const socketInfo = { 
    connectedAt: Date.now(),
    rooms: new Set(),
    lastActivity: Date.now(),
    reconnectAttempts: 0
  };
  
  activeConnections.set(socket.id, socketInfo);
  
  // Track socket activity
  const updateActivity = () => {
    const info = activeConnections.get(socket.id);
    if (info) {
      info.lastActivity = Date.now();
      activeConnections.set(socket.id, info);
    }
  };
  
  // Apply activity tracking to all events
  socket.onAny(updateActivity);

  // Handle connection errors
  socket.on('connect_error', (error) => {
    console.error(`Connection error for socket ${socket.id}:`, error);
    const info = activeConnections.get(socket.id);
    if (info) {
      info.reconnectAttempts++;
      activeConnections.set(socket.id, info);
    }
  });

  // Handle reconnection attempts
  socket.on('reconnect_attempt', (attemptNumber) => {
    console.log(`Socket ${socket.id} attempting to reconnect (attempt ${attemptNumber})`);
  });

  // Handle successful reconnection
  socket.on('reconnect', (attemptNumber) => {
    console.log(`Socket ${socket.id} reconnected successfully after ${attemptNumber} attempts`);
    const info = activeConnections.get(socket.id);
    if (info) {
      info.reconnectAttempts = 0;
      info.lastActivity = Date.now();
      activeConnections.set(socket.id, info);
    }
  });

  // Handle ping from client
  socket.on('ping', () => {
    const connection = activeConnections.get(socket.id);
    if (connection) {
      connection.lastActivity = Date.now();
      activeConnections.set(socket.id, connection);
    }
    socket.emit('pong');
  });

  // Handle disconnection with improved error handling
  socket.on('disconnect', (reason) => {
    console.log('Client disconnected:', socket.id, 'Reason:', reason);
    
    // Find and handle player disconnection from any active games
    for (const [roomCode, game] of Object.entries(games)) {
      const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== -1) {
        const player = game.players[playerIndex];
        console.log(`Player ${player.username} disconnected from room ${roomCode}`);
        
        // Notify other players
        socket.to(roomCode).emit('player-disconnected', {
          username: player.username,
          temporary: reason === 'transport close' || reason === 'ping timeout'
        });
        
        // If it's a temporary disconnection, keep the player in the game
        if (reason === 'transport close' || reason === 'ping timeout') {
          player.connected = false;
          player.lastDisconnect = Date.now();
          player.disconnectReason = reason;
          
          // Set a timeout to remove the player if they don't reconnect
          setTimeout(() => {
            const currentGame = games[roomCode];
            if (currentGame) {
              const playerStillDisconnected = currentGame.players.find(
                p => p.socketId === socket.id && !p.connected
              );
              if (playerStillDisconnected) {
                console.log(`Removing player ${player.username} after timeout`);
                currentGame.players = currentGame.players.filter(p => p.socketId !== socket.id);
                if (currentGame.players.length === 0) {
                  delete games[roomCode];
                }
              }
            }
          }, 60000); // 1 minute timeout
        } else {
          // Remove player for permanent disconnections
          game.players.splice(playerIndex, 1);
          
          // If no players left, schedule game for cleanup
          if (game.players.length === 0) {
            game.lastActivity = Date.now() - INACTIVE_GAME_TIMEOUT;
          }
        }
        
        // Update game state
        updateGameActivity(roomCode);
      }
    }
    
    // Clean up connection tracking
    activeConnections.delete(socket.id);
  });

  // Handle reconnection
  socket.on('rejoin-room', async ({ roomCode, username }) => {
    console.log(`Player ${username} attempting to rejoin room ${roomCode}`);
    
    const game = games[roomCode];
    if (!game) {
      socket.emit('rejoin-error', { message: 'Game not found' });
      return;
    }
    
    const existingPlayer = game.players.find(p => p.username === username && !p.connected);
    if (existingPlayer) {
      existingPlayer.connected = true;
      existingPlayer.socketId = socket.id;
      delete existingPlayer.lastDisconnect;
      
      // Join the socket room
      socket.join(roomCode);
      
      // Send current game state
      socket.emit('game-state', {
        players: game.players,
        grid: game.grids[username],
        currentTurn: game.players[game.turnIndex]?.username,
        markedNumbers: Array.from(game.markedNumbers),
        lastMarkedNumber: game.lastMarkedNumber
      });
      
      // Notify other players
      socket.to(roomCode).emit('player-reconnected', { username });
      
      console.log(`Player ${username} successfully rejoined room ${roomCode}`);
    } else {
      socket.emit('rejoin-error', { message: 'Player not found in game' });
    }
  });

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
      let playerGrid;
      
      if (existingPlayerIndex !== -1) {
        // Update the existing player's socket ID
        const existingPlayer = game.players[existingPlayerIndex];
        console.log(`Player ${username} rejoining. Old ID: ${existingPlayer.id}, New ID: ${socket.id}`);
        
        // Update the socket ID
        existingPlayer.id = socket.id;
        
        // Get the existing grid or generate a new one
        playerGrid = game.grids[existingPlayer.id] || generateUniquePlayerGrid(game.gridSize, username, game.usedGrids);
        game.grids[socket.id] = playerGrid;
        
        // Clean up old grid reference
        if (existingPlayer.id !== socket.id) {
          delete game.grids[existingPlayer.id];
        }
      } else {
        // Generate a new grid for new player
        playerGrid = generateUniquePlayerGrid(game.gridSize, username, game.usedGrids);
        game.grids[socket.id] = playerGrid;
        
        // Add player to the game
        game.players.push({
          id: socket.id,
          username,
          joinedAt: Date.now()
        });
      }
      
      // Join the socket room
      socket.join(roomCode);
      
      // Log the grid being sent
      console.log(`Sending grid to player ${username} (${socket.id}):`, JSON.stringify(playerGrid));
      
      // Extract usernames for readyPlayers to ensure consistent data structure
      const readyPlayerUsernames = (game.readyPlayers || []).map(player => 
        typeof player === 'string' ? player : player.username
      );
      
      // Determine if this player is the host (by username, not socket ID)
      const isHost = username === game.hostUsername;
      console.log(`Checking if ${username} is host. Game host username: ${game.hostUsername}, Result: ${isHost}`);
      
      // Emit success event with game state
      socket.emit('joined-room', {
        grid: playerGrid,
        players: game.players.map(player => ({ 
          id: player.id, 
          username: player.username
        })),
        isHost: isHost,
        gameStarted: game.started,
        readyPlayers: readyPlayerUsernames
      });
      
      // Also emit a separate grid-assigned event to ensure the client receives it
      socket.emit('grid-assigned', playerGrid);
      
      // Notify other players
      socket.to(roomCode).emit('player-joined', {
        players: game.players.map(player => ({ 
          id: player.id, 
          username: player.username
        })),
        player: { id: socket.id, username }
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
    
    // Find the player
    const player = game.players.find(p => p.id === socket.id);
    if (!player) {
      return socket.emit('error', 'Player not found');
    }
    
    console.log(`Attempting to start game. Host username: ${game.hostUsername}, Current player: ${player.username}, Is host: ${player.username === game.hostUsername}`);
    
    // Only host can start the game
    if (player.username !== game.hostUsername) {
      console.log(`Player ${player.username} attempted to start game but is not host (${game.hostUsername})`);
      return socket.emit('error', 'Only the host can start the game');
    }
    
    // Initialize readyPlayers array if not exists
    if (!game.readyPlayers) {
      game.readyPlayers = [];
    }
    
    // Get host username
    const hostUsername = game.hostUsername;
    
    // Check if there are at least 2 players and someone other than the host is ready
    // Or if single player mode is supported, just check if the host is ready
    const hasEnoughReadyPlayers = game.readyPlayers.length >= 1;
    
    // Check if host is ready (unless the game only has one player)
    const isHostReady = (game.players.length === 1) || 
                        (game.readyPlayers.includes(hostUsername));
                        
    if (!hasEnoughReadyPlayers) {
      return socket.emit('error', 'Not enough players are ready to start the game');
    }
    
    // If the host is not ready, they should be ready to start the game
    if (!isHostReady && game.players.length > 1) {
      return socket.emit('error', 'Host must be ready to start the game');
    }
    
    console.log(`Starting game in room ${roomCode} with ${game.players.length} players`);
    
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
      currentTurn: game.currentTurn,
      grid: game.grids[socket.id] // Each player gets their own grid
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
    if (LOG_LEVELS.DEBUG) console.log(`mark-number event received from player ${socket.id}, number: ${number}, room: ${roomCode}`);
    
    const game = games[roomCode];
    if (!game) {
      return socket.emit('error', 'Room not found');
    }
    
    // Update game activity
    updateGameActivity(roomCode);
    
    if (!game.started) {
      return socket.emit('error', 'Game has not started yet');
    }
    
    // Only the current player can mark a number
    if (game.currentTurn !== socket.id) {
      return socket.emit('error', 'Not your turn');
    }
    
    // Find the player
    const player = game.players.find(p => p.id === socket.id);
    if (!player) {
      return socket.emit('error', 'Player not found in game');
    }
    
    // Convert to number if it's a string
    if (typeof number === 'string') {
      number = parseInt(number, 10);
    }
    
    // Validate that number is a valid integer
    if (typeof number !== 'number' || isNaN(number)) {
      return socket.emit('error', 'Invalid number format');
    }
    
    // Check if the number is already marked
    if (game.markedNumbers.has(number)) {
      return socket.emit('error', 'This number is already marked');
    }
    
    try {
      // Mark the number in the global set
      game.markedNumbers.add(number);
      game.lastMarkedNumber = number;
      game.lastMarkedTurn = game.turnIndex;
      
      // Clear any active turn timer
      if (game.timer) {
        clearTimeout(game.timer);
        game.timer = null;
      }
      
      // Notify all players
      io.to(roomCode).emit('number-marked', {
        number: number,
        markedBy: socket.id,
        player: player,
        automatic: false
      });
      
      // Check for a winner
      const winner = checkWinUtils(game);
      if (winner) {
        const winningPlayer = game.players.find(p => p.id === winner.playerId);
        
        // Calculate score
        const gameTime = (Date.now() - game.startTime) / 1000;
        const score = Math.max(100 - Math.floor(gameTime / 10), 10);
        
        // Update winning player's score
        winningPlayer.score = (winningPlayer.score || 0) + score;
        
        // Save to leaderboard
        updateLeaderboard(winningPlayer, score);
        
        // Notify all players
        io.to(roomCode).emit('game-won', {
          player: winningPlayer,
          lines: winner.lines,
          score
        });
        
        // End the game
        game.started = false;
      } else {
        // Move to next turn
        game.turnIndex = (game.turnIndex + 1) % game.players.length;
        game.currentTurn = game.players[game.turnIndex].id;
        
        // Emit turn changed to all players
        const nextPlayer = game.players[game.turnIndex];
        io.to(roomCode).emit('turn-changed', {
          currentTurn: game.currentTurn,
          player: nextPlayer
        });
        
        // Start the new turn
        startTurn(roomCode);
      }
    } catch (error) {
      console.error('Error handling mark-number:', error);
      socket.emit('error', 'Server error processing your move');
    }
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
          const winner = checkWinUtils(game);
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
  
  // Handle request-grid event with improved synchronization
  socket.on('request-grid', ({ roomCode }) => {
    console.log(`Player ${socket.id} requesting grid for room ${roomCode}`);
    const game = games[roomCode];
    
    if (!game) {
      return socket.emit('error', 'Room not found');
    }
    
    // Check if player exists in game
      const player = game.players.find(p => p.id === socket.id);
      if (!player) {
      console.log(`Player ${socket.id} not found in game ${roomCode}, cannot send grid`);
        return socket.emit('error', 'Player not found in game');
      }
      
    // Get this player's grid
    const playerGrid = game.grids[socket.id];
    
    if (playerGrid) {
      console.log(`Sending requested grid to player ${socket.id} (${player.username}):`, JSON.stringify(playerGrid));
      
      // Emit grid first, and don't send marked numbers immediately
      socket.emit('grid-assigned', playerGrid);
      
      // Wait for client to acknowledge grid reception before sending marked numbers
      setTimeout(() => {
        if (game.started) {
          // Send information about current turn
          const currentTurnPlayer = game.players.find(p => p.id === game.currentTurn);
          socket.emit('turn-changed', {
            currentTurn: game.currentTurn,
            player: currentTurnPlayer
          });
          
          // Send marked numbers separately after a delay
          setTimeout(() => {
            if (game.markedNumbers && game.markedNumbers.size > 0) {
              console.log(`Sending ${game.markedNumbers.size} marked numbers to player ${socket.id} after grid acknowledged`);
              
              // Convert Set to Array for sending
              const markedNumbersArray = Array.from(game.markedNumbers);
              socket.emit('sync-marked-numbers', {
                markedNumbers: markedNumbersArray
              });
            }
          }, 1000); // Wait 1 second after turn info to send marked numbers
        }
      }, 500); // Wait 500ms after grid to send turn info
    } else {
      console.log(`No grid found for player ${socket.id} (${player.username}), generating new grid`);
      
      // Generate a new grid for this player
      const [rows, cols] = game.gridSize.split('x').map(Number);
      const total = rows * cols;
      
      // Create a pool of numbers from 1 to total (e.g., 1-25 for 5x5)
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
      
      // Save the grid
      game.grids[socket.id] = newGrid;
      
      // Send the grid to the player first
      console.log(`Sending new grid to player ${socket.id} (${player.username}):`, JSON.stringify(newGrid));
      socket.emit('grid-assigned', newGrid);
      
      // Wait for client to acknowledge grid reception before sending marked numbers
      setTimeout(() => {
        // Also send marked numbers if game has started
        if (game.started && game.markedNumbers && game.markedNumbers.size > 0) {
          console.log(`Sending ${game.markedNumbers.size} marked numbers to player ${socket.id} after grid reception`);
          
          // Convert Set to Array for sending
          const markedNumbersArray = Array.from(game.markedNumbers);
          socket.emit('sync-marked-numbers', {
            markedNumbers: markedNumbersArray
          });
        }
      }, 1000); // Wait 1 second before sending marked numbers
    }
  });

  // Handle player ready state toggling
  socket.on('toggle-ready', ({ roomCode, username, isReady }) => {
    console.log(`Player ${username} toggled ready state to ${isReady} in room ${roomCode}`);
    const game = games[roomCode];
    
    if (!game) {
      return socket.emit('error', 'Room not found');
    }
    
    // Initialize readyPlayers array if not exists
    if (!game.readyPlayers) {
      game.readyPlayers = [];
    }
    
    // Update ready state
    if (isReady) {
      // Add to ready players if not already there
      if (!game.readyPlayers.includes(username)) {
        game.readyPlayers.push(username);
      }
    } else {
      // Remove from ready players
      game.readyPlayers = game.readyPlayers.filter(player => 
        typeof player === 'string' 
          ? player !== username 
          : player.username !== username
      );
    }
    
    // Notify all players of the ready state change
    io.to(roomCode).emit('player-ready', {
      username,
      readyPlayers: game.readyPlayers
  });
});

  // Handle request for already marked numbers (when a client gets its grid or reconnects)
  socket.on('request-marked-numbers', ({ roomCode }) => {
    console.log(`Player ${socket.id} requesting marked numbers for room ${roomCode}`);
  const game = games[roomCode];
    
  if (!game) {
      return socket.emit('error', 'Room not found');
    }
    
    // Find the player
    const player = game.players.find(p => p.id === socket.id);
    if (!player) {
      return socket.emit('error', 'Player not found in game');
    }
    
    if (!game.markedNumbers || game.markedNumbers.size === 0) {
      console.log(`No marked numbers to send for room ${roomCode}`);
    return;
  }
  
    // Convert the Set to an Array for sending
    const markedNumbersArray = Array.from(game.markedNumbers);
    console.log(`Sending ${markedNumbersArray.length} marked numbers to player ${socket.id} in room ${roomCode}:`, markedNumbersArray);
    
    // Send all marked numbers in a single sync event
    socket.emit('sync-marked-numbers', {
      markedNumbers: markedNumbersArray
    });
  });

  // Handle grid-ready acknowledgment from client
  socket.on('grid-ready', ({ roomCode }) => {
    if (LOG_LEVELS.DEBUG) console.log(`Player ${socket.id} acknowledged grid reception for room ${roomCode}`);
    
    const game = games[roomCode];
    if (!game) return;
    
    const player = game.players.find(p => p.id === socket.id);
    if (!player) return;
    
    // Mark that this player's grid is ready
    player.gridReady = true;
    
    // Send marked numbers if there are any
    if (game.markedNumbers.size > 0) {
      if (LOG_LEVELS.DEBUG) console.log(`Sending ${game.markedNumbers.size} marked numbers to player ${socket.id} immediately after grid-ready acknowledgment`);
      
      const markedNumbersArray = Array.from(game.markedNumbers);
      socket.emit('sync-marked-numbers', { 
        numbers: markedNumbersArray,
        source: 'grid-ready-event'
      });
    }
  });

  // Handle sync-marked-numbers request from client
  socket.on('sync-marked-numbers-request', ({ roomCode }) => {
    if (LOG_LEVELS.DEBUG) console.log(`Player ${socket.id} requesting marked numbers for room ${roomCode}`);
    
    const game = games[roomCode];
    if (!game) {
      return socket.emit('error', 'Room not found');
    }
    
    const player = game.players.find(p => p.id === socket.id);
    if (!player) {
      return socket.emit('error', 'Player not found in room');
    }
    
    if (!game.markedNumbers || game.markedNumbers.size === 0) {
      if (LOG_LEVELS.DEBUG) console.log(`No marked numbers to send for room ${roomCode}`);
      return socket.emit('sync-marked-numbers', { markedNumbers: [] });
    }
    
    const markedNumbersArray = Array.from(game.markedNumbers);
    if (LOG_LEVELS.DEBUG) console.log(`Sending ${markedNumbersArray.length} marked numbers to player ${socket.id} in room ${roomCode}`);
    
    socket.emit('sync-marked-numbers', { markedNumbers: markedNumbersArray });
  });

  // Add a periodic cleanup
  const clientCleanupInterval = setInterval(() => {
    // Check if the socket is still connected
    if (!socket.connected) {
      clearInterval(clientCleanupInterval);
    return;
  }
    
    // Check if the socket has been inactive for too long (10 minutes)
    const info = activeConnections.get(socket.id);
    if (info && (Date.now() - info.lastActivity > 10 * 60 * 1000)) {
      socket.disconnect(true);
      clearInterval(clientCleanupInterval);
    }
  }, 60000); // Check every minute
  
  // Clean up on disconnect
  socket.on('disconnect', () => {
    clearInterval(clientCleanupInterval);
    activeConnections.delete(socket.id);
    
    // The rest of the disconnect handler...
  });
});

// Helper function to start a turn
function startTurn(roomCode) {
  const game = games[roomCode];
  if (!game || !game.started) return;
  
  // Ensure turnIndex is within bounds
  game.turnIndex = game.turnIndex % game.players.length;
  
  // Find the current player based on turnIndex
  const currentPlayer = game.players[game.turnIndex];
  if (!currentPlayer) {
    console.error(`Current player not found for turn index ${game.turnIndex} in room ${roomCode}`);
    return;
  }
  
  // Set current turn
  game.currentTurn = currentPlayer.id;
  
  if (LOG_LEVELS.DEBUG) console.log(`Starting turn for ${currentPlayer.username} (${game.currentTurn}) in room ${roomCode}, turn index: ${game.turnIndex}`);
  
  // Notify all players about whose turn it is
  io.to(roomCode).emit('turn-started', {
    playerId: game.currentTurn,
    player: currentPlayer,
    players: game.players
  });

  // Also emit turn-changed for backward compatibility
  io.to(roomCode).emit('turn-changed', {
    currentTurn: game.currentTurn,
    player: currentPlayer
  });
  
  // Clear any existing timer
  if (game.timer) {
    clearTimeout(game.timer);
    game.timer = null;
  }
  
  // Set a timer for this turn (15 seconds)
  game.timer = setTimeout(() => {
    // Get the updated game state to check if turn has changed
    const updatedGame = games[roomCode];
    if (!updatedGame || !updatedGame.started) return;
    
    // Check if the turn has already been changed
    if (updatedGame.currentTurn !== game.currentTurn) {
      if (LOG_LEVELS.DEBUG) console.log(`Timer expired but turn already changed for ${currentPlayer.username} in room ${roomCode}`);
      return;
    }
    
    if (LOG_LEVELS.DEBUG) console.log(`Timer expired for ${currentPlayer.username} (${game.currentTurn}) in room ${roomCode}`);
    
    // Get unmarked numbers from the current player's grid only
    const playerGrid = game.grids[currentPlayer.id];
    if (!playerGrid || playerGrid.length === 0) {
      console.error(`No grid found for player ${currentPlayer.username}`);
      // Move to next turn anyway
      game.turnIndex = (game.turnIndex + 1) % game.players.length;
      game.currentTurn = game.players[game.turnIndex].id;
      startTurn(roomCode);
      return;
    }
    
    const flatGrid = playerGrid.flat();
    const unmarked = flatGrid.filter(num => !game.markedNumbers.has(num));
    
    if (unmarked.length > 0) {
      // Select a random unmarked number from player's grid
      const randomNum = unmarked[Math.floor(Math.random() * unmarked.length)];
      
      console.log(`Automatically marking number ${randomNum} for ${currentPlayer.username}`);
      
      // Mark the number
      game.markedNumbers.add(randomNum);
      game.lastMarkedNumber = randomNum;
      game.lastMarkedTurn = game.turnIndex;
      
      // Notify all players with ONLY the number, not cellIndex
      // Each client will find where this number is in their own grid
      io.to(roomCode).emit('number-marked', {
        number: randomNum,
        markedBy: game.currentTurn,
        player: currentPlayer,
        automatic: true
      });
      
      // Check for a winner
      const winner = checkWinUtils(game);
      if (winner) {
        const winningPlayer = game.players.find(p => p.id === winner.playerId);
        
        // Calculate score based on time and turns
        const gameTime = (Date.now() - game.startTime) / 1000;
        const score = Math.max(100 - Math.floor(gameTime / 10), 10);
        
        // Update winning player's score
        winningPlayer.score = (winningPlayer.score || 0) + score;
        
        // Save to leaderboard
        updateLeaderboard(winningPlayer, score);
        
        // Notify all players
        io.to(roomCode).emit('game-won', {
          player: winningPlayer,
          lines: winner.lines,
          score
        });
        
        // End the game
        game.started = false;
      }
    } else {
      console.log(`No unmarked numbers left for player ${currentPlayer.username}`);
    }
    
    // Move to next turn whether we marked a number or not
    if (game.started) {
      game.turnIndex = (game.turnIndex + 1) % game.players.length;
      game.currentTurn = game.players[game.turnIndex].id;
      startTurn(roomCode);
    }
  }, game.turnDuration);
}

// Helper function to move to the next turn
function nextTurn(roomCode) {
  const game = games[roomCode];
  if (!game || !game.players || game.players.length === 0) {
    console.error(`Cannot move to next turn: Invalid game state for room ${roomCode}`);
    return;
  }
  
  // Check for any winner before moving to next turn
  const winner = checkWinUtils(game);
  if (winner) {
    const winningPlayer = game.players.find(p => p.id === winner.playerId);
    
    // Calculate score based on time and turns
    const gameTime = (Date.now() - game.startTime) / 1000;
    const score = Math.max(100 - Math.floor(gameTime / 10), 10);
    
    // Update winning player's score
    winningPlayer.score = (winningPlayer.score || 0) + score;
    
    // Save to leaderboard
    updateLeaderboard(winningPlayer, score);
    
    // Notify all players
    io.to(roomCode).emit('game-won', {
      player: winningPlayer,
      lines: winner.lines,
      score
    });
    
    // End the game
    game.started = false;
    return;
  }
  
  // Move to the next player
  game.turnIndex = (game.turnIndex + 1) % game.players.length;
  game.currentTurn = game.players[game.turnIndex].id;
  
  // Start the new turn immediately
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

// Helper function to get random unmarked number
const getRandomUnmarkedNumber = (grid, markedNumbers) => {
  const flatGrid = grid.flat();
  const unmarkedNumbers = flatGrid.filter(num => !markedNumbers.includes(num));
  return unmarkedNumbers[Math.floor(Math.random() * unmarkedNumbers.length)];
};

// Helper function to check game win
const checkGameWin = (game) => {
  // Only proceed if the game is active and has marked numbers
  if (!game || !game.started || !game.markedNumbers || game.markedNumbers.size < 5) {
    return null;
  }
  
  // Convert to array for easier checking
  const markedNumbersSet = game.markedNumbers;
  
  // Check each player's grid for winning patterns
  for (const playerId in game.grids) {
    const grid = game.grids[playerId];
    if (!grid) continue;
    
    const gridSize = grid.length;
    const winningPatterns = getWinningPatterns(gridSize);
    
    for (const pattern of winningPatterns) {
      let isWinningPattern = true;
      const winningCells = [];
      
      for (const [row, col] of pattern) {
        const cellValue = grid[row][col];
        if (!markedNumbersSet.has(cellValue)) {
          isWinningPattern = false;
          break;
        }
        winningCells.push({ row, col, value: cellValue });
      }
      
      if (isWinningPattern) {
        if (LOG_LEVELS.DEBUG) console.log(`Player ${playerId} won with pattern: ${JSON.stringify(pattern)}`);
        return {
          playerId,
          lines: [winningCells]
        };
      }
    }
  }
  
  return null;
};

// Start the server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Add graceful shutdown handlers
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  console.log('Received shutdown signal. Closing server gracefully...');
  
  // Set a timeout to force close if graceful shutdown takes too long
  const forceShutdownTimeout = setTimeout(() => {
    console.error('Forcing server shutdown after timeout');
    process.exit(1);
  }, 30000); // 30 seconds
  
  // Close the HTTP server
  server.close(() => {
    console.log('HTTP server closed');
    
    // Close MongoDB connection
    if (mongoose.connection.readyState !== 0) {
      mongoose.connection.close(false)
        .then(() => {
          console.log('MongoDB connection closed');
          clearTimeout(forceShutdownTimeout);
          process.exit(0);
        })
        .catch(err => {
          console.error('Error closing MongoDB connection:', err);
          clearTimeout(forceShutdownTimeout);
          process.exit(1);
        });
    } else {
      clearTimeout(forceShutdownTimeout);
      process.exit(0);
    }
  });
}
