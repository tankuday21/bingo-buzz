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
  const [isGridReady, setIsGridReady] = useState(false);
  const isGridReadyRef = useRef(isGridReady); // Ref to track grid readiness
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
  const isMarkingRef = useRef(isMarking); // <<< Add ref for isMarking
  const turnCheckLog = useRef(''); // Ref to store log value
  // <<< Add ref for debounce timer >>>
  const markNumberDebounceTimerRef = useRef(null);
  
  // Refs
  const timerIntervalRef = useRef(null);
  const audioRef = useRef(null);
  const hasJoinedRef = useRef(false);
  
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
  
  // Effect to keep isGridReadyRef updated with the latest state
  useEffect(() => {
    isGridReadyRef.current = isGridReady;
    if (DEBUG) console.log(`[Effect] isGridReady state changed to: ${isGridReady}, updated ref.`);
  }, [isGridReady]);
  
  // <<< Add effect to keep isMarkingRef updated >>>
  useEffect(() => {
    isMarkingRef.current = isMarking;
    // Optional: Add debug log if needed
    console.log(`[Effect] isMarking state changed to: ${isMarking}. Ref updated.`);
  }, [isMarking]);
  
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
    setIsGridReady(false); // Also resets the ref via the effect above
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
    pendingMarkedNumbersRef.current = []; // Clear pending numbers on join/reset
    
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
    
    // Add catch-all listener for debugging
    const handleAnyEvent = (eventName, ...args) => {
      console.log(`[Socket Received Event - DEBUG] Event: ${eventName}, Args:`, args);
    };
    socket.onAny(handleAnyEvent);
    
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
      // Remove the catch-all listener
      socket.offAny(handleAnyEvent);
      clearInterval(timerIntervalRef.current);
      hasJoinedRef.current = false;
      setIsGridReady(false);
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
  
  // Event handler functions
  const handleGridAssigned = useCallback((assignedGrid) => {
    if (DEBUG) console.log('[handleGridAssigned] Received grid:', assignedGrid);
    if (assignedGrid && Array.isArray(assignedGrid) && assignedGrid.length > 0) {
      // Use functional update to ensure we have the latest grid if needed elsewhere
      setGrid(() => {
        // Process pending numbers using the grid *about* to be set
        if (pendingMarkedNumbersRef.current.length > 0) {
          console.log(`[handleGridAssigned] Processing ${pendingMarkedNumbersRef.current.length} pending marked numbers with newly assigned grid.`);
          const numbersToProcess = [...pendingMarkedNumbersRef.current];
          pendingMarkedNumbersRef.current = []; // Clear the queue
          processMarkedNumbers(numbersToProcess, assignedGrid); // Use assignedGrid directly
        }
        return assignedGrid; // Return the new grid for the state update
      });
      setIsGridReady(true); // This will trigger the effect to update the ref
      console.log('[handleGridAssigned] Grid state updated and set to ready.');

    } else {
      console.error('[handleGridAssigned] Received invalid grid data:', assignedGrid);
      setIsGridReady(false); // Ensure flag and ref are false if grid is invalid
    }
  }, [roomCode]); // Add dependencies if needed, e.g., processMarkedNumbers if it's not stable

  // Separate function to process marked numbers 
  // Ensure this function doesn't rely on stale state if called from useCallback handlers
  const processMarkedNumbers = (numbers, currentGrid) => {
    // Add guard clause for invalid grid early
    if (!currentGrid || !Array.isArray(currentGrid) || currentGrid.length === 0) {
        console.error("[processMarkedNumbers] Attempted to process numbers but grid is invalid or empty.", currentGrid);
      return;
    }
    console.log('[processMarkedNumbers] Processing numbers:', numbers, 'with grid:', currentGrid);
    
    // Ensure grid is treated as 2D array for findIndex logic if necessary
    // Assuming grid is flat array based on previous code:
    const flatGrid = currentGrid.flat(); // Flatten if grid is 2D, okay if already flat
    const newMarkedIndices = [];
    const newHistoryNumbers = [];

    numbers.forEach(number => {
        // Check if number is already processed in current history (important for sync)
        if (markedHistory.includes(number)) {
            console.log(`[processMarkedNumbers] Number ${number} is already in markedHistory. Skipping.`);
            return;
        }

        const cellIndex = flatGrid.findIndex(cellValue => cellValue === number);
        if (cellIndex !== -1) {
            newMarkedIndices.push(cellIndex);
            newHistoryNumbers.push(number); // Add to history only if found in grid
        } else {
            console.warn(`[processMarkedNumbers] Number ${number} not found in the current grid.`);
        }
    });

    if (newMarkedIndices.length > 0) {
        console.log('[processMarkedNumbers] Updating markedCells state with indices:', newMarkedIndices);
        // Use functional update for markedCells
        setMarkedCells(prev => {
            const updatedSet = new Set(prev);
            newMarkedIndices.forEach(index => updatedSet.add(index));
            return Array.from(updatedSet); 
        });
        // Use functional update for markedHistory
        setMarkedHistory(prev => [...prev, ...newHistoryNumbers]);
    }
  };

  // Handle receiving a marked number from the server
  // Use useCallback to potentially stabilize the function reference if needed as dependency elsewhere
  // Update destructuring to only expect number, markedBy, automatic
  const handleNumberMarked = useCallback(({ number, markedBy, automatic }) => { 
    // Use the REF here to check grid readiness
    // Log received data
    console.log(`[handleNumberMarked] Received event. Number: ${number}, MarkedBy: ${markedBy}, Automatic: ${automatic}. Checking grid readiness... Current isGridReadyRef.current: ${isGridReadyRef.current}`);

    if (isGridReadyRef.current) {
      // Grid is ready. Use functional setGrid to access the LATEST grid state
      console.log('[handleNumberMarked] Grid IS ready (ref check). Using setGrid to access latest grid state for processing.');
      setGrid(currentGrid => { 
        // Now we are guaranteed to have the most up-to-date grid
        processMarkedNumbers([number], currentGrid);
        // setIsMarking(false); // <<< REMOVE from here
        return currentGrid; // Important: return the grid state unchanged
      });
      // ** Call setIsMarking(false) directly AFTER the setGrid call **
      console.log('[handleNumberMarked] Attempting to set isMarking to false.');
      // Check ref value right before setting state
      console.log(`[handleNumberMarked] isMarkingRef.current BEFORE direct set & setIsMarking(false): ${isMarkingRef.current}`);
      // --- Try direct ref update FIRST ---
      isMarkingRef.current = false; 
      // --- Now set state ---
      setIsMarking(false);
      console.log(`[handleNumberMarked] Successfully called setIsMarking(false). Ref is now: ${isMarkingRef.current}`);
    } else {
      // Grid is not ready, queue the number
      console.warn(`[handleNumberMarked] Grid is NOT ready (ref check) when receiving number ${number}. Queuing.`);
      // Avoid adding duplicates to the queue
      if (!pendingMarkedNumbersRef.current.includes(number)) {
          pendingMarkedNumbersRef.current.push(number);
      }
       // Even if queued, we should probably release the lock as the server won't confirm this specific action now.
      // Also release lock here if grid wasn't ready
      console.log('[handleNumberMarked - Grid Not Ready] Attempting to set isMarking to false.');
      // Check ref value right before setting state
      console.log(`[handleNumberMarked - Grid Not Ready] isMarkingRef.current BEFORE direct set & setIsMarking(false): ${isMarkingRef.current}`);
      // --- Try direct ref update FIRST ---
      isMarkingRef.current = false; 
      // --- Now set state ---
      setIsMarking(false);
      console.log(`[handleNumberMarked - Grid Not Ready] Successfully called setIsMarking(false). Ref is now: ${isMarkingRef.current}`);
    }
  // Keep grid dependency for useCallback, even though we access latest via setGrid now.
  // This ensures the callback reference updates if grid reference changes, which is still correct.
  }, [grid, markedHistory]); 

  // Handle receiving a full sync of marked numbers
  const handleSyncMarkedNumbers = useCallback(({ markedNumbers }) => {
    // Use the REF here
    console.log(`[handleSyncMarkedNumbers] Received sync event with ${markedNumbers?.length} numbers. Checking grid readiness... Current isGridReadyRef.current: ${isGridReadyRef.current}`); 
    if (Array.isArray(markedNumbers)) {
        if (isGridReadyRef.current) {
            // Grid is ready. Use functional setGrid to access the LATEST grid state
            console.log('[handleSyncMarkedNumbers] Grid IS ready (ref check). Using setGrid to access latest grid state for processing.');
            setGrid(currentGrid => {
              // Now we are guaranteed to have the most up-to-date grid
              processMarkedNumbers(markedNumbers, currentGrid);
              return currentGrid; // Important: return the grid state unchanged
            });
        } else {
            // Grid not ready, replace the queue with the synced list, ensuring no duplicates
            console.warn('[handleSyncMarkedNumbers] Grid is NOT ready (ref check). Replacing queue with synced numbers.');
            pendingMarkedNumbersRef.current = [...new Set(markedNumbers)]; // Use Set to remove duplicates
        }
    } else {
        console.error('[handleSyncMarkedNumbers] Received invalid markedNumbers data:', markedNumbers);
    }
  // Keep grid dependency for useCallback
  }, [grid, markedHistory]); 
  
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
    
    // Normalize players
    const normalizedPlayers = Array.isArray(data.players) 
      ? data.players.map(p => normalizePlayer(p))
      : [];
    setPlayers(normalizedPlayers);
    
    // Reset grid/ready state before processing joined-room data
    setGrid([]);
    setIsGridReady(false);
    pendingMarkedNumbersRef.current = []; // Clear pending numbers

    if (data.grid && Array.isArray(data.grid) && data.grid.length > 0) {
        console.log('Setting grid from joined-room event.');
        // Directly call handleGridAssigned to ensure consistent logic including pending number processing
        handleGridAssigned(data.grid); 
    } else {
        console.warn('No valid grid data in joined-room event:', data);
        // Explicitly request grid if none provided
         socket.emit('request-grid', { roomCode });
    }
    
    // If game is already in progress, request sync
    if (data.gameStarted) {
      setWaitingForPlayers(false);
      setGameStarted(true);
      console.log('Game already started on join, requesting marked numbers sync.');
      socket.emit('request-marked-numbers', { roomCode }); // Request full state
      
      // Set turn info if available
       if (data.currentTurn) {
         setCurrentTurn(data.currentTurn);
         const turnPlayer = normalizedPlayers.find(p => p.id === data.currentTurn);
         setCurrentTurnName(turnPlayer ? turnPlayer.username : 'Unknown');
         setIsMyTurn(data.currentTurn === socket.id);
       }

    } else {
      setWaitingForPlayers(true);
      setGameStarted(false);
    }
    
    // Update ready players list
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
    setWaitingForPlayers(false); // Ensure waiting room UI is hidden
    setGameStarted(true);
    
    // Reset relevant game state for a fresh start
    setWinner(null);
    setWinningLines([]);
    setMarkedCells([]);
    setMarkedHistory([]); // Clear history on new game start
    setTimer(15);
    pendingMarkedNumbersRef.current = []; // Clear pending queue

    // Grid might be sent with game-started, handle it consistently
    if (data.grid && Array.isArray(data.grid) && data.grid.length > 0) {
        console.log('Setting grid from game-started event.');
        handleGridAssigned(data.grid); // Use the handler
    } else if (!isGridReadyRef.current) { // Check ref, might not have grid yet
        console.warn('No grid data in game-started event and grid not ready. Requesting grid.');
        socket.emit('request-grid', { roomCode });
    }
    
    // Set initial turn
    if (data.currentTurn) {
      setCurrentTurn(data.currentTurn);
      const turnPlayer = players.find(p => p.id === data.currentTurn) || data.player; // Use data.player as fallback
      const turnPlayerName = turnPlayer ? turnPlayer.username : 'Unknown';
      setCurrentTurnName(turnPlayerName);
      const isMyTurnNow = data.currentTurn === socket.id;
      setIsMyTurn(isMyTurnNow);
       setGameMessage(`Game started! ${isMyTurnNow ? 'Your' : `${turnPlayerName}'s`} turn`);
    } else {
        setGameMessage('Game started! Waiting for first turn...');
    }
    
    toast.success('Game started!');
    
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
    toast.error(message); // Show user-friendly error
    setGameMessage(message);
    console.log('[handleError] Attempting to set isMarking to false due to error.');
    // Check ref value right before direct set & state change
    console.log(`[handleError] isMarkingRef.current BEFORE direct set & setIsMarking(false): ${isMarkingRef.current}`);
    // If the error might be related to an invalid action (like marking), release the lock
    // --- Try direct ref update FIRST ---
    isMarkingRef.current = false; 
    // --- Now set state ---
    setIsMarking(false); // <<< Release lock on error
    // Log ref value after direct set & state change
    console.log(`[handleError] Successfully called setIsMarking(false). Ref is now: ${isMarkingRef.current}`);
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
  
  // Handle marking a number - NOW WITH DEBOUNCING
  const handleMarkNumber = useCallback((cellIndex, number) => {
    // Clear any existing debounce timer
    if (markNumberDebounceTimerRef.current) {
      clearTimeout(markNumberDebounceTimerRef.current);
    }

    // Set a new debounce timer
    markNumberDebounceTimerRef.current = setTimeout(() => {
      // --- Debounced Logic Starts Here ---
      // Log state values AT THE MOMENT this DEBOUNCED callback executes
      turnCheckLog.current = `[Debounced] handleMarkNumber executing. isMyTurn: ${isMyTurn}, gameStarted: ${gameStarted}, isMarkingRef.current: ${isMarkingRef.current}`;
      console.log(turnCheckLog.current);

      // Perform the checks *inside* the debounced function
      // Use the isMarkingRef for the check
      if (!isMyTurn || !gameStarted || isMarkingRef.current) {
        console.log('[Debounced] Cannot mark number:', { isMyTurn, gameStarted, isMarking: isMarkingRef.current }); // Log ref value
        // If isMarking is true, it means a mark attempt is already in progress.
        if (isMarkingRef.current) toast.error("Please wait for the previous action to complete.");
        return; // Do not proceed
      }

      console.log(`[Debounced] Attempting to mark number ${number} at index ${cellIndex}`);
      console.log(`[Debounced] PRE setIsMarking(true). Current ref value: ${isMarkingRef.current}`);
      setIsMarking(true); // Lock the state

      // Add specific log before emitting
      console.log(`[Debounced] Emitting 'mark-number' to server:`, { roomCode, number, cellIndex });
      // Emit mark-number event to the server
    socket.emit('mark-number', {
      roomCode,
        number,
        cellIndex
      });

      // Resetting isMarking is handled by handleNumberMarked or handleError
      // --- Debounced Logic Ends Here ---
    }, 300); // Debounce timeout of 300ms

  // Dependencies for the outer useCallback wrapper remain the same
  // The inner logic accesses state/refs directly when it runs
  }, [isMyTurn, gameStarted, roomCode]);
  
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
                      isInteractionDisabled={isMarking}
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
