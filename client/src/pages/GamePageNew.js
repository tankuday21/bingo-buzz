import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import Confetti from 'react-confetti';
import { useTheme } from '../context/ThemeContext';
import BingoGrid from '../components/BingoGrid';
import PlayerList from '../components/PlayerList';
import Timer from '../components/Timer';
import ThemeSwitcher from '../components/ThemeSwitcher';
import { socket } from '../socket';
import { GameEngineProvider, useGameEngine } from '../components/GameEngineProvider';

// Debug flag
const DEBUG = false;

// Animation variants
const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      when: "beforeChildren",
      staggerChildren: 0.1
    }
  }
};

const headerVariants = {
  hidden: { opacity: 0, y: -20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 }
  }
};

// Main Game Component (Wrapper)
const GamePage = () => {
  const { roomCode } = useParams();
  const [username, setUsername] = useState(localStorage.getItem('username') || '');

  // Check if we have a username
  useEffect(() => {
    if (!username) {
      // Prompt for username if not set
      const name = prompt('Please enter your username:');
      if (name) {
        setUsername(name);
        localStorage.setItem('username', name);
      } else {
        // Redirect to home if no username is provided
        window.location.href = '/';
      }
    }
  }, [username]);

  if (!username || !roomCode) {
    return <div>Loading...</div>;
  }

  return (
    <GameEngineProvider socket={socket} roomCode={roomCode} username={username}>
      <GamePageContent roomCode={roomCode} username={username} />
    </GameEngineProvider>
  );
};

