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
  reconnectionAttempts: 20,       // Increased to 20 for more persistent reconnection
  reconnectionDelay: 500,         // Start with a shorter delay
  reconnectionDelayMax: 2000,     // Cap the delay at 2 seconds for faster recovery
  timeout: 5000,                  // Reduced to 5000 for faster timeout detection
  autoConnect: true,
  transports: ['websocket', 'polling'],
  path: '/socket.io/',
  withCredentials: true,
  forceNew: false,                // Don't force a new connection on reconnect
  multiplex: true,                // Allow multiplexing
  pingInterval: 5000,             // Send pings more frequently
  pingTimeout: 10000              // Wait longer for pong responses
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

// Connection health check with improved reliability
let reconnectAttempts = 0;
let lastPingTime = Date.now();
let lastPongTime = Date.now();
const MAX_RECONNECT_ATTEMPTS = 10; // Increased from 5 to 10

// Listen for pong responses
socket.on('pong', () => {
  lastPongTime = Date.now();
  reconnectAttempts = 0; // Reset reconnect attempts on successful pong
});

// More frequent health check (5 seconds instead of 10)
const healthCheck = setInterval(() => {
  const now = Date.now();

  if (socket.connected) {
    // Send ping to check connection
    socket.emit('ping');
    lastPingTime = now;

    // Check if we've received a pong recently
    if (now - lastPongTime > 15000) { // No pong for 15 seconds (reduced from 20)
      console.warn('No pong received for 15 seconds, forcing reconnection');

      // Force a complete reconnection
      try {
        // First try to refresh the connection without disconnecting
        socket.io.engine.close();
        socket.io.engine.open();
        console.log('Socket connection refreshed');

        // If that doesn't work, try a full disconnect/reconnect
        setTimeout(() => {
          if (!socket.connected) {
            socket.disconnect();
            setTimeout(() => {
              socket.connect();
              console.log('Socket reconnection attempted after disconnect');
            }, 500);
          }
        }, 1000);
      } catch (e) {
        console.error('Error during forced reconnection:', e);
        // Last resort - try to reconnect directly
        try {
          socket.connect();
        } catch (e2) {
          console.error('Failed even direct reconnection:', e2);
        }
      }
    }

    reconnectAttempts = 0; // Reset reconnect attempts when connected
  } else {
    reconnectAttempts++;
    console.warn(`Socket disconnected. Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

    if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
      // Try to reconnect with exponential backoff
      if (!socket.connected && !socket.connecting) {
        try {
          socket.connect();
          console.log('Socket reconnection attempted');
        } catch (e) {
          console.error('Error during reconnection attempt:', e);
        }
      }
    } else {
      // Don't clear the interval, just show an error and reset the counter
      toast('Connection issues detected. Trying to reconnect...', {
        icon: '🔄',
        duration: 3000
      });
      reconnectAttempts = Math.floor(MAX_RECONNECT_ATTEMPTS / 2); // Reset to half to keep trying

      // Force a complete reconnection
      try {
        // Try to reset the socket completely
        socket.io.engine.close();
        setTimeout(() => {
          socket.io.engine.open();
          console.log('Socket engine reopened after max attempts');
        }, 500);
      } catch (e) {
        console.error('Error during engine reset:', e);
        // Fall back to disconnect/connect
        try {
          socket.disconnect();
          setTimeout(() => {
            socket.connect();
            console.log('Socket reconnection attempted after max attempts');
          }, 500);
        } catch (e2) {
          console.error('Error during forced reconnection after max attempts:', e2);
        }
      }
    }
  }
}, 5000);

// Clean up on unmount
window.addEventListener('beforeunload', () => {
  clearInterval(healthCheck);
  socket.disconnect();
});

export default socket;
