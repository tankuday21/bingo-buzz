import React from 'react';
import { motion } from 'framer-motion';

const PlayerList = ({ players, currentTurn, username, theme }) => {
  // Animation variants
  const listVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };
  
  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  };
  
  return (
    <motion.ul 
      className="space-y-2"
      variants={listVariants}
      initial="hidden"
      animate="visible"
    >
      {players.map((player, index) => (
        <motion.li
          key={player.id || index}
          variants={itemVariants}
          className="flex justify-between items-center p-3 rounded-lg"
          style={{
            backgroundColor: player.id === currentTurn 
              ? `${theme.colors.primary}20` 
              : `${theme.colors.background}80`,
            border: `1px solid ${player.id === currentTurn 
              ? theme.colors.primary 
              : theme.colors.border}`
          }}
        >
          <div className="flex items-center">
            <span className="font-medium">{player.username}</span>
            {player.username === username && (
              <span className="ml-2 text-xs opacity-70">(You)</span>
            )}
            {index === 0 && (
              <span className="ml-2 text-xs opacity-70">(Host)</span>
            )}
          </div>
          
          {player.id === currentTurn && (
            <div 
              className="px-2 py-1 text-xs rounded-full"
              style={{ 
                backgroundColor: theme.colors.primary,
                color: '#ffffff'
              }}
            >
              Current Turn
            </div>
          )}
        </motion.li>
      ))}
      
      {players.length === 0 && (
        <motion.p 
          variants={itemVariants}
          className="text-sm opacity-70 text-center p-4"
        >
          No players yet
        </motion.p>
      )}
    </motion.ul>
  );
};

export default PlayerList;
