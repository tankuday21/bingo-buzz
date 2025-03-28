import React, { useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThemeContext } from '../context/ThemeContext';

const PlayersList = ({ players, currentTurn }) => {
  const { theme } = useContext(ThemeContext);

  const playerVariants = {
    initial: { 
      opacity: 0, 
      x: -20 
    },
    animate: { 
      opacity: 1, 
      x: 0,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 25
      }
    },
    exit: { 
      opacity: 0, 
      x: 20,
      transition: {
        duration: 0.2
      }
    }
  };

  const getStatusColor = (player) => {
    if (player.id === currentTurn) {
      return theme.colors.primary[500];
    }
    if (player.status === 'disconnected') {
      return theme.colors.primary[300];
    }
    return theme.colors.text;
  };

  return (
    <div className="space-y-2">
      <AnimatePresence>
        {players.map((player, index) => (
          <motion.div
            key={player.id}
            variants={playerVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex items-center justify-between p-2 rounded-lg"
            style={{
              background: player.id === currentTurn ? theme.colors.primary[50] : 'transparent',
              border: `1px solid ${theme.colors.border}`,
              boxShadow: player.id === currentTurn ? theme.effects.cardShadow : 'none'
            }}
          >
            <div className="flex items-center space-x-2">
              <span 
                className="w-2 h-2 rounded-full"
                style={{
                  background: player.status === 'connected' ? theme.colors.success[500] : theme.colors.primary[300]
                }}
              />
              <span style={{ color: getStatusColor(player) }}>
                {player.username}
                {player.isHost && (
                  <span 
                    className="ml-2 text-xs"
                    style={{ color: theme.colors.primary[500] }}
                  >
                    (Host)
                  </span>
                )}
              </span>
            </div>
            {player.score !== undefined && (
              <span 
                className="font-bold"
                style={{ color: theme.colors.primary[600] }}
              >
                {player.score}
              </span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
      
      {players.length === 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          style={{ color: theme.colors.text }}
        >
          No players have joined yet
        </motion.p>
      )}
    </div>
  );
};

export default PlayersList;
