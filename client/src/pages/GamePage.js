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

// DEBUG flag to control logging (set to false in production)
const DEBUG = false;

// Feature flags for UI enhancements
const ENABLE_EMOJIS = false; // Set to true to enable emoji mode

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
  const [lastMarkedNumber, setLastMarkedNumber] = useState(null);
  const [currentTurnName, setCurrentTurnName] = useState('');
  const [gameMessage, setGameMessage] = useState('');

  // UI state
  const [symbols, setSymbols] = useState('numbers'); // 'numbers' or 'emojis'
  const [isHost, setIsHost] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // Add loading state

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
  const [connectionStatus, setConnectionStatus] = useState(socket.connected ? 'Connected' : 'Disconnected');

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

  // Add a periodic check to ensure isMarking doesn't get stuck
  useEffect(() => {
    // Only run this effect if the game has started
    if (!gameStarted) return;

    const markingCheckInterval = setInterval(() => {
      // If isMarking has been true for more than 5 seconds, reset it
      if (isMarkingRef.current) {
        console.log('[Marking Check] isMarking has been true for too long. Resetting...');
        isMarkingRef.current = false;
        setIsMarking(false);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(markingCheckInterval);
  }, [gameStarted]);

  // Track the last turn change time
  const lastTurnChangeTimeRef = useRef(Date.now());

  // Update the last turn change time whenever the turn changes
  useEffect(() => {
    lastTurnChangeTimeRef.current = Date.now();
  }, [currentTurn]);

  // Function to request the current game state from the server
  const requestGameState = useCallback(() => {
    console.log('[requestGameState] Requesting current game state from server');

    // Reset any locks that might be preventing interaction
    isMarkingRef.current = false;
    setIsMarking(false);

    // Show a message to the user
    toast('Syncing game state...', { icon: '🔄' });

    try {
      // Request the current game state from the server
      socket.emit('request-game-state', { roomCode });

      // Also request marked numbers to ensure we're in sync
      socket.emit('request-marked-numbers', { roomCode });
    } catch (e) {
      console.error('[requestGameState] Error requesting game state:', e);
      toast.error('Failed to sync game state. Please refresh the page.');
    }
  }, [roomCode]);

  // Function to manually force a turn change (for recovery)
  const forceNextTurn = useCallback(() => {
    console.log('[forceNextTurn] Manually forcing turn change');

    // First, try to request the current game state to ensure we're in sync
    requestGameState();

    // Find the next player
    if (players.length < 2) {
      console.warn('[forceNextTurn] Not enough players to force turn change');
      return;
    }

    // Find the current player index
    const currentPlayerIndex = players.findIndex(p => p.id === currentTurn);
    if (currentPlayerIndex === -1) {
      console.warn('[forceNextTurn] Current player not found in players list');
      // If we can't find the current player, just use the first player that's not the current socket
      const otherPlayer = players.find(p => p.id !== socket.id);
      if (otherPlayer) {
        console.log(`[forceNextTurn] Using fallback: changing turn to ${otherPlayer.username}`);
        setCurrentTurn(otherPlayer.id);
        setIsMyTurn(otherPlayer.id === socket.id);

        // Update game message
        if (otherPlayer.id === socket.id) {
          setGameMessage('Your turn! Click on a number.');
        } else {
          setGameMessage(`Waiting for ${otherPlayer.username} to choose a number...`);
        }

        // Reset any locks
        isMarkingRef.current = false;
        setIsMarking(false);

        // Update the last turn change time
        lastTurnChangeTimeRef.current = Date.now();

        // Show a message to the user
        toast('Turn changed manually due to connection issues', { icon: '🔄' });
        return;
      }
      return;
    }

    // Calculate the next player index
    const nextPlayerIndex = (currentPlayerIndex + 1) % players.length;
    const nextPlayer = players[nextPlayerIndex];

    if (!nextPlayer) {
      console.warn('[forceNextTurn] Next player not found');
      return;
    }

    console.log(`[forceNextTurn] Changing turn from ${players[currentPlayerIndex]?.username} to ${nextPlayer.username}`);

    // Update the turn state locally
    setCurrentTurn(nextPlayer.id);
    setIsMyTurn(nextPlayer.id === socket.id);

    // Update game message
    if (nextPlayer.id === socket.id) {
      setGameMessage('Your turn! Click on a number.');
    } else {
      setGameMessage(`Waiting for ${nextPlayer.username} to choose a number...`);
    }

    // Reset any locks
    isMarkingRef.current = false;
    setIsMarking(false);

    // Update the last turn change time
    lastTurnChangeTimeRef.current = Date.now();

    // Show a message to the user
    toast('Turn changed manually due to connection issues', { icon: '🔄' });

    // Try to notify the server about the turn change
    try {
      socket.emit('end-turn', { roomCode });
    } catch (e) {
      console.error('[forceNextTurn] Error notifying server about turn change:', e);
    }
  }, [currentTurn, players, socket.id, roomCode, requestGameState]);

  // Add a periodic check for socket connection health
  useEffect(() => {
    // Only run this effect if the game has started
    if (!gameStarted) return;

    // Function to check and refresh socket connection if needed
    const checkSocketConnection = () => {
      if (!socket.connected) {
        console.warn('[Socket Check] Socket disconnected, attempting to reconnect...');

        // Try to reconnect
        if (!socket.connecting) {
          socket.connect();
          toast('Reconnecting to game server...', { icon: '🔄' });
        }

        // Reset any locks that might be preventing interaction
        if (isMarkingRef.current) {
          isMarkingRef.current = false;
          setIsMarking(false);
        }
      } else {
        // Socket is connected, send a ping to ensure it's responsive
        socket.emit('ping');
      }
    };

    // Function to check game state and recover if needed
    const checkGameState = () => {
      // Check if it's been too long since the last turn change
      const now = Date.now();
      const lastTurnTime = lastTurnChangeTimeRef.current || now;

      // If it's been more than 10 seconds since the last turn change and it's my turn and I'm marking
      if (now - lastTurnTime > 10000 && isMyTurn && isMarkingRef.current) {
        console.warn('[Game State Check] Game appears to be stuck during my turn. Forcing recovery...');

        // Force release any locks
        isMarkingRef.current = false;
        setIsMarking(false);

        // Show a message to the user
        toast.error('Game appears to be stuck. Recovering...');

        // Request a fresh game state from the server
        try {
          socket.emit('request-game-state', { roomCode });
        } catch (e) {
          console.error('[Game State Check] Error requesting game state:', e);
        }
      }

      // If it's been more than 15 seconds since the last turn change and it's my turn (even if not marking)
      if (now - lastTurnTime > 15000 && isMyTurn) {
        console.warn('[Game State Check] My turn has been active for too long. Forcing turn change...');

        // Force a turn change
        forceNextTurn();
      }

      // If it's been more than 20 seconds since the last turn change (regardless of whose turn it is)
      if (now - lastTurnTime > 20000) {
        console.warn('[Game State Check] Game has been stuck for too long. Forcing turn change...');

        // Force a turn change
        forceNextTurn();
      }
    };

    // Check connection every 8 seconds
    const socketCheckInterval = setInterval(checkSocketConnection, 8000);

    // Check game state every 10 seconds
    const gameStateCheckInterval = setInterval(checkGameState, 10000);

    // Initial check
    checkSocketConnection();

    return () => {
      clearInterval(socketCheckInterval);
      clearInterval(gameStateCheckInterval);
    };
  }, [gameStarted, isMyTurn, roomCode, forceNextTurn]);

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

  // Check for valid game session and redirect if needed
  useEffect(() => {
    // If no username or roomCode, try to recover from localStorage
    if (!username || !roomCode) {
      const storedUsername = localStorage.getItem('username');
      const storedRoomCode = localStorage.getItem('lastRoomCode');

      if (!storedUsername) {
        // No username found, redirect to home page
        toast.error('Session expired. Please enter your name again.');
        navigate('/');
        return;
      }

      if (storedUsername && !username) {
        setUsername(storedUsername);
      }

      // If we have a stored room code but no current room code, redirect
      if (storedRoomCode && !roomCode) {
        navigate(`/game/${storedRoomCode}`);
        return;
      }
    }

    // Set a timeout to ensure loading state doesn't get stuck
    const loadingTimeout = setTimeout(() => {
      if (isLoading) {
        console.log('Loading timeout reached, forcing loading state to false');
        setIsLoading(false);

        // If we're still loading after timeout, try to join the room again
        if (roomCode && username && socket.connected) {
          socket.emit('join-room', { roomCode, username });
        }
      }
    }, 5000); // 5 second timeout

    return () => clearTimeout(loadingTimeout);
  }, [username, roomCode, navigate, isLoading]);

  // Monitor socket connection status with improved error handling
  useEffect(() => {
    // Check initial connection status
    setSocketConnected(socket.connected);
    setConnectionStatus(socket.connected ? 'Connected' : 'Disconnected');

    // Connection handler with improved recovery
    const handleConnect = () => {
      if (DEBUG) {
        console.log('Socket connected');
      }
      setSocketConnected(true);
      setConnectionStatus('Connected');
      toast.success('Connected to game server');

      // If we're in a game, try to rejoin with explicit grid request
      if (roomCode && username) {
        if (DEBUG) {
          console.log('Attempting to rejoin game after reconnection');
        }

        // Show reconnection message to user
        toast('Reconnecting to game...', {
          icon: '🔄',
          duration: 3000
        });

        // Emit rejoin event with all necessary data
        socket.emit('rejoin-room', {
          roomCode,
          username,
          reconnect: true,
          previousSocketId: socket.id
        });

        // Explicitly request game state after reconnection with a delay
        // to ensure server has processed the rejoin request
        setTimeout(() => {
          if (DEBUG) {
            console.log('Requesting game state after reconnection');
          }
          socket.emit('request-game-state', { roomCode, username });
        }, 1000);
      }
    };

    // Disconnect handler with improved user feedback
    const handleDisconnect = (reason) => {
      if (DEBUG) {
        console.log('Socket disconnected:', reason);
      }
      setSocketConnected(false);
      setConnectionStatus(`Disconnected: ${reason}`);

      // Only show error for non-temporary disconnects
      if (reason !== 'transport close' && reason !== 'ping timeout') {
        toast.error('Connection lost. Attempting to reconnect...', {
          duration: 3000,
          icon: '📶'
        });
      }

      // Clear timer and pause game state
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }

      // Set UI state to show connection issue
      setGameMessage('Connection issue. Waiting to reconnect...');
    };

    // Add connection event listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    // Add more detailed connection status listeners
    socket.on('connect_error', (error) => {
      if (DEBUG) {
        console.error('Socket connection error:', error);
      }
      setConnectionStatus(`Connection Error: ${error.message}`);
      setGameMessage(`Connection error: ${error.message}. Trying to reconnect...`);
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      if (DEBUG) {
        console.log(`Reconnection attempt ${attemptNumber}`);
      }
      setConnectionStatus(`Reconnecting (Attempt ${attemptNumber})...`);
    });

    // Try to connect if not already connected
    if (!socket.connected) {
      if (DEBUG) {
        console.log('Socket not connected, attempting to connect');
      }
      socket.connect();
    } else {
      // If already connected, explicitly request game state
      if (roomCode) {
        if (DEBUG) {
          console.log('Socket already connected, requesting game state');
        }
        setTimeout(() => {
          socket.emit('request-game-state', { roomCode, username });
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
        // Always log the number being processed
        console.log(`[processMarkedNumbers] Processing number ${number}`);

        // Check if number is already processed in current history (important for sync)
        if (markedHistory.includes(number)) {
            console.log(`[processMarkedNumbers] Number ${number} is already in markedHistory. Checking if it's marked in cells.`);

            // Even if it's in history, make sure it's also marked in the cells
            const cellIndex = flatGrid.findIndex(cellValue => cellValue === number);
            if (cellIndex !== -1 && !markedCells.includes(cellIndex)) {
                console.log(`[processMarkedNumbers] Number ${number} is in history but not marked in cells. Adding index ${cellIndex}.`);
                newMarkedIndices.push(cellIndex);
            }
            return;
        }

        const cellIndex = flatGrid.findIndex(cellValue => cellValue === number);
        if (cellIndex !== -1) {
            console.log(`[processMarkedNumbers] Found number ${number} at index ${cellIndex}. Adding to marked indices.`);
            newMarkedIndices.push(cellIndex);
            newHistoryNumbers.push(number); // Add to history only if found in grid
        } else {
            console.warn(`[processMarkedNumbers] Number ${number} not found in the current grid.`);
        }
    });

    if (newMarkedIndices.length > 0) {
        // Always log for debugging
        console.log('[processMarkedNumbers] Updating markedCells state with indices:', newMarkedIndices);

        // Use functional update for markedCells with a more reliable approach
        setMarkedCells(prev => {
            // Create a new array with all previous marked cells
            const updatedMarkedCells = [...prev];

            // Add new marked indices, avoiding duplicates
            newMarkedIndices.forEach(index => {
                if (!updatedMarkedCells.includes(index)) {
                    updatedMarkedCells.push(index);
                }
            });

            // Log the updated cells
            console.log('[processMarkedNumbers] Updated markedCells:', updatedMarkedCells);

            return updatedMarkedCells;
        });

        // Use functional update for markedHistory
        setMarkedHistory(prev => {
            const updatedHistory = [...prev];
            newHistoryNumbers.forEach(num => {
                if (!updatedHistory.includes(num)) {
                    updatedHistory.push(num);
                }
            });
            return updatedHistory;
        });

        // Force a re-render to ensure the UI updates
        setTimeout(() => {
            // This will trigger a re-render
            setIsMarking(prev => !prev);
            setTimeout(() => {
                setIsMarking(prev => !prev);
            }, 50);
        }, 100);
    }
  };

  // Handle receiving a marked number from the server
  // Use useCallback to potentially stabilize the function reference if needed as dependency elsewhere
  const handleNumberMarked = useCallback((data) => {
    // Get data properties with fallbacks for backward compatibility
    const number = data.number;
    const markedBy = data.markedBy;
    const automatic = data.automatic;

    // Always log this event for debugging
    console.log(`[handleNumberMarked] Received event:`, data);
    console.log(`[handleNumberMarked] Number: ${number}, MarkedBy: ${markedBy}, Automatic: ${automatic}. Grid ready: ${isGridReadyRef.current}`);
    console.log(`[handleNumberMarked] Current markedCells:`, markedCells);

    // Set last marked number for highlighting
    if (number) {
      setLastMarkedNumber(number);

      // Clear the last marked number highlight after 5 seconds
      setTimeout(() => {
        setLastMarkedNumber(null);
      }, 5000);
    }

    // Force a re-render to ensure the UI updates
    setIsMarking(false);

    // Update marked cells if provided directly
    if (data.markedCells) {
      // Make sure we're not replacing the existing marked cells, but adding to them
      setMarkedCells(prev => {
        // Create a new array with all previous marked cells
        const updatedMarkedCells = [...prev];

        // Add new marked cells, avoiding duplicates
        data.markedCells.forEach(index => {
          if (!updatedMarkedCells.includes(index)) {
            updatedMarkedCells.push(index);
          }
        });

        return updatedMarkedCells;
      });
    }

    // Update turn information
    if (data.currentTurn) {
      setCurrentTurn(data.currentTurn);
      setIsMyTurn(data.currentTurn === socket.id);
    }

    // Update timer
    if (data.timer) {
      setTimer(data.timer);
    }

    if (isGridReadyRef.current) {
      // Grid is ready. Use functional setGrid to access the LATEST grid state
      if (DEBUG) {
        console.log('[handleNumberMarked] Grid IS ready. Processing number.');
      }
      setGrid(currentGrid => {
        // Now we are guaranteed to have the most up-to-date grid
        processMarkedNumbers([number], currentGrid);
        return currentGrid; // Important: return the grid state unchanged
      });
    } else {
      // Grid is not ready, queue the number
      if (DEBUG) {
        console.log(`[handleNumberMarked] Grid is NOT ready. Queuing number ${number}.`);
      }
      // Avoid adding duplicates to the queue
      if (number && !pendingMarkedNumbersRef.current.includes(number)) {
          pendingMarkedNumbersRef.current.push(number);
      }
    }

    // Always release marking lock
    isMarkingRef.current = false;
    setIsMarking(false);

    // Add to history if not already there
    if (number && !markedHistory.includes(number)) {
      setMarkedHistory(prev => [...prev, number]);
    }
  }, [markedHistory]);

  // Handle receiving a full sync of marked numbers
  const handleSyncMarkedNumbers = useCallback(({ markedNumbers }) => {
    // Use the REF here
    if (DEBUG) {
      console.log(`[handleSyncMarkedNumbers] Received sync event with ${markedNumbers?.length} numbers. Grid ready: ${isGridReadyRef.current}`);
    }

    if (Array.isArray(markedNumbers)) {
        if (isGridReadyRef.current) {
            // Grid is ready. Use functional setGrid to access the LATEST grid state
            if (DEBUG) {
              console.log('[handleSyncMarkedNumbers] Grid IS ready. Processing numbers.');
            }

            // First, update the markedHistory to include all these numbers
            setMarkedHistory(prev => {
                const updatedHistory = [...prev];
                markedNumbers.forEach(num => {
                    if (!updatedHistory.includes(num)) {
                        updatedHistory.push(num);
                    }
                });
                return updatedHistory;
            });

            // Then process the numbers to update markedCells
            setGrid(currentGrid => {
              // Now we are guaranteed to have the most up-to-date grid
              processMarkedNumbers(markedNumbers, currentGrid);
              return currentGrid; // Important: return the grid state unchanged
            });
        } else {
            // Grid not ready, queue the numbers for later processing
            if (DEBUG) {
              console.log('[handleSyncMarkedNumbers] Grid is NOT ready. Queuing numbers.');
            }

            // Add to pending numbers, ensuring no duplicates
            markedNumbers.forEach(num => {
                if (!pendingMarkedNumbersRef.current.includes(num)) {
                    pendingMarkedNumbersRef.current.push(num);
                }
            });
        }
    } else {
        console.error('[handleSyncMarkedNumbers] Received invalid markedNumbers data:', markedNumbers);
    }
  }, []);

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
    setIsLoading(false); // Set loading to false once we've joined the room

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

  // Completely redesigned handleTurnChanged function with extreme reliability
  const handleTurnChanged = (data) => {
    console.log('Turn changed event received:', data);

    // STEP 1: Extract and validate the turn data
    const newCurrentTurn = data.currentTurn || data.playerId;
    if (!newCurrentTurn) {
      console.error('[handleTurnChanged] Invalid turn data received:', data);
      return;
    }

    // STEP 2: Update the turn state
    console.log(`[handleTurnChanged] Setting current turn to: ${newCurrentTurn}`);
    setCurrentTurn(newCurrentTurn);

    // STEP 3: Determine if it's my turn and update state
    const isMyTurnNow = newCurrentTurn === socket.id;
    console.log(`[handleTurnChanged] Is it my turn now? ${isMyTurnNow}`);
    setIsMyTurn(isMyTurnNow);

    // STEP 4: Reset all UI locks and timers
    // Reset marking state
    isMarkingRef.current = false;
    setIsMarking(false);

    // Clear any pending debounce timers
    if (markNumberDebounceTimerRef.current) {
      clearTimeout(markNumberDebounceTimerRef.current);
      markNumberDebounceTimerRef.current = null;
    }

    // Clear any other pending timeouts
    // (This is a safety measure to ensure no lingering timeouts)
    if (window._gameTimeouts) {
      window._gameTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
      window._gameTimeouts = [];
    } else {
      window._gameTimeouts = [];
    }

    // STEP 5: Update the UI based on whose turn it is
    if (isMyTurnNow) {
      console.log('[handleTurnChanged] It is now MY turn!');
      // Reset timer when it's my turn
      setTimer(15);
      setGameMessage('Your turn! Click on a number.');

      // Play a sound or show a visual indicator to alert the player
      try {
        if (audioRef.current) {
          audioRef.current.play().catch(e => console.log('Audio play error:', e));
        }
      } catch (e) {
        console.error('[handleTurnChanged] Error playing turn sound:', e);
      }
    } else {
      // Find the current player
      const currentPlayer = data.player || players.find(p => p.id === newCurrentTurn);
      const playerName = currentPlayer ? currentPlayer.username : 'Unknown';
      console.log(`[handleTurnChanged] It is now ${playerName}'s turn`);
      setGameMessage(`Waiting for ${playerName} to choose a number...`);
    }

    // STEP 6: Update the last turn change time
    lastTurnChangeTimeRef.current = Date.now();

    // STEP 7: If players array is provided in the data, update it
    if (data.players && Array.isArray(data.players)) {
      console.log('[handleTurnChanged] Updating players list from turn data');
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
    // Only log in debug mode
    if (DEBUG) {
      console.error('Game error:', message);
    }

    // Show user-friendly error with more context
    const errorMsg = typeof message === 'string' ? message : 'An error occurred';
    toast.error(errorMsg, {
      duration: 5000, // Show longer for errors
      style: {
        border: `2px solid ${theme.colors.error || '#ef4444'}`,
        padding: '16px',
        color: theme.colors.text
      },
      icon: '⚠️'
    });

    // Update game message for UI display
    setGameMessage(errorMsg);

    // Release any locks that might be preventing further interaction
    if (isMarkingRef.current) {
      if (DEBUG) {
        console.log('[handleError] Releasing isMarking lock due to error');
      }
      isMarkingRef.current = false;
      setIsMarking(false);
    }

    // Clear any pending timers
    if (markNumberDebounceTimerRef.current) {
      clearTimeout(markNumberDebounceTimerRef.current);
      markNumberDebounceTimerRef.current = null;
    }

    // Attempt recovery based on error type
    if (errorMsg.includes('Not your turn')) {
      // Turn synchronization error - client thinks it's their turn but server disagrees
      console.warn('[handleError] Turn synchronization error detected');

      // Update local state to match server
      setIsMyTurn(false);

      // Request full game state to resync
      if (socket && socket.connected && roomCode) {
        toast('Turn out of sync. Syncing with server...', {
          icon: '🔄',
          duration: 3000
        });
        requestGameState();
      }
    } else if (errorMsg.includes('connection') || errorMsg.includes('disconnect')) {
      // Connection-related errors
      if (socket && !socket.connected) {
        toast('Attempting to reconnect...', {
          icon: '🔄',
          duration: 3000
        });
        socket.connect();
      }
    } else if (errorMsg.includes('game state') || errorMsg.includes('sync')) {
      // Game state errors - request a fresh sync
      if (socket && socket.connected && roomCode) {
        toast('Requesting game state update...', {
          icon: '🔄',
          duration: 3000
        });
        requestGameState();
      }
    }
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

  // Completely redesigned handleMarkNumber function with extreme reliability measures
  const handleMarkNumber = useCallback((cellIndex, number) => {
    // Immediately clear any existing debounce timer
    if (markNumberDebounceTimerRef.current) {
      clearTimeout(markNumberDebounceTimerRef.current);
      markNumberDebounceTimerRef.current = null;
    }

    // Set a new debounce timer with a shorter delay
    markNumberDebounceTimerRef.current = setTimeout(() => {
      console.log(`[handleMarkNumber] Attempting to mark number ${number} at index ${cellIndex}`);

      // STEP 1: Perform all client-side validation checks
      // Check if it's my turn
      if (!isMyTurn) {
        console.warn("[handleMarkNumber] Not your turn - requesting game state sync");
        toast.error("It's not your turn");
        requestGameState(); // Always sync when turn state might be wrong
        return;
      }

      // Check if game has started
      if (!gameStarted) {
        toast.error("Game hasn't started yet");
        return;
      }

      // Check if we're already processing a mark
      if (isMarkingRef.current) {
        toast.error("Please wait for the previous action to complete");
        return;
      }

      // Check if the cell is already marked locally
      if (markedCells.includes(cellIndex)) {
        toast.error("This number is already marked");
        return;
      }

      // STEP 2: Set marking state to prevent multiple clicks
      isMarkingRef.current = true;
      setIsMarking(true);

      // STEP 3: Mark the cell locally IMMEDIATELY for responsive UI
      console.log('[handleMarkNumber] Marking cell locally for immediate feedback');

      // Update marked cells locally
      setMarkedCells(prev => {
        if (!prev.includes(cellIndex)) {
          return [...prev, cellIndex];
        }
        return prev;
      });

      // Update marked history
      setMarkedHistory(prev => {
        if (!prev.includes(number)) {
          return [...prev, number];
        }
        return prev;
      });

      // Set last marked number for highlighting
      setLastMarkedNumber(number);

      // Process the marked number locally
      processMarkedNumbers([number], grid);

      // STEP 4: Set up multiple safety mechanisms

      // Track server response
      let serverResponseReceived = false;

      // Safety timeout 1: Quick check for server response
      const quickCheckTimeout = setTimeout(() => {
        if (!serverResponseReceived) {
          console.warn('[handleMarkNumber] No server response yet after 1 second');
        }
      }, 1000);

      // Safety timeout 2: Medium timeout to check connection
      const mediumTimeout = setTimeout(() => {
        if (!serverResponseReceived) {
          console.warn('[handleMarkNumber] No server response after 2 seconds, checking connection');

          // Check if socket is connected
          if (!socket.connected) {
            console.error('[handleMarkNumber] Socket disconnected, attempting to reconnect');
            try {
              socket.connect();
            } catch (e) {
              console.error('[handleMarkNumber] Error reconnecting:', e);
            }
          }
        }
      }, 2000);

      // Safety timeout 3: Final timeout to force turn change
      const finalTimeout = setTimeout(() => {
        if (!serverResponseReceived && isMarkingRef.current) {
          console.error('[handleMarkNumber] No server response after 3 seconds, forcing turn change');

          // Release the marking lock
          isMarkingRef.current = false;
          setIsMarking(false);

          // Show a message to the user
          toast.error('The server is not responding. Continuing game locally.');

          // Force turn change
          if (isMyTurn) {
            console.log('[handleMarkNumber] Forcing turn change after local mark');
            forceNextTurn();

            // Try to notify other players
            try {
              socket.emit('number-marked-local', {
                roomCode,
                number,
                markedBy: socket.id,
                automatic: false
              });
            } catch (e) {
              console.error('[handleMarkNumber] Error emitting local mark:', e);
            }
          }
        }
      }, 3000);

      // STEP 5: Send the mark to the server
      console.log(`[handleMarkNumber] Sending mark to server: ${number}`);

      try {
        // Send only what the server expects: roomCode and number
        socket.emit('mark-number', {
          roomCode,
          number
        }, (response) => {
          // Clear all safety timeouts
          clearTimeout(quickCheckTimeout);
          clearTimeout(mediumTimeout);
          clearTimeout(finalTimeout);

          // Mark that we received a response
          serverResponseReceived = true;

          // Handle the response
          if (response && response.error) {
            console.error(`[handleMarkNumber] Server returned error:`, response.error);
            toast.error(response.error);

            // If the server says it's not our turn, sync the game state
            if (response.error.includes('Not your turn')) {
              console.warn('[handleMarkNumber] Server says it\'s not our turn, syncing state');
              setIsMyTurn(false);
              requestGameState();
            }
          } else {
            console.log(`[handleMarkNumber] Server confirmed mark:`, response || 'No response data');
          }

          // Always release the marking lock
          isMarkingRef.current = false;
          setIsMarking(false);
        });
      } catch (error) {
        console.error('[handleMarkNumber] Error sending mark to server:', error);
        toast.error('Error communicating with server');

        // Don't release the lock yet - let the safety timeouts handle it
      }
    }, 100); // Reduced debounce to 100ms for faster response
  }, [isMyTurn, gameStarted, markedCells, roomCode, grid, forceNextTurn, requestGameState, processMarkedNumbers, socket.id]);

  // Add enhanced connection status indicator to UI
  const [connectionHealth, setConnectionHealth] = useState({
    connected: socketConnected,
    lastPing: Date.now(),
    lastPong: Date.now(),
    pingCount: 0,
    pongCount: 0
  });

  // Update connection status when socket connects/disconnects
  useEffect(() => {
    const handleConnect = () => {
      console.log('[ConnectionStatus] Socket connected');
      setConnectionHealth(prev => ({
        ...prev,
        connected: true,
        lastPing: Date.now()
      }));
      setSocketConnected(true);
    };

    const handleDisconnect = () => {
      console.log('[ConnectionStatus] Socket disconnected');
      setConnectionHealth(prev => ({
        ...prev,
        connected: false
      }));
      setSocketConnected(false);
    };

    const handlePong = () => {
      setConnectionHealth(prev => ({
        ...prev,
        lastPong: Date.now(),
        pongCount: prev.pongCount + 1
      }));
    };

    // Set up listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('pong', handlePong);

    // Send regular pings to check connection
    const pingInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('ping');
        setConnectionHealth(prev => ({
          ...prev,
          lastPing: Date.now(),
          pingCount: prev.pingCount + 1
        }));
      }
    }, 5000);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('pong', handlePong);
      clearInterval(pingInterval);
    };
  }, []);

  // Calculate connection health
  const getConnectionHealth = () => {
    const now = Date.now();
    const timeSinceLastPong = now - connectionHealth.lastPong;

    if (!connectionHealth.connected) return 'disconnected';
    if (timeSinceLastPong > 15000) return 'poor';
    if (timeSinceLastPong > 5000) return 'fair';
    return 'good';
  };

  const ConnectionStatus = () => {
    const health = getConnectionHealth();

    return (
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
        {health === 'good' && (
          <div className="bg-green-500 text-white px-3 py-1 rounded-full text-sm flex items-center">
            <span className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></span>
            Connected
          </div>
        )}
        {health === 'fair' && (
          <div className="bg-yellow-500 text-white px-3 py-1 rounded-full text-sm flex items-center">
            <span className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></span>
            Slow Connection
          </div>
        )}
        {health === 'poor' && (
          <div className="bg-orange-500 text-white px-3 py-1 rounded-full text-sm flex items-center">
            <span className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></span>
            Poor Connection
            <button
              onClick={requestGameState}
              className="ml-2 bg-white text-orange-500 rounded-full px-2 text-xs"
            >
              Sync
            </button>
          </div>
        )}
        {health === 'disconnected' && (
          <div className="bg-red-500 text-white px-3 py-1 rounded-full text-sm flex items-center">
            <span className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></span>
            Disconnected
            <button
              onClick={() => socket.connect()}
              className="ml-2 bg-white text-red-500 rounded-full px-2 text-xs"
            >
              Reconnect
            </button>
          </div>
        )}
      </div>
    );
  };

  // Effect for Socket Listeners
  useEffect(() => {
    if (!socket) return;

    console.log('[Effect: Socket Listeners] Setting up listeners...');

    // Handler for successful connection/reconnection
    const handleConnect = () => {
      console.log('Socket connected:', socket.id);
      setSocketConnected(true);
      setConnectionStatus('Connected');
      // Clear any previous error messages
      toast.dismiss();
      toast.success('Connected to game server');
      // Attempt to re-join the room automatically on connect/reconnect
      if (roomCode && username) {
        console.log(`[Socket Connect] Attempting to re-join room ${roomCode} as ${username}`);
        socket.emit('join-room', { roomCode, username }, (response) => {
          // This callback might receive initial game state from server upon successful rejoin
          if (response?.status === 'success') {
            console.log('[Socket Rejoin Callback] Successfully rejoined room. Response:', response);
            // Optionally handle initial state sync received in response here
            if (response.gameState) {
              // Example: sync state if server sends it on rejoin
              // handleGameStateUpdate(response.gameState);
            }
          } else {
            console.error('[Socket Rejoin Callback] Failed to rejoin room:', response?.message);
            // Handle potential errors, e.g., navigate back or show error
            toast.error(`Failed to rejoin room: ${response?.message || 'Unknown error'}`);
          }
        });
      }
    };

    // Handler for disconnection
    const handleDisconnect = (reason) => {
      console.warn('Socket disconnected:', reason);
      setSocketConnected(false);
      setConnectionStatus(`Disconnected: ${reason}. Attempting to reconnect...`);
      // Reset states that depend on persistent connection or turn status?
      // setIsMyTurn(false); // Maybe reset turn status on disconnect?
      // toast.info('Connection lost. Attempting to reconnect...');
    };

    // Add listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('game-state', handleGameStateUpdate); // Use the consolidated handler
    socket.on('assign-grid', handleGridAssigned);
    socket.on('number-marked', handleNumberMarked); // Server should broadcast this
    socket.on('number-marked-local', handleNumberMarked); // Also listen for local marks
    socket.on('turn-changed', handleTurnChanged);   // Server should broadcast this
    socket.on('game-over', handleGameOver);
    socket.on('game-error', handleError);
    socket.on('player-joined', handlePlayerJoined);
    socket.on('player-left', handlePlayerLeft);
    socket.on('player-ready-update', handlePlayerReadyUpdate);
    socket.on('game-started', handleGameStarted);
    socket.on('sync-marked-numbers', handleSyncMarkedNumbers); // Listen for full sync
    socket.on('turn-started', handleTurnChanged);

    // Special DEBUG listeners
    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message, err.data);
      setConnectionStatus(`Connection Error: ${err.message}`);
    });
    socket.on('connect_timeout', () => {
      console.error('Socket connection timeout');
      setConnectionStatus('Connection Timeout');
    });
    socket.on('reconnect_attempt', (attempt) => {
      console.log('Socket reconnect attempt:', attempt);
      setConnectionStatus(`Reconnecting (Attempt ${attempt})...`);
    });
    socket.on('reconnect_error', (err) => {
      console.error('Socket reconnect error:', err.message);
      setConnectionStatus(`Reconnect Error: ${err.message}`);
    });
    socket.on('reconnect_failed', () => {
      console.error('Socket reconnect failed permanently');
      setConnectionStatus('Reconnect Failed');
      toast.error('Could not reconnect to the server. Please refresh.');
    });
    socket.on('reconnect', (attempt) => {
      console.log('Socket reconnected successfully on attempt:', attempt, 'New ID:', socket.id);
      setConnectionStatus('Reconnected');
      // Re-joining is handled by the 'connect' event handler now
    });


    // Cleanup function
    return () => {
      console.log('[Effect: Socket Listeners] Cleaning up listeners...');
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('game-state', handleGameStateUpdate);
      socket.off('assign-grid', handleGridAssigned);
      socket.off('number-marked', handleNumberMarked);
      socket.off('number-marked-local', handleNumberMarked);
      socket.off('turn-changed', handleTurnChanged);
      socket.off('game-over', handleGameOver);
      socket.off('game-error', handleError);
      socket.off('player-joined', handlePlayerJoined);
      socket.off('player-left', handlePlayerLeft);
      socket.off('player-ready-update', handlePlayerReadyUpdate);
      socket.off('game-started', handleGameStarted);
      socket.off('sync-marked-numbers', handleSyncMarkedNumbers);
      socket.off('turn-started', handleTurnChanged);

      // Cleanup DEBUG listeners
      socket.off('connect_error');
      socket.off('connect_timeout');
      socket.off('reconnect_attempt');
      socket.off('reconnect_error');
      socket.off('reconnect_failed');
      socket.off('reconnect');
    };
  // Add roomCode and username as dependencies so rejoin logic has access to them
  }, [socket, roomCode, username]);

  // Implement missing game event handlers
  const handleGameStateUpdate = useCallback((gameState) => {
    if (DEBUG) {
      console.log('Game state updated:', gameState);
    }
    if (gameState.grid) setGrid(gameState.grid);
    if (gameState.markedNumbers) setMarkedCells(Array.from(gameState.markedNumbers));
    if (gameState.currentTurn) setCurrentTurn(gameState.currentTurn);
    if (gameState.gameStarted) setGameStarted(gameState.gameStarted);
    if (gameState.players) setPlayers(gameState.players);
  }, []);

  const handleGameOver = useCallback(({ winner, winningLines }) => {
    console.log('Game over:', winner);
    setWinner(winner);
    setWinningLines(winningLines || []);
    setGameStarted(false);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 5000);
  }, []);

  const handlePlayerReadyUpdate = useCallback(({ playerId, isReady }) => {
    setPlayers(prevPlayers =>
      prevPlayers.map(player =>
        player.id === playerId ? { ...player, isReady } : player
      )
    );
  }, []);

  const handleTurnStarted = useCallback(({ playerId, playerName }) => {
    setIsMyTurn(socket.id === playerId);
    setCurrentTurnName(playerName);
    setTimer(15); // Reset timer for new turn
  }, [socket.id]);

  return (
    <motion.div
      className="min-h-screen py-8 px-4 relative overflow-hidden"
      style={{ backgroundColor: theme.colors.background }}
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Loading screen */}
      {isLoading && (
        <div className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: theme.colors.background }}
        >
          <div className="text-center p-8 rounded-xl shadow-lg"
            style={{ backgroundColor: theme.colors.card }}
          >
            <div className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4"
              style={{ borderColor: `${theme.colors.primary} transparent transparent transparent` }}
            ></div>
            <h2 className="text-xl font-bold mb-2">Connecting to Game</h2>
            <p className="text-sm opacity-75 mb-4">Please wait while we connect you to the game room...</p>
            <p className="text-xs opacity-50">Room Code: {roomCode}</p>
          </div>
        </div>
      )}

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

            {/* Sync Game State button - always show during game */}
            {gameStarted && (
              <button
                onClick={requestGameState}
                className="ml-2 px-3 py-1 rounded-md text-sm font-medium transition-colors duration-200"
                style={{
                  backgroundColor: theme.colors.accent,
                  color: '#ffffff'
                }}
                title="Sync game state with server"
              >
                Sync Game State
              </button>
            )}

            {/* Emergency turn change button - only show during game */}
            {gameStarted && (
              <button
                onClick={forceNextTurn}
                className="ml-2 px-3 py-1 rounded-md text-sm font-medium transition-colors duration-200"
                style={{
                  backgroundColor: theme.colors.error,
                  color: '#ffffff'
                }}
                title="Use only if the game is stuck"
              >
                Emergency Turn Change
              </button>
            )}
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

                {/* Connection status indicator */}
                <div className="mt-4 flex items-center">
                  <div
                    className="w-3 h-3 rounded-full mr-2"
                    style={{
                      backgroundColor: socketConnected ? theme.colors.success : theme.colors.error || '#ef4444',
                      boxShadow: socketConnected ? '0 0 6px 2px rgba(0, 255, 0, 0.3)' : '0 0 6px 2px rgba(255, 0, 0, 0.3)'
                    }}
                  />
                  <span className="text-sm">
                    {socketConnected ? 'Connected' : connectionStatus}
                  </span>
                </div>

                {/* Game message display */}
                {gameMessage && (
                  <div
                    className="mt-3 p-2 rounded-md text-sm"
                    style={{
                      backgroundColor: `${theme.colors.card}80`,
                      border: `1px solid ${theme.colors.border}`
                    }}
                  >
                    {gameMessage}
                  </div>
                )}
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            <motion.div
              variants={containerVariants}
              className="lg:col-span-2 order-2 lg:order-1"
            >
              <div
                className="rounded-xl p-4 sm:p-6 backdrop-blur-md bg-opacity-80 shadow-lg"
                style={{
                  backgroundColor: theme.colors.card,
                  boxShadow: theme.effects?.cardShadow || '0 4px 6px rgba(0,0,0,0.1)',
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
                      isMyTurn={isMyTurn}
                      useEmojis={ENABLE_EMOJIS}
                      lastMarkedNumber={lastMarkedNumber}
                    />
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div variants={containerVariants} className="order-1 lg:order-2">
              <div
                className="rounded-xl p-4 md:p-6 backdrop-blur-md bg-opacity-80 shadow-lg"
                style={{
                  backgroundColor: theme.colors.card,
                  boxShadow: theme.effects?.cardShadow || '0 4px 6px rgba(0,0,0,0.1)',
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
      <div className="fixed bottom-4 right-4 z-50">
        <div
          className="px-3 py-1 rounded-full text-sm flex items-center shadow-lg"
          style={{
            backgroundColor: socketConnected ? theme.colors.success : theme.colors.error || '#ef4444',
            color: '#ffffff'
          }}
        >
          <div
            className="w-2 h-2 rounded-full mr-2"
            style={{
              backgroundColor: '#ffffff',
              boxShadow: socketConnected ? '0 0 6px 2px rgba(255, 255, 255, 0.5)' : 'none'
            }}
          />
          {socketConnected ? 'Connected' : connectionStatus}
        </div>
      </div>
    </motion.div>
  );
};

export default GamePage;
