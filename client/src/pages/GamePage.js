import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import Confetti from 'react-confetti';
import { ThemeContext } from '../context/ThemeContext';
import ThemeSwitcher from '../components/ThemeSwitcher';
import BingoGrid from '../components/BingoGrid';
import PlayersList from '../components/PlayersList';
import Timer from '../components/Timer';
import WinnerModal from '../components/WinnerModal';
import socket from '../utils/socket';

// Add DEBUG flag at the top to control logging
const DEBUG = false;

const GamePage = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { theme } = useContext(ThemeContext);
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  
  // Game state
  const [grid, setGrid] = useState([]);
  const [players, setPlayers] = useState([]);
  const [markedCells, setMarkedCells] = useState([]);
  const [currentTurn, setCurrentTurn] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [timer, setTimer] = useState(15);
  const [winner, setWinner] = useState(null);
  const [winningLines, setWinningLines] = useState([]);
  const [markedHistory, setMarkedHistory] = useState([]);
  const [currentTurnName, setCurrentTurnName] = useState('');
  const [gameMessage, setGameMessage] = useState('');
  
  // UI state
  const [symbols, setSymbols] = useState('numbers'); // 'numbers' or 'emojis'
  const [isHost, setIsHost] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  
  // Waiting room state
  const [waitingForPlayers, setWaitingForPlayers] = useState(true);
  const [readyPlayers, setReadyPlayers] = useState([]);
  const [isReady, setIsReady] = useState(false);
  
  // State for tracking if a number is being marked (to prevent multiple clicks)
  const [isMarking, setIsMarking] = useState(false);
  
  // Refs
  const timerIntervalRef = useRef(null);
  const audioRef = useRef(null);
  const hasJoinedRef = useRef(false);
  const timerRef = useRef(null);
  
  // Add socket connection status tracking
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  
  // Queue for pending marked numbers that arrive before grid is ready
  const pendingMarkedNumbersRef = useRef([]);
  
  const pageVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: 0.5,
        staggerChildren: 0.2
      }
    },
    exit: { 
      opacity: 0, 
      y: -20,
      transition: { duration: 0.3 }
    }
  };

  const containerVariants = {
    initial: { opacity: 0, scale: 0.95 },
    animate: { 
      opacity: 1, 
      scale: 1,
      transition: {
        duration: 0.3
      }
    }
  };

  const headerVariants = {
    initial: { opacity: 0, y: -20 },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: 0.3,
        delay: 0.1
      }
    }
  };
  
  // Join game on mount
  useEffect(() => {
    if (!username) {
      // Prompt for username if not set
      const name = prompt('Please enter your username:');
      if (name) {
        setUsername(name);
        localStorage.setItem('username', name);
      } else {
        // Redirect to home if no username is provided
        navigate('/');
        return;
      }
    }
    
    // Reset game state on mount
    setGrid([]);
    setPlayers([]);
    setMarkedCells([]);
    setCurrentTurn(null);
    setGameStarted(false);
    setIsMyTurn(false);
    setTimer(15);
    setWinner(null);
    setWinningLines([]);
    setMarkedHistory([]);
    setGameMessage('');
    setWaitingForPlayers(true);
    setReadyPlayers([]);
    setIsReady(false);
    
    // Only join room if we haven't already
    if (!hasJoinedRef.current) {
      console.log(`Joining room ${roomCode} as ${username}`);
      socket.emit('join-room', { roomCode, username });
      hasJoinedRef.current = true;
    }
    
    // Set up Socket.io event listeners
    socket.on('grid-assigned', handleGridAssigned);
    socket.on('joined-room', handleJoinedRoom);
    socket.on('player-joined', handlePlayerJoined);
    socket.on('player-left', handlePlayerLeft);
    socket.on('game-started', handleGameStarted);
    socket.on('turn-changed', handleTurnChanged);
    socket.on('turn-started', handleTurnChanged);
    socket.on('number-marked', handleNumberMarked);
    socket.on('game-won', handleGameWon);
    socket.on('error', handleError);
    socket.on('player-ready', handlePlayerReady);
    socket.on('sync-marked-numbers', handleSyncMarkedNumbers);
    
    // Clean up on unmount
    return () => {
      socket.off('grid-assigned', handleGridAssigned);
      socket.off('joined-room', handleJoinedRoom);
      socket.off('player-joined', handlePlayerJoined);
      socket.off('player-left', handlePlayerLeft);
      socket.off('game-started', handleGameStarted);
      socket.off('turn-changed', handleTurnChanged);
      socket.off('turn-started', handleTurnChanged);
      socket.off('number-marked', handleNumberMarked);
      socket.off('game-won', handleGameWon);
      socket.off('error', handleError);
      socket.off('player-ready', handlePlayerReady);
      socket.off('sync-marked-numbers', handleSyncMarkedNumbers);
      clearInterval(timerIntervalRef.current);
      hasJoinedRef.current = false;
    };
  }, [roomCode, username, navigate]);
  
  // Updated timer effect with reduced logging
  useEffect(() => {
    let isActive = true;
    
    const startTimer = () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      
      // Reset timer to 15 seconds
      setTimer(15);
      
      timerIntervalRef.current = setInterval(() => {
        if (!isActive) return;
        
        setTimer((prev) => {
          const newValue = Math.max(0, prev - 1);
          // Only log when DEBUG is true
          if (DEBUG) console.log(`Timer: ${newValue}, Is my turn: ${isMyTurn}`);
          
          // Only emit end-turn if it's my turn and timer reaches 0
          if (newValue === 0 && isMyTurn && socket.connected) {
            if (DEBUG) console.log('Timer reached zero, ending turn automatically');
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
            socket.emit('end-turn', { roomCode });
          }
          return newValue;
        });
      }, 1000);
    };

    // Start or restart timer when it's my turn
    if (gameStarted && isMyTurn) {
      if (DEBUG) console.log('Starting timer for my turn');
      startTimer();
    }
    
    return () => {
      isActive = false;
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [gameStarted, isMyTurn, roomCode]);
  
  // Monitor socket connection status
  useEffect(() => {
    // Check initial connection status
    setSocketConnected(socket.connected);
    
    const handleConnect = () => {
      console.log('Socket connected');
      setSocketConnected(true);
      
      // If we're in a game, try to rejoin with explicit grid request
      if (roomCode && username) {
        console.log('Attempting to rejoin game after reconnection');
        socket.emit('rejoin-room', { roomCode, username });
        
        // Explicitly request grid and marked numbers after reconnection
        setTimeout(() => {
          console.log('Explicitly requesting grid and marked numbers after reconnection');
          socket.emit('request-grid', { roomCode });
          socket.emit('request-marked-numbers', { roomCode });
        }, 1000);
      }
    };
    
    const handleDisconnect = (reason) => {
      console.log('Socket disconnected:', reason);
      setSocketConnected(false);
      toast.error('Connection lost. Attempting to reconnect...');
      
      // Clear timer and pause game state
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
    
    // Add connection event listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    
    // Try to connect if not already connected
    if (!socket.connected) {
      console.log('Socket not connected, attempting to connect');
      socket.connect();
    } else {
      // If already connected, explicitly request grid and marked numbers
      if (roomCode) {
        console.log('Socket already connected, explicitly requesting grid and game state');
        setTimeout(() => {
          socket.emit('request-grid', { roomCode });
          socket.emit('request-marked-numbers', { roomCode });
        }, 500);
      }
    }
    
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [roomCode, username]);
  
  // Handle game ended event
  useEffect(() => {
    const handleGameEnded = (data) => {
      console.log('Game ended:', data);
      toast(data.message);
      // Reset game state
      setGrid([]);
      setPlayers([]);
      setMarkedCells([]);
      setCurrentTurn(null);
      setGameStarted(false);
      setIsMyTurn(false);
      setTimer(15);
      setWinner(null);
      setWinningLines([]);
      setMarkedHistory([]);
      setGameMessage('');
      // Navigate to home page
      navigate('/');
    };

    socket.on('game-ended', handleGameEnded);

    return () => {
      socket.off('game-ended', handleGameEnded);
    };
  }, [navigate]);
  
  // Process any queued marked numbers whenever the grid changes
  useEffect(() => {
    if (grid && grid.length > 0 && pendingMarkedNumbersRef.current.length > 0) {
      console.log(`Grid now available, processing ${pendingMarkedNumbersRef.current.length} queued numbers`);
      
      // Process all pending numbers
      const pendingNumbers = [...pendingMarkedNumbersRef.current];
      // Clear the queue
      pendingMarkedNumbersRef.current = [];
      
      // Process each pending number
      pendingNumbers.forEach(pendingNumber => {
        console.log('Processing queued number:', pendingNumber);
        handleNumberMarked(pendingNumber);
      });
    }
  }, [grid]);
  
  // Event handler functions
  const handleGridAssigned = (newGrid) => {
    if (!newGrid || !Array.isArray(newGrid) || newGrid.length === 0) {
      console.error('Invalid grid received:', newGrid);
      return;
    }
    
    // Deep copy the grid to avoid reference issues
    const gridCopy = JSON.parse(JSON.stringify(newGrid));
    if (DEBUG) {
      console.log('Grid assigned event received:', JSON.stringify(newGrid));
      console.log('Setting grid state with valid grid data. Grid size:', 
                Array.isArray(gridCopy[0]) ? 
                `${gridCopy.length}x${gridCopy[0].length}` : 
                `${gridCopy.length} (flat array)`);
      console.log('Previous grid state empty:', !grid || grid.length === 0);
    }
    
    // Force immediate state update via callback to ensure it's fully processed
    setGrid(() => gridCopy);
    
    // Explicitly acknowledge grid reception to the server
    if (roomCode && socketConnected) {
      if (DEBUG) console.log('Sending grid-ready acknowledgment to server');
      setTimeout(() => {
        socket.emit('grid-ready', { roomCode });
      }, 300); // Short delay to ensure state is updated
    }
    
    // Process any pending marked numbers after the grid is set
    setTimeout(() => {
      if (pendingMarkedNumbersRef.current.length > 0) {
        if (DEBUG) console.log(`Processing ${pendingMarkedNumbersRef.current.length} queued numbers after grid assignment`);
        const pendingNumbers = [...pendingMarkedNumbersRef.current];
        pendingMarkedNumbersRef.current = [];
        
        pendingNumbers.forEach(pendingNumber => {
          if (DEBUG) console.log('Processing queued number after grid assignment:', pendingNumber);
          handleNumberMarked(pendingNumber);
        });
      }
    }, 500); // Increase delay to ensure grid state is updated
  };
  
  // Fix player mapping in the waiting room section
  const normalizePlayer = (player) => {
    // If player is just a string, convert to object format
    if (typeof player === 'string') {
      return { id: '', username: player };
    }
    // If player is already an object, make sure it has the expected properties
    return {
      id: player.id || '',
      username: player.username || player
    };
  };

  const handleJoinedRoom = (data) => {
    console.log('Joined room:', data);
    setIsHost(data.isHost);
    
    // Normalize players to handle different data structures
    const normalizedPlayers = Array.isArray(data.players) 
      ? data.players.map(p => normalizePlayer(p))
      : [];
    
    setPlayers(normalizedPlayers);
    
    // IMPORTANT: Make sure grid is set correctly from the joined-room event
    if (data.grid && Array.isArray(data.grid)) {
      console.log('Setting grid from joined-room event. Grid size:', 
                  Array.isArray(data.grid[0]) ? 
                  `${data.grid.length}x${data.grid[0].length}` : 
                  `${data.grid.length} (flat array)`);
      
      // Deep copy the grid to avoid reference issues and ensure state updates
      const gridCopy = JSON.parse(JSON.stringify(data.grid));
      setGrid(() => gridCopy); // Use callback form to ensure immediate state update
      
      // Process any pending marked numbers after a short delay to ensure grid state update
      setTimeout(() => {
        if (pendingMarkedNumbersRef.current.length > 0) {
          console.log(`Processing ${pendingMarkedNumbersRef.current.length} queued numbers after joined-room`);
          const pendingNumbers = [...pendingMarkedNumbersRef.current];
          pendingMarkedNumbersRef.current = [];
          pendingNumbers.forEach(pendingNumber => {
            handleNumberMarked(pendingNumber);
          });
        }
      }, 500);
    } else {
      console.warn('No valid grid data in joined-room event:', data);
    }
    
    // If the game is already in progress, skip waiting room
    if (data.gameStarted) {
      setWaitingForPlayers(false);
      setGameStarted(true);
    } else {
      setWaitingForPlayers(true);
      setGameStarted(false);
    }
    
    // Update ready players list if available
    if (data.readyPlayers) {
      setReadyPlayers(data.readyPlayers);
      setIsReady(data.readyPlayers.includes(username));
    }
    
    toast.success(`Joined room: ${roomCode}`);
  };
  
  const handlePlayerJoined = (data) => {
    console.log('Player joined event data:', data);
    
    // Check if data has the new structure (object with player and players properties)
    // or the old structure (direct array of players)
    const updatedPlayers = Array.isArray(data) ? data : data.players;
    
    if (!Array.isArray(updatedPlayers)) {
      console.error('Invalid players data received:', data);
      return;
    }
    
    // Normalize players
    const normalizedPlayers = updatedPlayers.map(p => normalizePlayer(p));
    
    console.log('Setting players to:', normalizedPlayers);
    setPlayers(normalizedPlayers);
    
    // If a new player joined, show a toast
    if (!Array.isArray(data) && data.player) {
      toast(`${data.player.username || data.player} joined the game`);
    }
    
    // Check if this player is the host (first player)
    if (normalizedPlayers.length > 0) {
      const firstPlayer = normalizedPlayers[0];
      const isFirstPlayer = firstPlayer.id === socket.id;
      setIsHost(isFirstPlayer);
      
      if (isFirstPlayer) {
        console.log('You are the host');
        setGameMessage('You are the host. Start the game when ready.');
      }
    }
  };
  
  const handlePlayerLeft = (data) => {
    console.log('Player left event data:', data);
    
    // Handle both data structures
    const updatedPlayers = Array.isArray(data) ? data : data.players;
    const disconnectedId = data.disconnectedId;
    
    if (!Array.isArray(updatedPlayers)) {
      console.error('Invalid players data received:', data);
      return;
    }
    
    console.log('Updated players:', updatedPlayers);
    setPlayers(updatedPlayers);
    toast(`A player has left the game`);
    
    // If the host left and this player is now first, they become the new host
    if (updatedPlayers.length > 0 && updatedPlayers[0].id === socket.id) {
      setIsHost(true);
      toast.success('You are now the host');
      setGameMessage('You are the host. Start the game when ready.');
    }
  };
  
  const handleGameStarted = (data) => {
    console.log('Game started:', data);
    setGameStarted(true);
    setWaitingForPlayers(false);
    
    // Handle grid initialization if included in game-started event
    if (data.grid && Array.isArray(data.grid)) {
      console.log('Setting grid from game-started event. Grid size:', 
                  Array.isArray(data.grid[0]) ? 
                  `${data.grid.length}x${data.grid[0].length}` : 
                  `${data.grid.length} (flat array)`);
      
      // Deep copy the grid to avoid reference issues
      const gridCopy = JSON.parse(JSON.stringify(data.grid));
      setGrid(() => gridCopy);
      
      // If our grid is just now being set, check for any queued marked numbers
      setTimeout(() => {
        if (pendingMarkedNumbersRef.current.length > 0) {
          console.log(`Processing ${pendingMarkedNumbersRef.current.length} queued numbers after game start`);
          const pendingNumbers = [...pendingMarkedNumbersRef.current];
          pendingMarkedNumbersRef.current = [];
          pendingNumbers.forEach(pendingNumber => {
            handleNumberMarked(pendingNumber);
          });
        }
      }, 500);
    } else if (!grid || grid.length === 0) {
      console.warn('No grid data in game-started event and no grid currently set:', data);
      // Request grid from server if we don't have one
      socket.emit('request-grid', { roomCode });
    }
    
    if (data.currentTurn) {
      setCurrentTurn(data.currentTurn);
      setCurrentTurnName(data.currentTurn);
      setIsMyTurn(data.currentTurn === socket.id);
    }
    
    // Reset UI state
    setWinner(null);
    setWinningLines([]);
    setMarkedCells([]);
    setTimer(15);
    
    toast.success('Game started!');
    setGameMessage(`Game started! ${data.currentTurn === socket.id ? 'Your' : `${data.player?.username || 'Someone else'}'s`} turn`);
    
    // Play start sound
    if (audioRef.current) {
      audioRef.current.play().catch(e => console.log('Audio play error:', e));
    }
  };
  
  const handleTurnChanged = (data) => {
    console.log('Turn changed:', data);
    
    // Update current turn with the player ID
    const newCurrentTurn = data.currentTurn || data.playerId;
    setCurrentTurn(newCurrentTurn);
    
    // Check if it's my turn
    const isMyTurnNow = newCurrentTurn === socket.id;
    setIsMyTurn(isMyTurnNow);
    
    if (isMyTurnNow) {
      console.log('It is now MY turn!');
      // Reset timer when it's my turn
      setTimer(15);
      setGameMessage('Your turn! Click on a number.');
    } else {
      const currentPlayer = data.player || players.find(p => p.id === newCurrentTurn);
      const playerName = currentPlayer ? currentPlayer.username : 'Unknown';
      setGameMessage(`Waiting for ${playerName} to choose a number...`);
    }
    
    // If players array is provided in the data, update it
    if (data.players) {
      setPlayers(data.players);
    }
  };
  
  const handleNumberMarked = ({ number, markedBy, player, automatic }) => {
    if (DEBUG) console.log('Number marked event received:', { number, markedBy, player, automatic });
    
    if (!number) {
      console.error('No number provided in number-marked event');
      return;
    }
    
    // Make sure number is properly parsed as an integer
    const numberToFind = typeof number === 'string' ? parseInt(number, 10) : number;
    
    if (isNaN(numberToFind)) {
      console.error('Invalid number format received:', number);
      return;
    }
    
    if (!grid || !grid.length) {
      console.warn(`Grid not loaded when receiving number ${numberToFind}, requesting grid from server`);
      
      // Immediately request the grid from server
      socket.emit('request-grid', { roomCode });
      
      // Store the marked number to process later
      pendingMarkedNumbersRef.current.push({
        number: numberToFind,
        markedBy,
        player,
        automatic,
        queuedAt: Date.now()
      });
      return;
    }
    
    if (DEBUG) console.log(`Finding cell index for number ${numberToFind} in grid`);
    
    // Create a flat version of the grid for easier lookup
    const flatGrid = Array.isArray(grid[0]) ? grid.flat() : grid;
    
    // Find the index of this number in the grid
    let cellIndex = -1;
    for (let i = 0; i < flatGrid.length; i++) {
      const cellNum = flatGrid[i];
      const cellNumInt = typeof cellNum === 'string' ? parseInt(cellNum, 10) : cellNum;
      
      if (cellNumInt === numberToFind) {
        cellIndex = i;
        break;
      }
    }
    
    if (DEBUG) console.log(`Number ${numberToFind} is at cell index ${cellIndex} in my grid`);
    
    // If the number is found in our grid, mark it
    if (cellIndex !== -1) {
      if (DEBUG) console.log(`Marking cell ${cellIndex} for number ${numberToFind}`);
      
      // Check if this cell is already marked to avoid duplicates
      if (!markedCells.includes(cellIndex)) {
        setMarkedCells(prevMarkedCells => {
          if (DEBUG) console.log(`Adding cell ${cellIndex} to marked cells`);
          return [...prevMarkedCells, cellIndex];
        });
      } else {
        if (DEBUG) console.log(`Cell ${cellIndex} already marked`);
      }
      
      // Add to history for reference
      setMarkedHistory(prev => [
        ...prev,
        {
          cellIndex,
          number: numberToFind,
          player: player?.username || 'Unknown',
          automatic: !!automatic
        }
      ]);
      
      // Play sound effect
      if (audioRef.current) {
        audioRef.current.play().catch(e => console.log('Audio play error:', e));
      }
    } else {
      console.warn(`Number ${numberToFind} not found in grid`);
    }
  };
  
  const handleGameWon = ({ player, lines, score }) => {
    console.log('Game won by:', player.username);
    setWinner(player);
    setWinningLines(lines);
    setShowConfetti(true);
    
    // Hide confetti after 10 seconds
    setTimeout(() => {
      setShowConfetti(false);
    }, 10000);
    
    toast.success(`${player.username} won with a score of ${score}!`);
    setGameMessage(`${player.username} won the game!`);
  };
  
  const handleError = (message) => {
    console.error('Game error:', message);
    toast.error(message);
    setGameMessage(message);
  };
  
  // Handle exiting the game and returning to home page
  const handleExitGame = () => {
    navigate('/');
  };
  
  // Handle player ready state changes
  const handlePlayerReady = ({ username: readyUsername, readyPlayers }) => {
    console.log(`[Socket Event Received] Player ready update: ${readyUsername}, Ready players:`, readyPlayers);

    if (Array.isArray(readyPlayers)) {
      setReadyPlayers(readyPlayers);

      // Check if I'm the player who toggled ready status
      if (readyUsername === username) {
        const amIReady = readyPlayers.includes(username);
        console.log(`[handlePlayerReady] Updating my local isReady status based on server: ${amIReady}`);
        setIsReady(amIReady); // Sync local state with server authoritative list
      }

      // Show a notification (optional, can be noisy)
      // const isPlayerReady = readyPlayers.includes(readyUsername);
      // toast.success(`${readyUsername} is ${isPlayerReady ? 'ready' : 'not ready'}`);
    } else {
      console.error('[handlePlayerReady] Invalid readyPlayers data received:', readyPlayers);
    }
  };
  
  // Toggle ready status
  const handleToggleReady = useCallback(() => {
    if (!socket.connected) {
      console.error('[handleToggleReady] Socket not connected.');
      toast.error('Not connected to server.');
      return;
    }
    const newState = !isReady;
    console.log(`[handleToggleReady] Toggling ready status. Current: ${isReady}, New: ${newState}`);
    
    // Optimistically update local state for immediate feedback
    setIsReady(newState); 
    
    // Emit the event to the server - ** Use 'toggle-ready' **
    console.log('[handleToggleReady] Emitting toggle-ready event to server:', { roomCode, username, isReady: newState });
    socket.emit('toggle-ready', { roomCode, username, isReady: newState });
  }, [isReady, roomCode, username]);
  
  // Start the game (host only)
  const handleStartGame = useCallback(() => {
    if (!socket.connected) {
      toast.error('Not connected to server.');
      return;
    }
    // Add check: only host can start, and only if enough players are ready
    // (This check might be better enforced on the server too)
    if (isHost) { 
      socket.emit('start-game', { roomCode });
    } else {
      toast.error('Only the host can start the game.');
    }
  }, [isHost, roomCode]);
  
  // Copy room code to clipboard
  const handleCopyRoomCode = () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopySuccess(true);
      toast.success('Room code copied to clipboard!');
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };
  
  // Handle marking a number
  const handleMarkNumber = useCallback((cellIndex, number) => {
    if (!isMyTurn || !gameStarted || isMarking) {
      console.log('Cannot mark number:', { isMyTurn, gameStarted, isMarking });
      return;
    }
    
    console.log(`Attempting to mark number ${number} at index ${cellIndex}`);
    setIsMarking(true); // Prevent double clicks
    
    // Emit mark-number event to the server
    socket.emit('mark-number', { 
      roomCode, 
      number, 
      cellIndex 
    });

    // Add optimistic update (optional but can improve perceived performance)
    // setMarkedCells(prev => [...prev, cellIndex]); 

    // Re-enable marking after a short delay to prevent spam/accidental double clicks
    // and allow server confirmation to arrive.
    setTimeout(() => {
      setIsMarking(false);
    }, 500); // Adjust delay as needed

  }, [isMyTurn, gameStarted, roomCode, isMarking]); // Added isMarking
  
  // Add connection status indicator to UI
  const ConnectionStatus = () => (
    <div className="fixed bottom-4 right-4 z-50">
      <div 
        className={`px-3 py-1 rounded-full text-sm font-medium flex items-center ${
          socketConnected ? 'bg-green-500' : 'bg-red-500'
        } text-white`}
      >
        <span className={`w-2 h-2 rounded-full mr-2 ${
          socketConnected ? 'bg-green-200' : 'bg-red-200'
        }`}></span>
        {socketConnected ? 'Connected' : 'Disconnected'}
      </div>
    </div>
  );
  
  // Optimize handleSyncMarkedNumbers to reduce logging
  const handleSyncMarkedNumbers = ({ markedNumbers }) => {
    if (DEBUG) console.log('Received sync-marked-numbers event with', markedNumbers.length, 'numbers');
    
    if (!Array.isArray(markedNumbers) || markedNumbers.length === 0) {
      if (DEBUG) console.log('No marked numbers to sync');
      return;
    }
    
    if (!grid || grid.length === 0) {
      console.warn('Cannot sync marked numbers - grid not loaded yet');
      
      // Store these numbers in pending queue with high priority
      markedNumbers.forEach(number => {
        pendingMarkedNumbersRef.current.push({
          number,
          markedBy: 'system-sync',
          player: null,
          automatic: false,
          queuedAt: Date.now(),
          highPriority: true
        });
      });
      
      // Request grid explicitly
      if (DEBUG) console.log('Requesting grid because sync-marked-numbers received before grid was loaded');
      socket.emit('request-grid', { roomCode });
      
      // Set a retry mechanism for these pending numbers
      const retryInterval = setInterval(() => {
        if (grid && grid.length > 0) {
          if (DEBUG) console.log('Grid now available, retrying processing of high priority queued numbers');
          
          // Find high priority numbers
          const highPriorityNumbers = pendingMarkedNumbersRef.current.filter(item => item.highPriority);
          
          if (highPriorityNumbers.length > 0) {
            if (DEBUG) console.log(`Processing ${highPriorityNumbers.length} high priority numbers`);
            
            // Remove these from the pending queue
            pendingMarkedNumbersRef.current = pendingMarkedNumbersRef.current.filter(item => !item.highPriority);
            
            // Process each high priority number
            highPriorityNumbers.forEach(pendingNumber => {
              handleNumberMarked(pendingNumber);
            });
          }
          
          clearInterval(retryInterval);
        }
      }, 1000); // Check every second
      
      // Clear interval after 10 seconds to prevent memory leaks
      setTimeout(() => clearInterval(retryInterval), 10000);
      
      return;
    }
    
    if (DEBUG) console.log('Processing', markedNumbers.length, 'marked numbers from sync event');
    
    // Process each marked number
    const flatGrid = Array.isArray(grid[0]) ? grid.flat() : grid;
    const newMarkedCells = [...markedCells];
    let changed = false;
    
    markedNumbers.forEach(number => {
      // Find the cell index for this number
      const numberInt = typeof number === 'string' ? parseInt(number, 10) : number;
      let cellIndex = -1;
      
      for (let i = 0; i < flatGrid.length; i++) {
        const cellNum = flatGrid[i];
        const cellNumInt = typeof cellNum === 'string' ? parseInt(cellNum, 10) : cellNum;
        
        if (cellNumInt === numberInt) {
          cellIndex = i;
          break;
        }
      }
      
      // If found and not already marked, add to marked cells
      if (cellIndex !== -1 && !newMarkedCells.includes(cellIndex)) {
        if (DEBUG) console.log(`Marking cell ${cellIndex} for synced number ${numberInt}`);
        newMarkedCells.push(cellIndex);
        changed = true;
      }
    });
    
    // Only update state if we actually added new cells
    if (changed) {
      if (DEBUG) console.log('Updating marked cells from sync event');
      setMarkedCells(newMarkedCells);
    }
  };
  
  return (
    <motion.div 
      className="min-h-screen py-8 px-4 relative overflow-hidden"
      style={{ backgroundColor: theme.colors.background }}
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Confetti animation for winner */}
      {showConfetti && <Confetti width={window.innerWidth} height={window.innerHeight} />}
      
      <div className="max-w-6xl mx-auto">
        <motion.header 
          className="flex flex-col md:flex-row justify-between items-center mb-8"
          variants={headerVariants}
        >
          <div>
            <h1 className="text-3xl font-bold mb-2">Bingo Room: {roomCode}</h1>
            <p className="text-sm opacity-70">
              {waitingForPlayers 
                ? `Waiting for players (${readyPlayers.length}/${players.length} ready)` 
                : gameStarted 
                  ? currentTurnName 
                    ? `${currentTurnName}'s turn` 
                    : "Game in progress" 
                  : "Game ended"
              }
            </p>
          </div>
          
          <div className="flex items-center mt-4 md:mt-0">
            <button
              onClick={handleCopyRoomCode}
              className="px-4 py-2 rounded-full mr-3 text-sm font-medium flex items-center"
              style={{
                backgroundColor: copySuccess ? theme.colors.success : theme.colors.primary,
                color: '#ffffff'
              }}
            >
              {copySuccess ? 'Copied!' : 'Copy Room Code'}
            </button>
            
            <ThemeSwitcher className="ml-2" />
          </div>
        </motion.header>
        
        {gameMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-lg text-center"
            style={{
              backgroundColor: `${theme.colors.accent}33`,
              color: theme.colors.text
            }}
          >
            {gameMessage}
          </motion.div>
        )}
        
        {/* WAITING ROOM SECTION */}
        {waitingForPlayers && (
          <motion.div
            variants={containerVariants}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            <div
              className="rounded-xl p-6 backdrop-blur-md bg-opacity-80"
              style={{
                backgroundColor: theme.colors.card,
                boxShadow: theme.effects?.cardShadow,
                border: `2px solid ${theme.colors.border}`
              }}
            >
              <h2 className="text-xl font-semibold mb-4">Players</h2>
              <div className="bg-black bg-opacity-20 rounded-lg p-4 overflow-auto max-h-96">
                {players.length === 0 ? (
                  <p className="text-center italic opacity-70">No players yet</p>
                ) : (
                  <ul className="space-y-2">
                    {players.map((player, index) => (
                      <li 
                        key={index}
                        className="p-3 rounded-lg flex items-center justify-between"
                        style={{
                          backgroundColor: readyPlayers.includes(typeof player === 'string' ? player : player.username) ? `${theme.colors.success}33` : `${theme.colors.primary}11`,
                          border: (typeof player === 'string' ? player : player.username) === username ? `1px solid ${theme.colors.primary}` : 'none'
                        }}
                      >
                        <div className="flex items-center">
                          <span className="font-medium">{typeof player === 'string' ? player : player.username}</span>
                          {(typeof player === 'string' ? player : player.username) === username && <span className="ml-2 text-xs opacity-70">(You)</span>}
                          {isHost && (typeof player === 'string' ? player : player.username) === username && <span className="ml-2 text-xs opacity-70">(Host)</span>}
                        </div>
                        <div>
                          {readyPlayers.includes(typeof player === 'string' ? player : player.username) ? (
                            <span className="px-2 py-1 text-xs rounded-full" style={{ backgroundColor: theme.colors.success, color: '#fff' }}>
                              Ready
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs rounded-full" style={{ backgroundColor: `${theme.colors.border}`, color: theme.colors.text }}>
                              Not Ready
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            
            <div
              className="rounded-xl p-6 backdrop-blur-md bg-opacity-80"
              style={{
                backgroundColor: theme.colors.card,
                boxShadow: theme.effects?.cardShadow,
                border: `2px solid ${theme.colors.border}`
              }}
            >
              <h2 className="text-xl font-semibold mb-4">Game Settings</h2>
              <div className="mb-6">
                <p className="mb-2">Room Code: <span className="font-medium">{roomCode}</span></p>
                <p className="mb-2">Your Username: <span className="font-medium">{username}</span></p>
                <p className="mb-2">Total Players: <span className="font-medium">{players.length}</span></p>
                <p className="mb-2">Ready Players: <span className="font-medium">{readyPlayers.length}/{players.length}</span></p>
              </div>
              
              <div className="flex flex-col space-y-3 mt-8">
                {isHost ? (
                  <>
                    <button
                      onClick={handleToggleReady}
                      className="w-full py-3 rounded-lg font-medium"
                      style={{
                        backgroundColor: isReady ? theme.colors.success : theme.colors.primary,
                        color: '#ffffff'
                      }}
                    >
                      {isReady ? 'I\'m Not Ready' : 'I\'m Ready'}
                    </button>
                    
                    <button
                      onClick={handleStartGame}
                      disabled={readyPlayers.length < 1}
                      className="w-full py-3 rounded-lg font-medium disabled:opacity-50"
                      style={{
                        backgroundColor: theme.colors.accent,
                        color: '#ffffff'
                      }}
                    >
                      Start Game ({readyPlayers.length}/{players.length} ready)
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleToggleReady}
                    className="w-full py-3 rounded-lg font-medium"
                    style={{
                      backgroundColor: isReady ? theme.colors.success : theme.colors.primary,
                      color: '#ffffff'
                    }}
                  >
                    {isReady ? 'I\'m Not Ready' : 'I\'m Ready'}
                  </button>
                )}
                
                <button
                  onClick={() => navigate('/')}
                  className="w-full py-2 rounded-lg font-medium"
                  style={{
                    backgroundColor: 'transparent',
                    color: theme.colors.text,
                    border: `1px solid ${theme.colors.border}`
                  }}
                >
                  Leave Game
                </button>
              </div>
            </div>
          </motion.div>
        )}
        
        {/* GAME SECTION - Only show if waiting room is done */}
        {!waitingForPlayers && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <motion.div
              variants={containerVariants}
              className="lg:col-span-2"
            >
              <div
                className="rounded-xl p-4 sm:p-6 backdrop-blur-md bg-opacity-80"
                style={{
                  backgroundColor: theme.colors.card,
                  boxShadow: theme.effects?.cardShadow,
                  border: `2px solid ${theme.colors.border}`
                }}
              >
                <div className="mb-4 flex justify-between items-center">
                  <div className="flex items-center space-x-4">
                    <h2 className="text-xl font-semibold">Your Grid</h2>
                    {isMyTurn && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="px-3 py-1 rounded-full text-sm font-medium"
                        style={{
                          backgroundColor: theme.colors.primary,
                          color: theme.colors.card
                        }}
                      >
                        Your Turn!
                      </motion.div>
                    )}
                  </div>
                  
                  {gameStarted && 
                    <div className="w-32">
                      <Timer timeLeft={timer} />
                    </div>
                  }
                </div>

                <div className="flex justify-center items-center w-full">
                  <div className="w-full max-w-lg">
                    <BingoGrid
                      grid={grid}
                      onCellClick={handleMarkNumber}
                      markedCells={markedCells}
                      winningLines={winningLines}
                    />
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div variants={containerVariants}>
              <div
                className="rounded-xl p-6 backdrop-blur-md bg-opacity-80"
                style={{
                  backgroundColor: theme.colors.card,
                  boxShadow: theme.effects?.cardShadow,
                  border: `2px solid ${theme.colors.border}`
                }}
              >
                <h2 className="text-xl font-semibold mb-4">Players</h2>
                <PlayersList players={players} currentTurn={currentTurn} winner={winner} />
              </div>
            </motion.div>
          </div>
        )}
      </div>
      
      {/* Audio elements */}
      <audio ref={audioRef} src="/sounds/game-start.mp3" preload="auto" />
      
      {/* Connection status indicator */}
      <ConnectionStatus />
    </motion.div>
  );
};

export default GamePage;
