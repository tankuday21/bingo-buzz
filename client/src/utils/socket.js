import io from 'socket.io-client';

// Remove any trailing slashes from the URL
const baseUrl = (process.env.REACT_APP_SERVER_URL || 'https://bingo-buzz.up.railway.app').replace(/\/$/, '');
const SOCKET_URL = baseUrl;

const socket = io(SOCKET_URL, {
  transports: ['websocket'],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

export default socket;
