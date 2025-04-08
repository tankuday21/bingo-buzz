import { io } from 'socket.io-client';

// Define possible server URLs
const SERVER_URLS = {
  production: [
    'https://bingo-buzz.up.railway.app',
    'https://bingo-buzz-server.vercel.app',
    'https://bingo-buzz-server.onrender.com'
  ],
  development: [
    'http://localhost:3001'
  ]
};

// Determine the primary server URL based on environment
const PRIMARY_SERVER_URL = process.env.NODE_ENV === 'production'
  ? SERVER_URLS.production[0] // First production server
  : SERVER_URLS.development[0]; // First development server

// Create socket instance with options
export const socket = io(PRIMARY_SERVER_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  transports: ['websocket', 'polling']
});

// Add global error handler
socket.on('error', (error) => {
  console.error('Socket error:', error);
});

// Add connection error handler to try alternative servers
let currentServerIndex = 0;
socket.on('connect_error', (error) => {
  console.error(`Connection error with server ${getCurrentServerUrl()}:`, error);

  // Try the next server if available
  const serverList = process.env.NODE_ENV === 'production' ? SERVER_URLS.production : SERVER_URLS.development;
  currentServerIndex = (currentServerIndex + 1) % serverList.length;

  if (currentServerIndex !== 0) { // If we haven't cycled through all servers yet
    const nextServerUrl = serverList[currentServerIndex];
    console.log(`Trying alternative server: ${nextServerUrl}`);

    // Disconnect from current server
    socket.disconnect();

    // Update the socket's URI
    socket.io.uri = nextServerUrl;

    // Reconnect to the new server
    socket.connect();
  }
});

// Helper function to get current server URL
function getCurrentServerUrl() {
  const serverList = process.env.NODE_ENV === 'production' ? SERVER_URLS.production : SERVER_URLS.development;
  return serverList[currentServerIndex];
}

// Log connection events in development
if (process.env.NODE_ENV !== 'production') {
  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
  });
}

export default socket;
