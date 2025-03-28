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
  const [symbols, setSymbols] = useState('numbers'); // 'numbers', 'emojis', 'custom'
  const [customSymbols, setCustomSymbols] = useState('');
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
          
          if (newValue === 0 && isMyTurn && socket.connected) {
            console.log('Timer reached zero, ending turn automatically');
            clearInterval(timerIntervalRef.current);
            socket.emit('end-turn', { roomCode });
          }
          return newValue;
        });
      }, 1000);
    };

    if (gameStarted && isMyTurn) {
      console.log('Starting timer for my turn');
      startTimer();
    } else if (!isMyTurn) {
      console.log('Not my turn, clearing timer');
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
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
    
    // Set the grid
    if (data.grid) {
      console.log('Setting grid from joined-room event. Grid data:', JSON.stringify(data.grid));
      if (!Array.isArray(data.grid) || data.grid.length === 0) {
        console.error('Invalid grid data in joined-room event');
      } else {
        console.log('Grid dimensions:', data.grid.length, 'x', data.grid[0].length);
        setGrid(data.grid);
      }
    } else {
      console.warn('No grid data in joined-room event');
    }
    
    // Validate and set players
    if (data.players) {
      if (Array.isArray(data.players)) {
        console.log('Setting players from joined-room event:', data.players);
        setPlayers(data.players);
      } else {
        console.error('Invalid players data received in joined-room:', data.players);
        // Initialize with empty array as fallback
        setPlayers([]);
      }
    } else {
      // Initialize with empty array if players not provided
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
    
    // Update players
    const updatedPlayers = data.players;
    if (updatedPlayers && Array.isArray(updatedPlayers)) {
      setPlayers(updatedPlayers);
    }
    
    // Update current turn
    setCurrentTurn(data.currentTurn);
    
    // Set game as started
    setGameStarted(true);
    
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
      
      // Reset timer state
      setTimer(15);
      
      // Update whose turn it is
      setCurrentTurn(data.playerId);
      setIsMyTurn(data.playerId === socket.id);
      
      // Show toast notification
      if (data.playerId === socket.id) {
        console.log('Starting timer for my turn');
        startTimer();
        toast.success("It's your turn!");
      } else {
        console.log('Not my turn, clearing timer');
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
      <header className="bg-gradient-to-r from-primary-600 to-accent-600 p-4 text-white">
        <div className="container mx-auto flex flex-wrap justify-between items-center">
          <h1 className="text-3xl font-bold">Bingo Buzz</h1>
          
          <div className="flex items-center space-x-4">
            {/* Room Code */}
            <div className="bg-white text-black p-2 rounded flex items-center">
              <span className="mr-2 font-mono font-bold">{roomCode}</span>
              <button 
                onClick={copyRoomCode}
                className="text-primary-600 hover:text-primary-800"
                title="Copy room code"
              >
                {copySuccess ? '✓' : '📋'}
              </button>
            </div>
            
            <ThemeSwitcher />
            
            <button
              onClick={goHome}
              className="bg-white text-primary-600 px-3 py-1 rounded hover:bg-gray-100"
            >
              Exit
            </button>
            
            <button
              onClick={debugForceGridGeneration}
              className="bg-white text-primary-600 px-3 py-1 rounded hover:bg-gray-100"
            >
              Debug: Force Grid
            </button>
          </div>
        </div>
      </header>
      
      {/* Main content */}
      <main className="flex-1 container mx-auto p-4">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left sidebar - Players */}
          <div className="lg:w-1/4 bg-white rounded-lg shadow-lg p-4">
            <h2 className="text-xl font-bold mb-4">Players</h2>
            <PlayersList players={players} currentTurn={currentTurn} />
            
            {/* Host controls */}
            {isHost && !gameStarted && (
              <div className="mt-4">
                <button
                  onClick={handleStartGame}
                  className="w-full py-2 bg-primary-600 text-white font-bold rounded hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                >
                  Start Game
                </button>
              </div>
            )}
            
            {/* Game status */}
            {gameStarted && (
              <div className="mt-4">
                <h3 className="font-semibold">Current Turn</h3>
                <p className={`${isMyTurn ? 'text-primary-600 font-bold' : ''}`}>
                  {isMyTurn ? 'Your Turn' : `${currentTurnName}'s Turn`}
                </p>
                
                <div className="mt-2">
                  <Timer seconds={timer} />
                </div>
              </div>
            )}
          </div>
          
          {/* Main game area */}
          <div className="lg:w-1/2 flex flex-col items-center">
            {!gameStarted && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white rounded-lg shadow-lg p-6 mb-6 w-full"
              >
                <h2 className="text-2xl font-bold mb-4">Waiting for players</h2>
                {isHost ? (
                  <p>Invite players to join using the room code, then press Start Game.</p>
                ) : (
                  <p>Waiting for the host to start the game...</p>
                )}
              </motion.div>
            )}
            
            {/* Bingo Grid */}
            <div className="w-full">
              {(!grid || grid.length === 0) ? (
                <div className="bg-white rounded-lg shadow-lg p-4">
                  <div className="flex flex-col items-center justify-center h-64">
                    <p className="text-red-500 mb-4">Bingo board is missing! This is a technical issue.</p>
                    <div className="flex space-x-4">
                      <button 
                        onClick={debugForceGridGeneration}
                        className="bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700 mr-2"
                      >
                        Regenerate Board
                      </button>
                      <button 
                        onClick={() => window.location.reload()}
                        className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                      >
                        Reload Game
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <BingoGrid 
                  grid={grid} 
                  marked={marked} 
                  onMarkNumber={gameStarted ? handleMarkNumber : undefined} 
                  isMyTurn={isMyTurn && gameStarted}
                  winningLines={winningLines}
                  symbols={symbols}
                  customSymbols={customSymbols}
                />
              )}
            </div>
          </div>
          
          {/* Right sidebar - Game Info */}
          <div className="lg:w-1/4 bg-white rounded-lg shadow-lg p-4">
            <h2 className="text-xl font-bold mb-4">Marked Numbers</h2>
            {markedHistory.length > 0 ? (
              <div className="max-h-80 overflow-y-auto">
                {markedHistory.map((item, index) => (
                  <div key={index} className="mb-1 p-2 border-b">
                    <span className="font-bold">{item.number}</span>
                    <span className="text-sm"> by {item.player}</span>
                    {item.automatic && <span className="text-xs text-gray-500"> (auto)</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No numbers marked yet</p>
            )}
            
            {/* Theme & Symbols Settings */}
            <div className="mt-6">
              <h3 className="font-bold mb-2">Grid Symbols</h3>
              <div className="flex space-x-2 mb-2">
                <button 
                  onClick={() => setSymbols('numbers')}
                  className={`px-3 py-1 rounded ${symbols === 'numbers' ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}
                >
                  Numbers
                </button>
                <button 
                  onClick={() => setSymbols('emojis')}
                  className={`px-3 py-1 rounded ${symbols === 'emojis' ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}
                >
                  Emojis
                </button>
                <button 
                  onClick={() => setSymbols('custom')}
                  className={`px-3 py-1 rounded ${symbols === 'custom' ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}
                >
                  Custom
                </button>
              </div>
              
              {symbols === 'custom' && (
                <div className="mt-2">
                  <input
                    type="text"
                    placeholder="Enter symbols (comma-separated)"
                    value={customSymbols}
                    onChange={(e) => setCustomSymbols(e.target.value)}
                    className="w-full p-2 border rounded"
                  />
                  <p className="text-xs mt-1 text-gray-500">Example: 🐱,⭐,🍎,...</p>
                </div>
              )}
            </div>
          </div>
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
