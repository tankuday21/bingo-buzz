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
    socket.on('number-marked', handleNumberMarked);
    socket.on('game-won', handleGameWon);
    socket.on('error', handleError);
    socket.on('player-ready', handlePlayerReady);
    
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
      socket.off('player-ready', handlePlayerReady);
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
    
    if (data.grid) setGrid(data.grid);
    if (data.currentTurn) {
      setCurrentTurn(data.currentTurn);
      setCurrentTurnName(data.currentTurn);
      setIsMyTurn(data.currentTurn === username);
    }
    
    // Reset UI state
    setWinner(null);
    setWinningLines([]);
    setMarkedCells([]);
    setTimer(15);
    
    toast.success('Game started!');
    setGameMessage(`Game started! ${data.currentTurn}'s turn`);
    
    // Play start sound
    if (audioRef.current) {
      audioRef.current.play().catch(e => console.log('Audio play error:', e));
    }
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
  
  // Handle player ready state changes
  const handlePlayerReady = ({ username: readyUsername, readyPlayers }) => {
    console.log(`Player ready update received: ${readyUsername}, Ready players:`, readyPlayers);
    
    if (Array.isArray(readyPlayers)) {
      setReadyPlayers(readyPlayers);
      
      // Check if I'm the player who toggled ready status
      if (readyUsername === username) {
        const amIReady = readyPlayers.includes(username);
        console.log(`Updating my ready status to ${amIReady}`);
        setIsReady(amIReady);
      }
      
      // Show a notification
      const isPlayerReady = readyPlayers.includes(readyUsername);
      toast.success(`${readyUsername} is ${isPlayerReady ? 'ready' : 'not ready'}`);
    } else {
      console.error('Invalid readyPlayers data received:', readyPlayers);
    }
  };
  
  // Toggle ready status
  const handleToggleReady = () => {
    const newReadyStatus = !isReady;
    setIsReady(newReadyStatus);
    console.log(`Setting ready status to ${newReadyStatus} for ${username} in room ${roomCode}`);
    socket.emit('toggle-ready', { roomCode, username, isReady: newReadyStatus });
  };
  
  // Start the game (host only)
  const handleStartGame = () => {
    if (!isHost) return;
    
    // Check if enough players are ready
    if (readyPlayers.length < 1) {
      toast.error('Not enough players are ready to start the game');
      return;
    }
    
    socket.emit('start-game', { roomCode });
  };
  
  // Copy room code to clipboard
  const handleCopyRoomCode = () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopySuccess(true);
      toast.success('Room code copied to clipboard!');
      setTimeout(() => setCopySuccess(false), 2000);
    });
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
    </motion.div>
  );
};

export default GamePage;
