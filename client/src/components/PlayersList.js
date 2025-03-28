import React from 'react';
import { motion } from 'framer-motion';

const PlayersList = ({ players, currentTurn }) => {
  if (!players || players.length === 0) {
    return <p className="text-gray-500">No players have joined yet.</p>;
  }

  return (
    <div className="space-y-2">
      {players.map((player, index) => (
        <motion.div
          key={player.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className={`
            flex items-center justify-between 
            p-2 rounded-md
            ${currentTurn === player.id ? 'bg-primary-100 border-l-4 border-primary-500' : 'bg-gray-50'}
          `}
        >
          <div className="flex items-center">
            <div className={`
              w-8 h-8 rounded-full flex items-center justify-center 
              mr-2 text-white font-bold
              ${index === 0 ? 'bg-yellow-500' : 'bg-gray-500'}
            `}>
              {index === 0 ? '👑' : (index + 1)}
            </div>
            <span className={`font-medium ${currentTurn === player.id ? 'text-primary-700 font-bold' : ''}`}>
              {player.username}
              {index === 0 && <span className="text-xs ml-1 text-gray-500">(host)</span>}
            </span>
          </div>
          
          {player.score > 0 && (
            <span className="bg-accent-100 text-accent-800 px-2 py-1 rounded text-xs font-bold">
              {player.score} pts
            </span>
          )}
          
          {currentTurn === player.id && (
            <div className="w-3 h-3 rounded-full bg-primary-500 animate-pulse"></div>
          )}
        </motion.div>
      ))}
    </div>
  );
};

export default PlayersList;
