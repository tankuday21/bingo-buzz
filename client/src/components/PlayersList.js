import React, { useContext } from 'react';
import { ThemeContext } from '../context/ThemeContext';

const PlayersList = React.memo(({ players, currentTurn, winner }) => {
  const { theme } = useContext(ThemeContext);

  // Helper function to get username from player object or string
  const getUsername = (player) => {
    if (typeof player === 'string') return player;
    return player.username || '';
  };

  // Helper function to get player ID
  const getPlayerId = (player) => {
    if (typeof player === 'string') return player;
    return player.id || '';
  };

  // Check if a player is current turn
  const isCurrentTurn = (player) => {
    if (!currentTurn) return false;
    const username = getUsername(player);
    const id = getPlayerId(player);
    return currentTurn === username || currentTurn === id;
  };

  // Check if a player is the winner
  const isWinner = (player) => {
    if (!winner) return false;
    const username = getUsername(player);
    const id = getPlayerId(player);
    
    // Winner could be a string, an object with username, or an object with id
    if (typeof winner === 'string') {
      return winner === username;
    }
    return winner.username === username || winner.id === id;
  };

  if (!players || players.length === 0) {
    return (
      <div className="text-center p-4">
        <p>Waiting for players to join...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {players.map((player, index) => {
        const username = getUsername(player);
        const isPlayerWinner = isWinner(player);
        const isPlayerTurn = isCurrentTurn(player);
        
        return (
          <div
            key={`${username}-${index}`}
            className="p-3 rounded-lg flex items-center justify-between"
            style={{
              backgroundColor: isPlayerWinner
                ? theme.colors.success 
                : isPlayerTurn
                  ? theme.colors.primary 
                  : `${theme.colors.card}66`,
              color: (isPlayerWinner || isPlayerTurn) 
                ? theme.colors.card 
                : theme.colors.text,
              border: `2px solid ${
                isPlayerWinner
                  ? theme.colors.success 
                  : isPlayerTurn
                    ? theme.colors.primary 
                    : theme.colors.border
              }`
            }}
          >
            <span className="font-medium">{username}</span>
            <div className="flex items-center space-x-2">
              {isPlayerWinner && (
                <span className="text-sm px-2 py-1 rounded-full bg-white bg-opacity-20">
                  Winner! 🏆
                </span>
              )}
              {isPlayerTurn && !isPlayerWinner && (
                <span className="text-sm px-2 py-1 rounded-full bg-white bg-opacity-20">
                  Current Turn
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default PlayersList;
