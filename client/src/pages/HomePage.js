import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { ThemeContext } from '../context/ThemeContext';
import ThemeSwitcher from '../components/ThemeSwitcher';
import socket from '../utils/socket';

const HomePage = () => {
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [roomCode, setRoomCode] = useState('');
  const [gridSize, setGridSize] = useState('5x5');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const { theme } = useContext(ThemeContext);

  const navigate = useNavigate();

  // Helper function to join a room and navigate to the game page
  const joinRoomAndNavigate = (roomCode, username) => {
    console.log('Joining room and navigating:', roomCode, username);

    // Clear any previous listeners to avoid duplicates
    socket.off('joined-room');
    socket.off('join-error');

    // Set up listener for room join confirmation
    socket.once('joined-room', (data) => {
      console.log('Successfully joined room:', data);
      navigate(`/game/${roomCode}`);
    });

    // Handle join errors
    socket.once('join-error', (error) => {
      console.error('Error joining room:', error);
      toast.error(`Error joining room: ${error.message || error}`);
      setIsCreating(false);
      setIsJoining(false);
    });

    // Emit join room event
    socket.emit('join-room', { roomCode, username });

    // Set a timeout in case socket events don't fire
    setTimeout(() => {
      console.log('Navigating to game room (timeout fallback):', roomCode);
      navigate(`/game/${roomCode}`);
    }, 3000);
  };

  // Save username to localStorage
  const saveUsername = (name) => {
    setUsername(name);
    localStorage.setItem('username', name);
  };

  // Handle creating a new game
  const handleCreateGame = async () => {
    if (!username) {
      toast.error('Please enter a username');
      return;
    }

    try {
      setIsCreating(true);
      console.log('Creating game with grid size:', gridSize);

      // Add more verbose logging
      console.log('Sending request to:', '/api/games');
      console.log('Request payload:', { username, gridSize });

      // Get server URL from environment variable
      const baseUrl = process.env.REACT_APP_SERVER_URL?.replace(/\/+$/, ''); // Remove trailing slashes
      if (!baseUrl) {
        throw new Error('Server URL not configured. Please set REACT_APP_SERVER_URL in .env');
      }

      console.log('Using API URL:', baseUrl);

      const response = await axios.post(`${baseUrl}/api/games`, {
        username,
        gridSize
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        withCredentials: true
      });

      console.log('Create room response:', response.data);

      if (!response.data || !response.data.roomCode) {
        throw new Error('Invalid server response - no room code received');
      }

      const { roomCode } = response.data;

      // Save username
      saveUsername(username);

      // Save username and room code to localStorage for recovery
      saveUsername(username);
      localStorage.setItem('lastRoomCode', roomCode);

      // Make sure socket is connected before joining
      if (!socket.connected) {
        console.log('Socket not connected, attempting to connect...');
        socket.connect();

        // Wait for connection before proceeding
        socket.once('connect', () => {
          joinRoomAndNavigate(roomCode, username);
        });

        // Handle connection error
        socket.once('connect_error', (error) => {
          console.error('Socket connection error:', error);
          toast.error(`Connection error: ${error.message}. Try again.`);
          setIsCreating(false);
        });
      } else {
        // Socket already connected, proceed with join
        joinRoomAndNavigate(roomCode, username);
      }

    } catch (error) {
      console.error('Error creating game:', error);
      toast.error(error.response?.data?.error || error.message || 'Failed to create game');
      setIsCreating(false);
    }
  };

  // Handle joining an existing game
  const handleJoinGame = async () => {
    if (!username) {
      toast.error('Please enter a username');
      return;
    }

    if (!roomCode) {
      toast.error('Please enter a room code');
      return;
    }

    console.log(`Attempting to join room ${roomCode} as ${username}`);

    // Save username and room code to localStorage for recovery
    saveUsername(username);
    localStorage.setItem('lastRoomCode', roomCode);

    // Make sure socket is connected before joining
    if (!socket.connected) {
      console.log('Socket not connected, attempting to connect...');
      socket.connect();

      // Wait for connection before proceeding
      socket.once('connect', () => {
        joinRoomAndNavigate(roomCode, username);
      });

      // Handle connection error
      socket.once('connect_error', (error) => {
        console.error('Socket connection error:', error);
        toast.error(`Connection error: ${error.message}. Try again.`);
        setIsJoining(false);
      });
    } else {
      // Socket already connected, proceed with join
      joinRoomAndNavigate(roomCode, username);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary-100 to-accent-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-gradient-to-r from-primary-600 to-accent-600 p-4 text-white">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-3xl font-bold">Bingo Buzz</h1>
          <ThemeSwitcher />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container mx-auto p-4 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">
            <h2 className="text-2xl font-bold mb-6 text-center dark:text-white">
              Welcome to Bingo Buzz
            </h2>

            {/* Username input */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2 dark:text-gray-300">
                Your Name
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => saveUsername(e.target.value)}
                placeholder="Enter your name"
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>

            {/* Grid size selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2 dark:text-gray-300">
                Grid Size
              </label>
              <select
                value={gridSize}
                onChange={(e) => setGridSize(e.target.value)}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                <option value="5x5">5x5</option>
                <option value="6x6">6x6</option>
                <option value="7x7">7x7</option>
                <option value="8x8">8x8</option>
              </select>
            </div>

            {/* Create game button */}
            <button
              onClick={handleCreateGame}
              disabled={isCreating}
              className="w-full bg-primary-600 text-white py-3 rounded-lg font-medium mb-4 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Create New Game'}
            </button>

            {/* Join game section */}
            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Or join an existing game
              </p>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="Enter room code"
                  className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <button
                  onClick={handleJoinGame}
                  disabled={isJoining || !roomCode}
                  className="px-6 py-3 bg-accent-600 text-white rounded-lg font-medium hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:opacity-50"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-100 p-4 text-center">
        <p>&copy; {new Date().getFullYear()} Bingo Buzz. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default HomePage;
