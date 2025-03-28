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
      
      // Use absolute URL to avoid proxy issues
      const apiUrl = 'http://localhost:5000/api/games';
      console.log('Using absolute API URL:', apiUrl);
      
      const response = await axios.post(apiUrl, { 
        username, 
        gridSize 
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Create room response:', response.data);
      
      if (!response.data || !response.data.roomCode) {
        throw new Error('Invalid server response - no room code received');
      }
      
      const { roomCode } = response.data;
      
      // Save username 
      saveUsername(username);
      
      // Important: Join the room after creating it
      console.log('Joining room after creation:', roomCode);
      socket.emit('join-room', { roomCode, username });
      
      // Set up listener for room join confirmation
      socket.once('joined-room', (data) => {
        console.log('Successfully joined room after creation:', data);
        navigate(`/game/${roomCode}`);
      });
      
      // Handle join errors
      socket.once('join-error', (error) => {
        console.error('Error joining room after creation:', error);
        toast.error(`Error joining room: ${error.message || error}`);
        setIsCreating(false);
      });
      
      // Set a timeout in case socket events don't fire
      setTimeout(() => {
        console.log('Navigating to game room (timeout fallback):', roomCode);
        navigate(`/game/${roomCode}`);
      }, 3000);
      
    } catch (error) {
      console.error('Error creating game:', error);
      
      // Detailed error logging
      if (error.response) {
        console.error('Server response error:', {
          status: error.response.status,
          data: error.response.data,
          headers: error.response.headers
        });
        toast.error(`Failed to create game: ${error.response.data?.error || 'Server error'}`);
      } else if (error.request) {
        console.error('No response received:', error.request);
        toast.error('Server not responding. Please check if the server is running.');
      } else {
        console.error('Request setup error:', error.message);
        toast.error(`Error: ${error.message || 'Failed to create game. Please try again.'}`);
      }
      
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
    
    try {
      setIsJoining(true);
      // Use absolute URL to avoid proxy issues
      const apiUrl = 'http://localhost:5000/api/join-room';
      console.log('Using absolute API URL for joining:', apiUrl);
      
      await axios.post(apiUrl, { roomCode });
      
      // Save username and navigate to game page
      saveUsername(username);
      navigate(`/game/${roomCode}`);
    } catch (error) {
      console.error('Error joining game:', error);
      
      if (error.response && error.response.status === 404) {
        toast.error('Room not found. Please check the code and try again.');
      } else if (error.response && error.response.status === 400) {
        toast.error('Game already in progress. Cannot join now.');
      } else {
        toast.error('Failed to join game. Please try again.');
      }
    } finally {
      setIsJoining(false);
    }
  };
  
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-gradient-to-r from-primary-600 to-accent-600 p-4 text-white">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-3xl font-bold">Bingo Buzz</h1>
          <div className="flex items-center space-x-4">
            <a href="/leaderboard" className="hover:underline">Leaderboard</a>
            <ThemeSwitcher />
          </div>
        </div>
      </header>
      
      {/* Main content */}
      <main className="flex-1 container mx-auto px-4 py-8 flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <h2 className="text-4xl font-bold mb-2">Welcome to Bingo Buzz!</h2>
          <p className="text-xl">A real-time multiplayer Bingo game</p>
        </motion.div>
        
        {/* Username input */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="w-full max-w-md mb-8"
        >
          <label htmlFor="username" className="block text-lg font-medium mb-2">Your Name</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your name"
            className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            required
          />
        </motion.div>
        
        {/* Create Game section */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg mb-8"
        >
          <h3 className="text-2xl font-bold mb-4">Create New Game</h3>
          
          <div className="mb-4">
            <label htmlFor="gridSize" className="block text-lg font-medium mb-2">Grid Size</label>
            <select
              id="gridSize"
              value={gridSize}
              onChange={(e) => setGridSize(e.target.value)}
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="5x5">5x5</option>
              <option value="6x6">6x6</option>
              <option value="7x7">7x7</option>
              <option value="8x8">8x8</option>
            </select>
          </div>
          
          <button
            onClick={handleCreateGame}
            disabled={isCreating}
            className="w-full py-3 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
          >
            {isCreating ? 'Creating...' : 'Create Game'}
          </button>
        </motion.div>
        
        {/* Join Game section */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg"
        >
          <h3 className="text-2xl font-bold mb-4">Join Existing Game</h3>
          
          <div className="mb-4">
            <label htmlFor="roomCode" className="block text-lg font-medium mb-2">Room Code</label>
            <input
              type="text"
              id="roomCode"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="Enter room code"
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 uppercase"
              maxLength={6}
            />
          </div>
          
          <button
            onClick={handleJoinGame}
            disabled={isJoining}
            className="w-full py-3 bg-accent-600 text-white font-bold rounded-lg hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-500 transition-colors"
          >
            {isJoining ? 'Joining...' : 'Join Game'}
          </button>
        </motion.div>
      </main>
      
      {/* Footer */}
      <footer className="bg-gray-100 p-4 text-center">
        <p>&copy; {new Date().getFullYear()} Bingo Buzz. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default HomePage;
