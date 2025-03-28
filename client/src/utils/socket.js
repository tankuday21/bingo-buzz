import { io } from 'socket.io-client';
import { toast } from 'react-hot-toast';

// Add DEBUG flag to control logging
const DEBUG = false;

// Get server URL from environment or use default
const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://bingo-buzz-server.vercel.app';

// Configure socket with optimized settings
const socket = io(SERVER_URL, {
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 10000,
  autoConnect: true,
  transports: ['websocket', 'polling']
});

// Add optimized event listeners with reduced logging
socket.on('connect', () => {
  if (DEBUG) console.log('Socket connected, ID:', socket.id);
  toast.success('Connected to game server');
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error.message);
});

socket.on('disconnect', (reason) => {
  if (DEBUG) console.log('Socket disconnected:', reason);
  
  // Handle different disconnect reasons
  if (reason === 'io server disconnect') {
    // Server initiated disconnect, try reconnecting
    socket.connect();
  } else if (reason === 'transport close' || reason === 'ping timeout') {
    toast.error('Connection lost. Attempting to reconnect...');
  } else {
    toast.error('Disconnected from server. Please refresh the page.');
  }
});

socket.on('reconnect', (attemptNumber) => {
  console.log('Socket reconnected after', attemptNumber, 'attempts. New Socket ID:', socket.id);
  toast.success('Reconnected to game server');
});

socket.on('reconnect_attempt', (attemptNumber) => {
  console.log('Attempting to reconnect:', attemptNumber, 'of', 5);
  
  // Update auth data on reconnect attempt
  socket.auth = {
    timestamp: Date.now()
  };
});

socket.on('reconnect_error', (error) => {
  console.error('Reconnection error:', error);
  toast.error('Unable to reconnect. Please refresh the page.');
});

socket.on('reconnect_failed', () => {
  console.error('Failed to reconnect after 5 attempts');
  toast.error('Connection failed. Please refresh the page.');
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
  toast.error('Connection error. Please refresh the page.');
});

// Connection health check
const healthCheck = setInterval(() => {
  if (socket.connected) {
    socket.emit('ping');
  } else {
    clearInterval(healthCheck);
    toast.error('Connection lost. Please refresh the page.');
  }
}, 25000);

// Clean up on unmount
window.addEventListener('beforeunload', () => {
  clearInterval(healthCheck);
  socket.disconnect();
});

export default socket;
