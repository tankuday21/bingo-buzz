import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import BingoGameEngine from '../utils/gameEngine';
import { toast } from 'react-hot-toast';

// Create context
const GameEngineContext = createContext(null);

// Custom hook to use the game engine
export const useGameEngine = () => {
  const context = useContext(GameEngineContext);
  if (!context) {
    throw new Error('useGameEngine must be used within a GameEngineProvider');
  }
  return context;
};

// Game Engine Provider component
export const GameEngineProvider = ({ children, socket, roomCode, username }) => {
  // Create a ref for the game engine to persist across renders
  const gameEngineRef = useRef(null);
  
  // State to trigger re-renders when game state changes
  const [gameState, setGameState] = useState({
    grid: [],
    players: [],
    markedNumbers: [],
    markedCells: [],
    currentTurn: null,
    gameStarted: false,
    winner: null,
    winningLines: [],
    isMyTurn: false,
    offlineMode: false
  });
  
  // State for connection status
  const [connectionStatus, setConnectionStatus] = useState({
    connected: socket.connected,
    lastActivity: Date.now(),
    reconnectAttempts: 0
  });
  
  // Initialize game engine
  useEffect(() => {
    console.log('[GameEngineProvider] Initializing game engine');
    
    // Create game engine instance
    gameEngineRef.current = new BingoGameEngine();
    
    // Set local player ID
    gameEngineRef.current.setLocalPlayerId(socket.id);
    
    // Set up callbacks
    gameEngineRef.current.onStateChange = (newState) => {
      console.log('[GameEngineProvider] Game state changed:', newState);
      setGameState(newState);
    };
    
    gameEngineRef.current.onTurnChange = (turnData) => {
      console.log('[GameEngineProvider] Turn changed:', turnData);
      
      // Update UI based on whose turn it is
      if (turnData.isMyTurn) {
        toast.success('Your turn!');
      } else {
        const playerName = turnData.player?.username || 'Unknown';
        toast(`${playerName}'s turn`);
      }
      
      // Try to notify server about turn change
      if (socket.connected && turnData.isMyTurn) {
        try {
          socket.emit('end-turn', { roomCode });
        } catch (e) {
          console.error('[GameEngineProvider] Error notifying server about turn change:', e);
        }
      }
    };
    
    gameEngineRef.current.onNumberMarked = (markData) => {
      console.log('[GameEngineProvider] Number marked:', markData);
      
      // Try to notify server about marked number
      if (socket.connected && markData.markedBy === socket.id) {
        try {
          socket.emit('mark-number', {
            roomCode,
            number: markData.number
          });
        } catch (e) {
          console.error('[GameEngineProvider] Error notifying server about marked number:', e);
        }
      }
    };
    
    gameEngineRef.current.onGameWon = (winData) => {
      console.log('[GameEngineProvider] Game won:', winData);
      toast.success(`${winData.player?.username || 'You'} won the game!`);
    };
    
    gameEngineRef.current.onError = (errorMsg) => {
      console.error('[GameEngineProvider] Game engine error:', errorMsg);
      toast.error(errorMsg);
    };
    
    return () => {
      // Clean up
      gameEngineRef.current = null;
    };
  }, [socket.id, roomCode]);
  
  // Set up socket event listeners
  useEffect(() => {
    if (!socket || !gameEngineRef.current) return;
    
    console.log('[GameEngineProvider] Setting up socket event listeners');
    
    // Update connection status when socket connects/disconnects
    const handleConnect = () => {
      console.log('[GameEngineProvider] Socket connected');
      setConnectionStatus(prev => ({
        ...prev,
        connected: true,
        lastActivity: Date.now()
      }));
      
      // Request game state from server
      socket.emit('request-game-state', { roomCode });
    };
    
    const handleDisconnect = () => {
      console.log('[GameEngineProvider] Socket disconnected');
      setConnectionStatus(prev => ({
        ...prev,
        connected: false,
        reconnectAttempts: prev.reconnectAttempts + 1
      }));
      
      // If we've tried to reconnect multiple times, enable offline mode
      if (connectionStatus.reconnectAttempts >= 2) {
        console.log('[GameEngineProvider] Multiple reconnect attempts failed, enabling offline mode');
        gameEngineRef.current.enableOfflineMode();
        toast.error('Connection lost. Continuing in offline mode.');
      }
    };
    
    // Handle game state updates from server
    const handleGameState = (data) => {
      console.log('[GameEngineProvider] Received game state from server:', data);
      gameEngineRef.current.updateFromServer(data);
    };
    
    // Handle grid assignment
    const handleGridAssigned = (grid) => {
      console.log('[GameEngineProvider] Grid assigned:', grid);
      gameEngineRef.current.updateFromServer({ grid });
    };
    
    // Handle number marked
    const handleNumberMarked = (data) => {
      console.log('[GameEngineProvider] Number marked event:', data);
      
      // Update marked numbers in game engine
      if (gameEngineRef.current) {
        const { number, markedBy } = data;
        
        // Only process if it's not marked by the local player (to avoid duplicates)
        if (markedBy !== socket.id) {
          // Find cell index
          const cellIndex = gameEngineRef.current.findCellIndex(number);
          
          // Update game state
          gameEngineRef.current.markedNumbers.add(number);
          if (cellIndex !== -1) {
            gameEngineRef.current.markedCells.add(cellIndex);
          }
          
          // Notify state change
          gameEngineRef.current.notifyStateChange();
        }
      }
    };
    
    // Handle turn changed
    const handleTurnChanged = (data) => {
      console.log('[GameEngineProvider] Turn changed event:', data);
      
      // Update current turn in game engine
      if (gameEngineRef.current) {
        const newCurrentTurn = data.currentTurn || data.playerId;
        
        // Only update if it's different
        if (newCurrentTurn && newCurrentTurn !== gameEngineRef.current.currentTurn) {
          gameEngineRef.current.currentTurn = newCurrentTurn;
          gameEngineRef.current.lastTurnChangeTime = Date.now();
          
          // Find player index
          const playerIndex = gameEngineRef.current.players.findIndex(p => p.id === newCurrentTurn);
          if (playerIndex !== -1) {
            gameEngineRef.current.turnIndex = playerIndex;
          }
          
          // Notify state change
          gameEngineRef.current.notifyStateChange();
        }
      }
    };
    
    // Handle game won
    const handleGameWon = (data) => {
      console.log('[GameEngineProvider] Game won event:', data);
      
      // Update game state in game engine
      if (gameEngineRef.current) {
        gameEngineRef.current.winner = data.player;
        gameEngineRef.current.winningLines = data.lines || [];
        gameEngineRef.current.gameStarted = false;
        
        // Notify state change
        gameEngineRef.current.notifyStateChange();
      }
    };
    
    // Handle game started
    const handleGameStarted = (data) => {
      console.log('[GameEngineProvider] Game started event:', data);
      
      // Update game state in game engine
      if (gameEngineRef.current) {
        gameEngineRef.current.gameStarted = true;
        
        // Update grid if provided
        if (data.grid) {
          gameEngineRef.current.grid = data.grid;
        }
        
        // Update current turn if provided
        if (data.currentTurn) {
          gameEngineRef.current.currentTurn = data.currentTurn;
          
          // Find player index
          const playerIndex = gameEngineRef.current.players.findIndex(p => p.id === data.currentTurn);
          if (playerIndex !== -1) {
            gameEngineRef.current.turnIndex = playerIndex;
          }
        }
        
        // Update players if provided
        if (data.players) {
          gameEngineRef.current.players = data.players;
        }
        
        // Notify state change
        gameEngineRef.current.notifyStateChange();
      }
    };
    
    // Handle player joined
    const handlePlayerJoined = (data) => {
      console.log('[GameEngineProvider] Player joined event:', data);
      
      // Update players in game engine
      if (gameEngineRef.current) {
        const updatedPlayers = Array.isArray(data) ? data : data.players;
        
        if (Array.isArray(updatedPlayers)) {
          gameEngineRef.current.players = updatedPlayers;
          gameEngineRef.current.notifyStateChange();
        }
      }
    };
    
    // Handle player left
    const handlePlayerLeft = (data) => {
      console.log('[GameEngineProvider] Player left event:', data);
      
      // Update players in game engine
      if (gameEngineRef.current) {
        const updatedPlayers = Array.isArray(data) ? data : data.players;
        
        if (Array.isArray(updatedPlayers)) {
          gameEngineRef.current.players = updatedPlayers;
          gameEngineRef.current.notifyStateChange();
        }
      }
    };
    
    // Set up listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('game-state', handleGameState);
    socket.on('assign-grid', handleGridAssigned);
    socket.on('number-marked', handleNumberMarked);
    socket.on('turn-changed', handleTurnChanged);
    socket.on('game-won', handleGameWon);
    socket.on('game-started', handleGameStarted);
    socket.on('player-joined', handlePlayerJoined);
    socket.on('player-left', handlePlayerLeft);
    
    // Set up ping/pong for connection monitoring
    const pingInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('ping');
        setConnectionStatus(prev => ({
          ...prev,
          lastActivity: Date.now()
        }));
      }
    }, 5000);
    
    // Set up game state check
    const gameStateCheckInterval = setInterval(() => {
      if (!gameEngineRef.current) return;
      
      const now = Date.now();
      const lastTurnTime = gameEngineRef.current.lastTurnChangeTime;
      
      // If it's been more than 20 seconds since the last turn change
      if (now - lastTurnTime > 20000 && gameEngineRef.current.gameStarted) {
        console.warn('[GameEngineProvider] Game appears to be stuck. Forcing turn change...');
        
        // Force a turn change
        gameEngineRef.current.forceTurnChange();
        
        // If we're not connected to the server, enable offline mode
        if (!socket.connected) {
          gameEngineRef.current.enableOfflineMode();
          toast.error('Connection lost. Continuing in offline mode.');
        }
      }
    }, 10000);
    
    // Clean up
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('game-state', handleGameState);
      socket.off('assign-grid', handleGridAssigned);
      socket.off('number-marked', handleNumberMarked);
      socket.off('turn-changed', handleTurnChanged);
      socket.off('game-won', handleGameWon);
      socket.off('game-started', handleGameStarted);
      socket.off('player-joined', handlePlayerJoined);
      socket.off('player-left', handlePlayerLeft);
      
      clearInterval(pingInterval);
      clearInterval(gameStateCheckInterval);
    };
  }, [socket, roomCode, connectionStatus.reconnectAttempts]);
  
  // Expose game engine methods and state
  const value = {
    // Game state
    ...gameState,
    
    // Connection status
    connectionStatus,
    
    // Methods
    markNumber: (number) => {
      if (gameEngineRef.current) {
        return gameEngineRef.current.markNumber(number);
      }
      return false;
    },
    
    forceTurnChange: () => {
      if (gameEngineRef.current) {
        gameEngineRef.current.forceTurnChange();
      }
    },
    
    enableOfflineMode: () => {
      if (gameEngineRef.current) {
        gameEngineRef.current.enableOfflineMode();
        toast.error('Switched to offline mode. You can continue playing locally.');
      }
    },
    
    requestGameState: () => {
      if (socket.connected) {
        socket.emit('request-game-state', { roomCode });
        toast('Requesting game state from server...');
      } else {
        toast.error('Cannot request game state: not connected to server');
      }
    }
  };
  
  return (
    <GameEngineContext.Provider value={value}>
      {children}
    </GameEngineContext.Provider>
  );
};

export default GameEngineProvider;
