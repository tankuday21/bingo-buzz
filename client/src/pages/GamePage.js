import React, { useState, useEffect, useContext, useRef } from 'react';
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
  
  // State for tracking if a number is being marked (to prevent multiple clicks)
  const [isMarking, setIsMarking] = useState(false);
  
  // Refs
  const timerIntervalRef = useRef(null);
  const audioRef = useRef(null);
  const hasJoinedRef = useRef(false);
  const timerRef = useRef(null);
  
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
    socket.on('number-marked', handleNumberMarked);
    socket.on('game-won', handleGameWon);
    socket.on('error', handleError);
    
    // Clean up on unmount
    return () => {
      socket.off('grid-assigned', handleGridAssigned);
      socket.off('joined-room', handleJoinedRoom);
      socket.off('player-joined', handlePlayerJoined);
      socket.off('player-left', handlePlayerLeft);
      socket.off('game-started', handleGameStarted);
      socket.off('turn-changed', handleTurnChanged);
      socket.off('number-marked', handleNumberMarked);
      socket.off('game-won', handleGameWon);
      socket.off('error', handleError);
      clearInterval(timerIntervalRef.current);
      hasJoinedRef.current = false;
    };
  }, [roomCode, username]);
  
  // useEffect for timer management - separate from turn handling
  useEffect(() => {
    let isActive = true;
    
    const startTimer = () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      
      timerIntervalRef.current = setInterval(() => {
        if (!isActive) return;
        
        setTimer((prev) => {
          const newValue = Math.max(0, prev - 1);
          console.log(`Timer: ${newValue}, Is my turn: ${isMyTurn}`);
          
          // Only emit end-turn if it's my turn and timer reaches 0
          if (newValue === 0 && isMyTurn && socket.connected) {
            console.log('Timer reached zero, ending turn automatically');
            clearInterval(timerIntervalRef.current);
            socket.emit('end-turn', { roomCode });
          }
          return newValue;
        });
      }, 1000);
    };

    // Start timer when game is started, regardless of whose turn it is
    if (gameStarted) {
      console.log('Starting timer for turn');
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
  
  // Handle socket disconnection
  useEffect(() => {
    const handleDisconnect = (reason) => {
      console.log('Socket disconnected:', reason);
      toast.error('Connection lost. Attempting to reconnect...');
      // Clear timer and pause game state
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setTimer(15);
      setIsMyTurn(false);
    };

    const handleReconnect = (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
      toast.success('Connection restored');
      // Attempt to rejoin the game
      if (roomCode && username) {
        console.log('Attempting to rejoin game:', roomCode);
        socket.emit('rejoin-room', { roomCode, username });
      }
    };

    const handleReconnectError = (error) => {
      console.error('Reconnection error:', error);
      toast.error('Failed to reconnect. Please refresh the page.');
    };

    const handleGameState = (state) => {
      console.log('Received game state:', state);
      setPlayers(state.players);
      setGrid(state.grid);
      setMarkedCells(state.markedCells);
      setCurrentTurnName(state.currentTurn);
      setIsMyTurn(state.currentTurn === username);
      if (state.lastMarkedCell) {
        setMarkedHistory(prev => [...prev, state.lastMarkedCell]);
      }
    };

    const handlePlayerDisconnected = ({ username: disconnectedUser, temporary }) => {
      console.log('Player disconnected:', disconnectedUser, temporary);
      toast.error(`${disconnectedUser} ${temporary ? 'lost connection' : 'left the game'}`);
    };

    const handlePlayerReconnected = ({ username: reconnectedUser }) => {
      console.log('Player reconnected:', reconnectedUser);
      toast.success(`${reconnectedUser} reconnected to the game`);
    };

    // Add event listeners
    socket.on('disconnect', handleDisconnect);
    socket.on('reconnect', handleReconnect);
    socket.on('reconnect_error', handleReconnectError);
    socket.on('game-state', handleGameState);
    socket.on('player-disconnected', handlePlayerDisconnected);
    socket.on('player-reconnected', handlePlayerReconnected);

    // Cleanup
    return () => {
      socket.off('disconnect', handleDisconnect);
      socket.off('reconnect', handleReconnect);
      socket.off('reconnect_error', handleReconnectError);
      socket.off('game-state', handleGameState);
      socket.off('player-disconnected', handlePlayerDisconnected);
      socket.off('player-reconnected', handlePlayerReconnected);
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
  const handleGridAssigned = (newGrid) => {
    console.log('Grid assigned event received:', newGrid);
    if (!newGrid || !Array.isArray(newGrid) || newGrid.length === 0) {
      console.error('Invalid grid received:', newGrid);
      return;
    }
    console.log('Setting grid state with valid grid data');
    setGrid(newGrid);
  };
  
  const handleJoinedRoom = (data) => {
    console.log('Joined room event received:', data);
    hasJoinedRef.current = true;
    
    // Set isHost status
    setIsHost(data.isHost);
    
    // Set the grid if provided and valid
    if (data.grid && Array.isArray(data.grid) && data.grid.length > 0) {
      console.log('Setting grid from joined-room event:', data.grid);
      setGrid(data.grid);
    }
    
    // Validate and set players
    if (Array.isArray(data.players)) {
      console.log('Setting players from joined-room event:', data.players);
      setPlayers(data.players);
    } else {
      console.error('Invalid players data received in joined-room:', data.players);
      setPlayers([]);
    }
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
    
    console.log('Setting players to:', updatedPlayers);
    setPlayers(updatedPlayers);
    
    // If a new player joined, show a toast
    if (!Array.isArray(data) && data.player) {
      toast(`${data.player.username} joined the game`);
    }
    
    // Check if this player is the host (first player)
    if (updatedPlayers.length > 0) {
      const firstPlayer = updatedPlayers[0];
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
    console.log('Game started event data:', data);
    
    // Update players if provided
    if (Array.isArray(data.players)) {
      setPlayers(data.players);
    }
    
    // Update current turn
    setCurrentTurn(data.currentTurn);
    setIsMyTurn(data.currentTurn === username);
    
    // Set game as started
    setGameStarted(true);
    
    // If we don't have a grid yet, request one
    if (!grid || grid.length === 0) {
      console.log('No grid found at game start, requesting one');
      socket.emit('request-grid', { roomCode });
    }
    
    toast.success('Game started!');
    setGameMessage(data.currentTurn === username ? 'Your turn!' : `${data.currentTurn}'s turn`);
  };
  
  const handleTurnChanged = (data) => {
    console.log('Turn changed:', data);
    setCurrentTurn(data.currentTurn);
    setIsMyTurn(data.currentTurn === username);
    setTimer(15);
    setGameMessage(data.currentTurn === username ? 'Your turn!' : `${data.currentTurn}'s turn`);
  };
  
  const handleNumberMarked = ({ cellIndex, markedBy, player, automatic }) => {
    console.log('Number marked:', cellIndex, 'by player:', player?.username || markedBy);
    
    // Only add the specific number to the marked set
    setMarkedCells((prev) => {
      const newMarked = [...prev, cellIndex];
      return newMarked;
    });
    
    // Add to history with player info
    setMarkedHistory((prev) => [
      ...prev, 
      { 
        cellIndex, 
        player: player?.username || 'Unknown', 
        automatic: !!automatic 
      }
    ]);
    
    // Play sound effect
    if (audioRef.current) {
      audioRef.current.play().catch(e => console.log('Audio play error:', e));
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
  
  // Game action handlers
  const handleStartGame = () => {
    if (players.length < 1) {
      toast.error('Need at least one player to start');
      return;
    }
    
    console.log('Starting game in room:', roomCode);
    socket.emit('start-game', { roomCode });
  };
  
  // Timer function
  const startTimer = () => {
    // Clear any existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    // Set initial timer value
    setTimer(15);
    
    // Start new timer
    timerRef.current = setInterval(() => {
      setTimer(prev => {
        // Only decrement if it's still my turn
        if (currentTurn === socket?.id && prev > 0) {
          console.log('Timer:', prev - 1, 'Is my turn:', true);
          return prev - 1;
        }
        return prev;
      });
    }, 1000);
  };

  // Handle marking a number
  const handleMarkNumber = (cellIndex) => {
    if (!socket || !roomCode) return;
    
    // Only allow marking if it's my turn
    if (currentTurn !== socket.id) {
      toast.error("It's not your turn!");
      return;
    }
    
    console.log('Marking number:', cellIndex);
    socket.emit('mark-number', { roomCode, cellIndex });
  };
  
  // Handle copying room code to clipboard
  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode)
      .then(() => {
        setCopySuccess(true);
        toast.success('Room code copied to clipboard!');
        setTimeout(() => setCopySuccess(false), 2000);
      })
      .catch(() => {
        toast.error('Failed to copy room code');
      });
  };
  
  // Handle going back to home
  const goHome = () => {
    navigate('/');
  };
  
  // Debug function to force grid generation
  const debugForceGridGeneration = () => {
    console.log('Forcing grid regeneration');
    socket.emit('request-grid', { roomCode });
    
    // Also log the current grid state
    console.log('Current grid state:', grid);
    console.log('Socket ID:', socket.id);
    console.log('Room code:', roomCode);
  };
  
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen p-4 sm:p-6 lg:p-8"
      style={{
        background: theme.colors.background,
        backgroundImage: theme.effects?.stars,
        color: theme.colors.text
      }}
    >
      <div className="max-w-7xl mx-auto">
        <motion.div
          variants={headerVariants}
          className="flex justify-between items-center mb-6"
        >
          <h1 className="text-2xl sm:text-3xl font-bold">
            Bingo Room: {roomCode}
          </h1>
          <ThemeSwitcher />
        </motion.div>

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
                <Timer timeLeft={timer} />
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

          <motion.div
            variants={containerVariants}
            className="lg:col-span-1"
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
              <PlayersList
                players={players}
                currentTurn={currentTurn}
                winner={winner}
              />
            </div>

            <AnimatePresence>
              {gameStarted && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="mt-4 p-4 rounded-xl text-center font-medium"
                  style={{
                    backgroundColor: theme.colors.accent,
                    color: theme.colors.card,
                    boxShadow: theme.effects?.cardShadow
                  }}
                >
                  {currentTurnName ? `${currentTurnName}'s Turn` : 'Waiting for the host to start the game...'}
                </motion.div>
              )}
            </AnimatePresence>

            {gameMessage && (
              <div
                className="mt-4 p-4 rounded-xl text-center font-medium"
                style={{
                  backgroundColor: theme.colors.primary,
                  color: theme.colors.card
                }}
              >
                {gameMessage}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default GamePage;
