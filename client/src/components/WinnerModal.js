import React from 'react';
import { motion } from 'framer-motion';

const WinnerModal = ({ winner, onClose, onExitGame }) => {
  if (!winner) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 20 }}
        transition={{ type: 'spring', damping: 15 }}
        className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking on the modal itself
      >
        <div className="mb-6">
          <div className="w-24 h-24 mx-auto bg-accent-100 rounded-full flex items-center justify-center">
            <span className="text-4xl">🏆</span>
          </div>
        </div>
        
        <h2 className="text-3xl font-bold mb-2 text-accent-600">Winner!</h2>
        <p className="text-xl mb-4 font-bold">{winner.username}</p>
        
        {winner.score && (
          <div className="mb-6">
            <p className="text-lg">Score: <span className="font-bold text-accent-600">{winner.score} points</span></p>
          </div>
        )}
        
        <div className="flex flex-col space-y-3">
          <button
            onClick={onExitGame}
            className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            Exit to Home
          </button>
          
          <button
            onClick={onClose}
            className="bg-accent-500 hover:bg-accent-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            Continue Spectating
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default WinnerModal;
