import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const NotFoundPage = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gradient-to-r from-primary-600 to-accent-600 p-4 text-white">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-3xl font-bold">Bingo Buzz</h1>
          <div>
            <Link to="/" className="hover:underline">Home</Link>
          </div>
        </div>
      </header>
      
      <main className="flex-1 container mx-auto px-4 py-8 flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-8xl font-bold mb-4 text-primary-600">404</h2>
          <h3 className="text-3xl font-bold mb-6">Page Not Found</h3>
          <p className="text-xl mb-8">Oops! The page you're looking for doesn't exist.</p>
          
          <Link 
            to="/" 
            className="inline-block px-6 py-3 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700 transition-colors"
          >
            Go Home
          </Link>
        </motion.div>
      </main>
      
      <footer className="bg-gray-100 p-4 text-center">
        <p>&copy; {new Date().getFullYear()} Bingo Buzz. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default NotFoundPage;
