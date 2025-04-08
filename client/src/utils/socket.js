import { io } from 'socket.io-client';
import { toast } from 'react-hot-toast';

// DEBUG flag to control logging (set to false in production)
const DEBUG = false;

// Get server URL from environment
const SERVER_URL = process.env.REACT_APP_SERVER_URL;

if (!SERVER_URL) {
  console.error('Server URL not configured. Please set REACT_APP_SERVER_URL in .env');
  toast.error('Server configuration error. Please check console.');
}

// Only log server connection in debug mode
if (DEBUG) {
  console.log('Connecting to server:', SERVER_URL);
}

// Configure socket with optimized settings
const socket = io(SERVER_URL, {
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 20000,
  autoConnect: true,
  transports: ['websocket', 'polling'],
  path: '/socket.io/',
  withCredentials: true
});

// Connection event handlers
socket.on('connect', () => {
  if (DEBUG) {
    console.log('Socket connected successfully, ID:', socket.id);
  }
  toast.success('Connected to game server');
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
  toast.error(`Connection error: ${error.message}`);
});

socket.on('disconnect', (reason) => {
  if (DEBUG) {
    console.log('Socket disconnected:', reason);
  }
  if (reason === 'io server disconnect') {
    // Server initiated disconnect, try to reconnect
    socket.connect();
  }

  // Only show toast for certain disconnect reasons to avoid spamming the user
  if (reason !== 'transport close' && reason !== 'ping timeout') {
    toast.error('Disconnected from server');
  }

  // Attempt to reconnect automatically for temporary disconnects
  if (reason === 'transport close' || reason === 'ping timeout') {
    setTimeout(() => {
      if (!socket.connected) {
        socket.connect();
      }
    }, 2000);
  }
});

socket.on('reconnect', (attemptNumber) => {
  if (DEBUG) {
    console.log('Socket reconnected after', attemptNumber, 'attempts');
  }
  toast.success('Reconnected to server');
});

socket.on('reconnect_error', (error) => {
  console.error('Socket reconnection error:', error);
  toast.error('Failed to reconnect');
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
  toast.error(`Socket error: ${error.message}`);
});

// Connection health check
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const healthCheck = setInterval(() => {
  if (socket.connected) {
    socket.emit('ping');
    reconnectAttempts = 0; // Reset reconnect attempts when connected
  } else {
    reconnectAttempts++;
    if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
      // Try to reconnect
      socket.connect();
    } else {
      clearInterval(healthCheck);
      toast.error('Connection lost. Please refresh the page.');
    }
  }
}, 25000);

// Clean up on unmount
window.addEventListener('beforeunload', () => {
  clearInterval(healthCheck);
  socket.disconnect();
});

export default socket;