// Game Content Component (Uses GameEngine)
const GamePageContent = ({ roomCode, username }) => {
  const navigate = useNavigate();
  const { theme } = useTheme();

  // Get game state and methods from GameEngine
  const {
    grid,
    players,
    markedNumbers,
    markedCells,
    currentTurn,
    gameStarted,
    winner,
    winningLines,
    isMyTurn,
    offlineMode,
    connectionStatus,
    markNumber,
    forceTurnChange,
    enableOfflineMode,
    requestGameState
  } = useGameEngine();

  // Local state
  const [isLoading, setIsLoading] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [waitingForPlayers, setWaitingForPlayers] = useState(true);
  const [readyPlayers, setReadyPlayers] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [timer, setTimer] = useState(15);
  const [gameMessage, setGameMessage] = useState('');
  const [lastMarkedNumber, setLastMarkedNumber] = useState(null);

  // Audio ref
  const audioRef = React.useRef(null);

  // Update game message based on game state
  useEffect(() => {
    if (winner) {
      const winnerName = players.find(p => p.id === winner.playerId)?.username || 'Unknown';
      setGameMessage(`Game over! ${winnerName} won!`);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
    } else if (gameStarted) {
      if (isMyTurn) {
        setGameMessage('Your turn! Click on a number.');
      } else {
        const currentPlayer = players.find(p => p.id === currentTurn);
        const playerName = currentPlayer ? currentPlayer.username : 'Unknown';
        setGameMessage(`Waiting for ${playerName} to choose a number...`);
      }
    } else if (waitingForPlayers) {
      setGameMessage('Waiting for players to join and get ready...');
    }
  }, [winner, gameStarted, isMyTurn, currentTurn, players, waitingForPlayers]);

  // Update host status
  useEffect(() => {
    if (players.length > 0) {
      setIsHost(players[0].id === socket.id);
    }
  }, [players]);

  // Update loading state
  useEffect(() => {
    if (grid.length > 0) {
      setIsLoading(false);
    }
  }, [grid]);

  // Join room on mount
  useEffect(() => {
    console.log(`Joining room ${roomCode} as ${username}`);
    socket.emit('join-room', { roomCode, username });

    // Set a timeout to ensure loading state doesn't get stuck
    const loadingTimeout = setTimeout(() => {
      if (isLoading) {
        console.log('Loading timeout reached, forcing loading state to false');
        setIsLoading(false);
      }
    }, 5000);

    return () => clearTimeout(loadingTimeout);
  }, [roomCode, username, isLoading]);

  // Handle player ready state changes
  useEffect(() => {
    const handlePlayerReady = ({ username: readyUsername, readyPlayers: updatedReadyPlayers }) => {
      console.log(`Player ready update: ${readyUsername}, Ready players:`, updatedReadyPlayers);
      setReadyPlayers(updatedReadyPlayers || []);

      // Update local ready state
      if (readyUsername === username) {
        setIsReady(true);
      }
    };

    socket.on('player-ready', handlePlayerReady);

    return () => {
      socket.off('player-ready', handlePlayerReady);
    };
  }, [username]);

  // Handle game started
  useEffect(() => {
    if (gameStarted) {
      setWaitingForPlayers(false);

      // Play start sound
      if (audioRef.current) {
        audioRef.current.play().catch(e => console.log('Audio play error:', e));
      }
    }
  }, [gameStarted]);

  // Handle marked number
  useEffect(() => {
    if (markedNumbers.length > 0) {
      // Set last marked number for highlighting
      setLastMarkedNumber(markedNumbers[markedNumbers.length - 1]);

      // Clear the last marked number highlight after 5 seconds
      const timeout = setTimeout(() => {
        setLastMarkedNumber(null);
      }, 5000);

      return () => clearTimeout(timeout);
    }
  }, [markedNumbers]);

  // Handle timer
  useEffect(() => {
    if (gameStarted && isMyTurn) {
      // Reset timer when it's my turn
      setTimer(15);

      // Set up timer interval
      const timerInterval = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerInterval);
            // Auto-end turn when timer expires
            forceTurnChange();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timerInterval);
    }
  }, [gameStarted, isMyTurn, forceTurnChange]);

  // Handle offline mode
  useEffect(() => {
    if (offlineMode) {
      toast.error('Playing in offline mode. Game state will not be synchronized with other players.');
    }
  }, [offlineMode]);

  // Handle cell click
  const handleCellClick = useCallback((cellIndex, number) => {
    console.log(`Cell clicked: ${cellIndex}, Number: ${number}`);

    // Mark the number using the game engine
    markNumber(number);
  }, [markNumber]);

  // Toggle ready status
  const handleToggleReady = useCallback(() => {
    if (!socket.connected) {
      toast.error('Not connected to server.');
      return;
    }

    const newState = !isReady;
    console.log(`Toggling ready status. Current: ${isReady}, New: ${newState}`);

    // Optimistically update local state for immediate feedback
    setIsReady(newState);

    // Emit the event to the server
    socket.emit('toggle-ready', { roomCode, username, isReady: newState });
  }, [isReady, roomCode, username]);

  // Start the game (host only)
  const handleStartGame = useCallback(() => {
    if (!socket.connected) {
      toast.error('Not connected to server.');
      return;
    }

    if (isHost) {
      socket.emit('start-game', { roomCode });
    } else {
      toast.error('Only the host can start the game.');
    }
  }, [isHost, roomCode]);

  // Copy room code to clipboard
  const handleCopyRoomCode = useCallback(() => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopySuccess(true);
      toast.success('Room code copied to clipboard!');
      setTimeout(() => setCopySuccess(false), 2000);
    });
  }, [roomCode]);

  // Connection status component
  const ConnectionStatusIndicator = () => {
    const getStatusColor = () => {
      if (!connectionStatus.connected) return theme.colors.error || '#ef4444';
      if (offlineMode) return '#f97316'; // Orange
      return theme.colors.success || '#10b981';
    };

    const getStatusText = () => {
      if (!connectionStatus.connected) return 'Disconnected';
      if (offlineMode) return 'Offline Mode';
      return 'Connected';
    };

    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div
          className="px-3 py-1 rounded-full text-sm flex items-center shadow-lg"
          style={{
            backgroundColor: getStatusColor(),
            color: '#ffffff'
          }}
        >
          <div
            className="w-2 h-2 rounded-full mr-2"
            style={{
              backgroundColor: '#ffffff',
              boxShadow: connectionStatus.connected ? '0 0 6px 2px rgba(255, 255, 255, 0.5)' : 'none'
            }}
          />
          {getStatusText()}

          {!connectionStatus.connected && (
            <button
              onClick={() => socket.connect()}
              className="ml-2 bg-white text-red-500 rounded-full px-2 text-xs"
            >
              Reconnect
            </button>
          )}

          {connectionStatus.connected && !offlineMode && (
            <button
              onClick={requestGameState}
              className="ml-2 bg-white text-green-500 rounded-full px-2 text-xs"
            >
              Sync
            </button>
          )}

          {connectionStatus.connected && !offlineMode && (
            <button
              onClick={enableOfflineMode}
              className="ml-2 bg-white text-orange-500 rounded-full px-2 text-xs"
            >
              Go Offline
            </button>
          )}
        </div>
      </div>
    );
  };

  // Render loading screen
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Joining Game Room...</h2>
          <p className="text-sm opacity-75 mb-4">Please wait while we connect you to the game room...</p>
          <p className="text-xs opacity-50">Room Code: {roomCode}</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="min-h-screen p-4 sm:p-6 md:p-8"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      style={{
        backgroundColor: theme.colors.background,
        color: theme.colors.text
      }}
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
                  ? isMyTurn
                    ? "Your turn"
                    : `${players.find(p => p.id === currentTurn)?.username || 'Unknown'}'s turn`
                  : "Game ended"
              }
              {offlineMode && " (Offline Mode)"}
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
                onClick={forceTurnChange}
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

            {/* Offline mode button */}
            {!offlineMode && (
              <button
                onClick={enableOfflineMode}
                className="ml-2 px-3 py-1 rounded-md text-sm font-medium transition-colors duration-200"
                style={{
                  backgroundColor: '#f97316', // Orange
                  color: '#ffffff'
                }}
                title="Switch to offline mode"
              >
                Go Offline
              </button>
            )}
          </div>
        </motion.header>

        {gameMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-lg text-center font-medium"
            style={{
              backgroundColor: theme.colors.card,
              border: `2px solid ${theme.colors.border}`
            }}
          >
            {gameMessage}
          </motion.div>
        )}

        {/* WAITING ROOM - Only show if game hasn't started */}
        {waitingForPlayers && (
          <motion.div
            variants={containerVariants}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            <div
              className="rounded-xl p-6 backdrop-blur-md bg-opacity-80 shadow-lg"
              style={{
                backgroundColor: theme.colors.card,
                boxShadow: theme.effects?.cardShadow || '0 4px 6px rgba(0,0,0,0.1)',
                border: `2px solid ${theme.colors.border}`
              }}
            >
              <h2 className="text-2xl font-semibold mb-4">Waiting Room</h2>
              <p className="mb-6">
                Waiting for players to join. Share the room code with your friends to invite them.
              </p>

              <div className="mb-6">
                <h3 className="text-lg font-medium mb-2">Players</h3>
                {players.length > 0 ? (
                  <ul className="space-y-2">
                    {players.map((player, index) => (
                      <li
                        key={player.id || index}
                        className="flex justify-between items-center p-3 rounded-lg"
                        style={{
                          backgroundColor: `${theme.colors.background}80`,
                          border: `1px solid ${theme.colors.border}`
                        }}
                      >
                        <div className="flex items-center">
                          <span className="font-medium">{player.username}</span>
                          {player.username === username && <span className="ml-2 text-xs opacity-70">(You)</span>}
                          {index === 0 && <span className="ml-2 text-xs opacity-70">(Host)</span>}
                        </div>
                        <div>
                          {readyPlayers.includes(player.username) ? (
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
                ) : (
                  <p className="text-sm opacity-70">No players yet</p>
                )}
              </div>
            </div>

            <div
              className="rounded-xl p-6 backdrop-blur-md bg-opacity-80 shadow-lg flex flex-col justify-between"
              style={{
                backgroundColor: theme.colors.card,
                boxShadow: theme.effects?.cardShadow || '0 4px 6px rgba(0,0,0,0.1)',
                border: `2px solid ${theme.colors.border}`
              }}
            >
              <div>
                <h2 className="text-2xl font-semibold mb-4">Game Settings</h2>
                <p className="mb-6">
                  Get ready to play! Once all players are ready, the host can start the game.
                </p>

                <div className="mb-6">
                  <h3 className="text-lg font-medium mb-2">How to Play</h3>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>Each player gets a unique bingo card with random numbers</li>
                    <li>Players take turns marking numbers on their cards</li>
                    <li>First player to complete 5 lines (horizontal, vertical, or diagonal) wins!</li>
                  </ol>
                </div>
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

                <BingoGrid
                  grid={grid}
                  markedCells={markedCells}
                  winningLines={winningLines}
                  lastMarkedNumber={lastMarkedNumber}
                  onCellClick={handleCellClick}
                  disabled={!isMyTurn || !gameStarted}
                  theme={theme}
                />
              </div>
            </motion.div>

            <motion.div
              variants={containerVariants}
              className="order-1 lg:order-2"
            >
              <div
                className="rounded-xl p-4 sm:p-6 backdrop-blur-md bg-opacity-80 shadow-lg"
                style={{
                  backgroundColor: theme.colors.card,
                  boxShadow: theme.effects?.cardShadow || '0 4px 6px rgba(0,0,0,0.1)',
                  border: `2px solid ${theme.colors.border}`
                }}
              >
                <h2 className="text-xl font-semibold mb-4">Game Info</h2>

                <div className="mb-6">
                  <h3 className="text-lg font-medium mb-2">Players</h3>
                  <PlayerList
                    players={players}
                    currentTurn={currentTurn}
                    username={username}
                    theme={theme}
                  />
                </div>

                <div className="mb-6">
                  <h3 className="text-lg font-medium mb-2">Marked Numbers</h3>
                  <div className="flex flex-wrap gap-2">
                    {markedNumbers.map(number => (
                      <div
                        key={number}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium"
                        style={{
                          backgroundColor: number === lastMarkedNumber ? theme.colors.accent : theme.colors.primary,
                          color: '#ffffff'
                        }}
                      >
                        {number}
                      </div>
                    ))}
                    {markedNumbers.length === 0 && (
                      <p className="text-sm opacity-70">No numbers marked yet</p>
                    )}
                  </div>
                </div>

                <div className="mt-auto">
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
          </div>
        )}
      </div>

      {/* Audio elements */}
      <audio ref={audioRef} src="/sounds/game-start.mp3" preload="auto" />

      {/* Connection status indicator */}
      <ConnectionStatusIndicator />
    </motion.div>
  );
};

export default GamePage;
