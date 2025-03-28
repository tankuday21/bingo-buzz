import React, { useContext } from 'react';
import { ThemeContext } from '../context/ThemeContext';

const PlayersList = ({ players, currentTurn, winner }) => {
  const { theme } = useContext(ThemeContext);

  if (!players || players.length === 0) {
    return (
      <div className="text-center p-4">
        <p>Waiting for players to join...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {players.map((player) => (
        <div
          key={player.username}
          className="p-3 rounded-lg flex items-center justify-between"
          style={{
            backgroundColor: winner === player.username 
              ? theme.colors.success 
              : currentTurn === player.username 
                ? theme.colors.primary 
                : `${theme.colors.card}66`,
            color: (winner === player.username || currentTurn === player.username) 
              ? theme.colors.card 
              : theme.colors.text,
            border: `2px solid ${
              winner === player.username 
                ? theme.colors.success 
                : currentTurn === player.username 
                  ? theme.colors.primary 
                  : theme.colors.border
            }`
          }}
        >
          <span className="font-medium">{player.username}</span>
          <div className="flex items-center space-x-2">
            {winner === player.username && (
              <span className="text-sm px-2 py-1 rounded-full bg-white bg-opacity-20">
                Winner! 🏆
              </span>
            )}
            {currentTurn === player.username && !winner && (
              <span className="text-sm px-2 py-1 rounded-full bg-white bg-opacity-20">
                Current Turn
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default PlayersList;
