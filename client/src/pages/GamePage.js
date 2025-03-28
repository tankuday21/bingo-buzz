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
  const [marked, setMarked] = useState(new Set());
  const [currentTurn, setCurrentTurn] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [timer, setTimer] = useState(15);
  const [winner, setWinner] = useState(null);
  const [winningLines, setWinningLines] = useState([]);
  const [markedHistory, setMarkedHistory] = useState([]);
  const [currentTurnName, setCurrentTurnName] = useState('');
  
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
    setMarked(new Set());
    setCurrentTurn(null);
    setGameStarted(false);
    setIsMyTurn(false);
    setTimer(15);
    setWinner(null);
    setWinningLines([]);
    setMarkedHistory([]);
    
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
      setMarked(new Set(state.markedNumbers));
      setCurrentTurnName(state.currentTurn);
      setIsMyTurn(state.currentTurn === username);
      if (state.lastMarkedNumber) {
        setMarkedHistory(prev => [...prev, state.lastMarkedNumber]);
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
      setMarked(new Set());
      setCurrentTurn(null);
      setGameStarted(false);
      setIsMyTurn(false);
      setTimer(15);
      setWinner(null);
      setWinningLines([]);
      setMarkedHistory([]);
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
    setIsMyTurn(data.currentTurn === socket.id);
    
    // Set game as started
    setGameStarted(true);
    
    // If we don't have a grid yet, request one
    if (!grid || grid.length === 0) {
      console.log('No grid found at game start, requesting one');
      socket.emit('request-grid', { roomCode });
    }
    
    toast.success('Game started!');
  };
  
  // Handle turn started event
  useEffect(() => {
    if (!socket) return;

    const handleTurnStarted = (data) => {
      console.log('Turn started for player:', data.playerId, 'Current socket ID:', socket.id);
      
      // Clear any existing timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      // Reset timer state for all players
      setTimer(15);
      
      // Update whose turn it is
      setCurrentTurn(data.playerId);
      setIsMyTurn(data.playerId === socket.id);
      
      // Show toast notification
      if (data.playerId === socket.id) {
        toast.success("It's your turn!");
      } else {
        const playerName = players.find(p => p.id === data.playerId)?.username || 'Unknown';
        toast(`It's ${playerName}'s turn`);
      }
    };

    socket.on('turn-started', handleTurnStarted);

    return () => {
      socket.off('turn-started', handleTurnStarted);
      // Clear timer on cleanup
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [socket, players]);
  
  const handleNumberMarked = ({ number, markedBy, player, automatic }) => {
    console.log('Number marked:', number, 'by player:', player?.username || markedBy);
    
    // Only add the specific number to the marked set
    setMarked((prev) => {
      const newMarked = new Set(prev);
      newMarked.add(number);
      return newMarked;
    });
    
    // Add to history with player info
    setMarkedHistory((prev) => [
      ...prev, 
      { 
        number, 
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
  };
  
  const handleError = (message) => {
    console.error('Game error:', message);
    toast.error(message);
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
  const handleMarkNumber = (number) => {
    if (!socket || !roomCode) return;
    
    // Only allow marking if it's my turn
    if (currentTurn !== socket.id) {
      toast.error("It's not your turn!");
      return;
    }
    
    console.log('Marking number:', number);
    socket.emit('mark-number', { roomCode, number });
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
    <div className="min-h-screen flex flex-col">
      {/* Sound Effects */}
      <audio ref={audioRef} src="/sounds/ding.mp3" />
      
      {/* Confetti Effect */}
      {showConfetti && <Confetti recycle={false} numberOfPieces={500} />}
      
      {/* Header */}
      <header 
        className="p-4"
        style={{
          background: `linear-gradient(to right, ${theme.colors.primary[600]}, ${theme.colors.accent[600]})`,
          color: 'white'
        }}
      >
        <div className="container mx-auto flex flex-wrap justify-between items-center">
          <motion.h1 
            className="text-3xl font-bold"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            Bingo Buzz
          </motion.h1>
          
          <div className="flex items-center space-x-4">
            {/* Room Code */}
            <motion.div 
              className="p-2 rounded flex items-center"
              style={{
                background: theme.colors.card,
                boxShadow: theme.effects.cardShadow,
                backdropFilter: theme.effects.glassMorphism
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="mr-2 font-mono font-bold" style={{ color: theme.colors.text }}>
                {roomCode}
              </span>
              <button 
                onClick={copyRoomCode}
                style={{ color: theme.colors.primary[600] }}
                className="hover:opacity-80"
                title="Copy room code"
              >
                {copySuccess ? '✓' : '📋'}
              </button>
            </motion.div>
            
            <ThemeSwitcher />
            
            <motion.button
              onClick={goHome}
              className="px-3 py-1 rounded hover:opacity-80"
              style={{
                background: theme.colors.card,
                color: theme.colors.primary[600]
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Exit
            </motion.button>
          </div>
        </div>
      </header>
      
      {/* Main content */}
      <main className="flex-1 container mx-auto p-4">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left sidebar - Players */}
          <motion.div 
            className="lg:w-1/4 rounded-lg p-4"
            style={{
              background: theme.colors.card,
              boxShadow: theme.effects.cardShadow,
              backdropFilter: theme.effects.glassMorphism
            }}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-xl font-bold mb-4" style={{ color: theme.colors.text }}>Players</h2>
            <PlayersList players={players} currentTurn={currentTurn} />
            
            {/* Host controls */}
            {isHost && !gameStarted && (
              <div className="mt-4">
                <motion.button
                  onClick={handleStartGame}
                  className="w-full py-2 font-bold rounded transition-colors"
                  style={{
                    background: theme.colors.primary[600],
                    color: 'white'
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Start Game
                </motion.button>
              </div>
            )}
            
            {/* Game status */}
            {gameStarted && (
              <div className="mt-4">
                <h3 className="font-semibold" style={{ color: theme.colors.text }}>Current Turn</h3>
                <p style={{ 
                  color: isMyTurn ? theme.colors.primary[600] : theme.colors.text,
                  fontWeight: isMyTurn ? 'bold' : 'normal'
                }}>
                  {isMyTurn ? 'Your Turn' : `${currentTurnName}'s Turn`}
                </p>
                
                <div className="mt-2">
                  <Timer seconds={timer} />
                </div>
              </div>
            )}
          </motion.div>
          
          {/* Main game area */}
          <motion.div 
            className="lg:w-1/2 flex flex-col items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {!gameStarted && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-lg p-6 mb-6 w-full"
                style={{
                  background: theme.colors.card,
                  boxShadow: theme.effects.cardShadow,
                  backdropFilter: theme.effects.glassMorphism
                }}
              >
                <h2 className="text-2xl font-bold mb-4" style={{ color: theme.colors.text }}>
                  Waiting for players
                </h2>
                <p style={{ color: theme.colors.text }}>
                  {isHost ? 
                    'Invite players to join using the room code, then press Start Game.' :
                    'Waiting for the host to start the game...'
                  }
                </p>
              </motion.div>
            )}
            
            {/* Bingo Grid */}
            <div className="w-full">
              <BingoGrid 
                grid={grid} 
                marked={marked} 
                onMarkNumber={gameStarted ? handleMarkNumber : undefined} 
                isMyTurn={isMyTurn && gameStarted}
                winningLines={winningLines}
                symbols={symbols}
              />
            </div>
          </motion.div>
          
          {/* Right sidebar - Game Info */}
          <motion.div 
            className="lg:w-1/4 rounded-lg p-4"
            style={{
              background: theme.colors.card,
              boxShadow: theme.effects.cardShadow,
              backdropFilter: theme.effects.glassMorphism
            }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <h2 className="text-xl font-bold mb-4" style={{ color: theme.colors.text }}>
              Marked Numbers
            </h2>
            {markedHistory.length > 0 ? (
              <div className="max-h-80 overflow-y-auto">
                {markedHistory.map((item, index) => (
                  <motion.div 
                    key={index} 
                    className="mb-1 p-2 border-b"
                    style={{ borderColor: theme.colors.border }}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <span className="font-bold" style={{ color: theme.colors.primary[600] }}>
                      {item.number}
                    </span>
                    <span style={{ color: theme.colors.text }}> by {item.player}</span>
                    {item.automatic && (
                      <span className="text-xs" style={{ color: theme.colors.text, opacity: 0.7 }}>
                        {' '}(auto)
                      </span>
                    )}
                  </motion.div>
                ))}
              </div>
            ) : (
              <p style={{ color: theme.colors.text, opacity: 0.7 }}>
                No numbers marked yet
              </p>
            )}
            
            {/* Theme & Symbols Settings */}
            <div className="mt-6">
              <h3 className="font-bold mb-2" style={{ color: theme.colors.text }}>
                Grid Display
              </h3>
              <div className="flex space-x-2 mb-2">
                <motion.button 
                  onClick={() => setSymbols('numbers')}
                  className="px-3 py-1 rounded"
                  style={{
                    background: symbols === 'numbers' ? theme.colors.primary[600] : theme.colors.primary[50],
                    color: symbols === 'numbers' ? 'white' : theme.colors.text
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Numbers
                </motion.button>
                <motion.button 
                  onClick={() => setSymbols('emojis')}
                  className="px-3 py-1 rounded"
                  style={{
                    background: symbols === 'emojis' ? theme.colors.primary[600] : theme.colors.primary[50],
                    color: symbols === 'emojis' ? 'white' : theme.colors.text
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Emojis
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      </main>
      
      {/* Winner Modal */}
      <AnimatePresence>
        {winner && (
          <WinnerModal 
            winner={winner} 
            onClose={() => setWinner(null)} 
            onExitGame={handleExitGame} 
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default GamePage;
