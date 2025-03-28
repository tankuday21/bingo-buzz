import io from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_SERVER_URL || 'https://bingo-buzz.up.railway.app';

const socket = io(SOCKET_URL, {
  transports: ['websocket'],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

export default socket;
