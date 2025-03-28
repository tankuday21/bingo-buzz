# Bingo Buzz 🎮

A real-time multiplayer Bingo game built with React, Node.js, and Socket.IO.

## Features

- Real-time multiplayer gameplay
- Unique bingo boards for each player
- Turn-based system with timer
- Automatic number marking
- Leaderboard system
- Multiple themes and symbol options
- Responsive design

## Tech Stack

### Frontend
- React
- Socket.IO Client
- Framer Motion
- TailwindCSS
- React Router
- React Hot Toast

### Backend
- Node.js
- Express
- Socket.IO
- MongoDB
- Mongoose

## Deployment

### Prerequisites
- Node.js 14+
- MongoDB database
- Railway account (for backend)
- Vercel account (for frontend)

### Environment Variables

#### Backend (.env)
```
PORT=5000
CLIENT_URL=https://your-frontend-url.vercel.app
MONGODB_URI=your_mongodb_connection_string
NODE_ENV=production
```

#### Frontend (.env)
```
REACT_APP_SERVER_URL=https://your-backend-url.railway.app
```

### Deployment Steps

1. **Backend (Railway)**
   - Push code to GitHub
   - Create new project in Railway
   - Connect to GitHub repository
   - Add environment variables
   - Deploy

2. **Frontend (Vercel)**
   - Push code to GitHub
   - Create new project in Vercel
   - Connect to GitHub repository
   - Add environment variables
   - Deploy

## Local Development

1. Clone the repository:
```bash
git clone https://github.com/yourusername/bingo-buzz.git
cd bingo-buzz
```

2. Install dependencies:
```bash
# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install
```

3. Set up environment variables:
   - Create `.env` file in server directory
   - Create `.env` file in client directory

4. Start the development servers:
```bash
# Start backend server
cd server
npm start

# Start frontend development server
cd ../client
npm start
```

## License

MIT

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.
