/**
 * gameEngine.js - A completely standalone game engine for Bingo
 * This engine can run the game even if the server is completely unresponsive
 */

class BingoGameEngine {
  constructor(initialState = {}) {
    // Game state
    this.grid = initialState.grid || [];
    this.players = initialState.players || [];
    this.markedNumbers = new Set(initialState.markedNumbers || []);
    this.markedCells = new Set(initialState.markedCells || []);
    this.currentTurn = initialState.currentTurn || null;
    this.gameStarted = initialState.gameStarted || false;
    this.winner = initialState.winner || null;
    this.winningLines = initialState.winningLines || [];
    this.turnIndex = initialState.turnIndex || 0;
    this.lastMarkedNumber = initialState.lastMarkedNumber || null;
    this.lastTurnChangeTime = Date.now();
    this.localPlayerId = initialState.localPlayerId || null;
    this.offlineMode = initialState.offlineMode || false;

    // Callbacks
    this.onStateChange = null;
    this.onTurnChange = null;
    this.onNumberMarked = null;
    this.onGameWon = null;
    this.onError = null;
  }

  // Set the local player ID
  setLocalPlayerId(id) {
    this.localPlayerId = id;
    this.notifyStateChange();
  }

  // Update the game state from server
  updateFromServer(serverState) {
    if (!serverState) return;

    // Only update if the server state is newer
    if (serverState.grid) this.grid = serverState.grid;
    if (serverState.players) this.players = serverState.players;
    if (serverState.markedNumbers) this.markedNumbers = new Set(serverState.markedNumbers);
    if (serverState.markedCells) this.markedCells = new Set(serverState.markedCells);
    if (serverState.currentTurn) this.currentTurn = serverState.currentTurn;
    if (serverState.gameStarted !== undefined) this.gameStarted = serverState.gameStarted;
    if (serverState.winner) this.winner = serverState.winner;
    if (serverState.winningLines) this.winningLines = serverState.winningLines;
    if (serverState.turnIndex !== undefined) this.turnIndex = serverState.turnIndex;
    if (serverState.lastMarkedNumber) this.lastMarkedNumber = serverState.lastMarkedNumber;

    // Reset offline mode if we got a server update
    this.offlineMode = false;

    this.notifyStateChange();
  }

  // Mark a number on the grid
  markNumber(number) {
    console.log(`[GameEngine] Marking number ${number}`);
    console.log(`[GameEngine] Game state: gameStarted=${this.gameStarted}, currentTurn=${this.currentTurn}, localPlayerId=${this.localPlayerId}, offlineMode=${this.offlineMode}`);

    // Validate the move
    if (!this.gameStarted) {
      console.warn(`[GameEngine] Game hasn't started yet. gameStarted=${this.gameStarted}`);
      this.notifyError("Game hasn't started yet");
      return false;
    }

    if (this.currentTurn !== this.localPlayerId && !this.offlineMode) {
      console.warn(`[GameEngine] Not your turn. currentTurn=${this.currentTurn}, localPlayerId=${this.localPlayerId}`);
      this.notifyError("It's not your turn");
      return false;
    }

    if (this.markedNumbers.has(number)) {
      this.notifyError("This number is already marked");
      return false;
    }

    // Find the cell index for this number
    const cellIndex = this.findCellIndex(number);
    if (cellIndex === -1) {
      this.notifyError("Number not found on your grid");
      return false;
    }

    // Mark the number locally
    this.markedNumbers.add(number);
    this.markedCells.add(cellIndex);
    this.lastMarkedNumber = number;

    // Notify about the marked number
    if (this.onNumberMarked) {
      this.onNumberMarked({
        number,
        cellIndex,
        markedBy: this.localPlayerId,
        automatic: false
      });
    }

    // Check for win
    const winResult = this.checkWin();
    if (winResult) {
      this.winner = { playerId: this.localPlayerId };
      this.winningLines = winResult.lines;

      if (this.onGameWon) {
        this.onGameWon({
          player: this.players.find(p => p.id === this.localPlayerId),
          lines: winResult.lines
        });
      }

      this.gameStarted = false;
      this.notifyStateChange();
      return true;
    }

    // Move to next turn
    this.nextTurn();
    return true;
  }

  // Find the cell index for a number
  findCellIndex(number) {
    if (!this.grid || !this.grid.length) return -1;

    // Flatten the grid
    const flatGrid = this.grid.flat();
    return flatGrid.findIndex(n => n === number);
  }

  // Move to the next player's turn
  nextTurn() {
    if (!this.gameStarted || this.players.length < 2) return;

    // Move to next player
    this.turnIndex = (this.turnIndex + 1) % this.players.length;
    this.currentTurn = this.players[this.turnIndex].id;
    this.lastTurnChangeTime = Date.now();

    // Notify about turn change
    if (this.onTurnChange) {
      this.onTurnChange({
        currentTurn: this.currentTurn,
        player: this.players[this.turnIndex],
        isMyTurn: this.currentTurn === this.localPlayerId
      });
    }

    this.notifyStateChange();
  }

  // Force a turn change (for recovery)
  forceTurnChange() {
    console.log('[GameEngine] Forcing turn change');
    this.nextTurn();
  }

  // Enable offline mode
  enableOfflineMode() {
    console.log('[GameEngine] Enabling offline mode');
    this.offlineMode = true;

    // If it's not the local player's turn, make it their turn
    if (this.currentTurn !== this.localPlayerId) {
      this.currentTurn = this.localPlayerId;

      // Notify about turn change
      if (this.onTurnChange) {
        const player = this.players.find(p => p.id === this.localPlayerId);
        this.onTurnChange({
          currentTurn: this.currentTurn,
          player,
          isMyTurn: true
        });
      }
    }

    // Force game to start if it hasn't already
    if (!this.gameStarted) {
      this.gameStarted = true;
    }

    this.notifyStateChange();
  }

  // Force start the game (for debugging and recovery)
  forceStartGame() {
    console.log('[GameEngine] Force starting game');
    this.gameStarted = true;

    // Make it the local player's turn
    this.currentTurn = this.localPlayerId;

    // Find player index
    const playerIndex = this.players.findIndex(p => p.id === this.localPlayerId);
    if (playerIndex !== -1) {
      this.turnIndex = playerIndex;
    }

    // Notify about turn change
    if (this.onTurnChange) {
      const player = this.players.find(p => p.id === this.localPlayerId);
      this.onTurnChange({
        currentTurn: this.currentTurn,
        player,
        isMyTurn: true
      });
    }

    this.notifyStateChange();
  }

  // Check if the current player has won
  checkWin() {
    if (!this.grid || !this.grid.length) return null;

    const size = this.grid.length; // Assuming square grid
    const lines = [];

    // Check rows
    for (let i = 0; i < size; i++) {
      const rowStart = i * size;
      const row = Array.from({ length: size }, (_, j) => rowStart + j);
      if (row.every(idx => this.markedCells.has(idx))) {
        lines.push(row);
      }
    }

    // Check columns
    for (let i = 0; i < size; i++) {
      const col = Array.from({ length: size }, (_, j) => i + (j * size));
      if (col.every(idx => this.markedCells.has(idx))) {
        lines.push(col);
      }
    }

    // Check main diagonal
    const mainDiag = Array.from({ length: size }, (_, i) => i * (size + 1));
    if (mainDiag.every(idx => this.markedCells.has(idx))) {
      lines.push(mainDiag);
    }

    // Check anti-diagonal
    const antiDiag = Array.from({ length: size }, (_, i) => (i + 1) * (size - 1));
    if (antiDiag.every(idx => this.markedCells.has(idx))) {
      lines.push(antiDiag);
    }

    // Return win result if any lines are completed
    if (lines.length > 0) {
      return { lines };
    }

    return null;
  }

  // Notify state change
  notifyStateChange() {
    if (this.onStateChange) {
      this.onStateChange({
        grid: this.grid,
        players: this.players,
        markedNumbers: Array.from(this.markedNumbers),
        markedCells: Array.from(this.markedCells),
        currentTurn: this.currentTurn,
        gameStarted: this.gameStarted,
        winner: this.winner,
        winningLines: this.winningLines,
        turnIndex: this.turnIndex,
        lastMarkedNumber: this.lastMarkedNumber,
        isMyTurn: this.currentTurn === this.localPlayerId,
        offlineMode: this.offlineMode
      });
    }
  }

  // Notify error
  notifyError(message) {
    if (this.onError) {
      this.onError(message);
    }
  }

  // Get the current state
  getState() {
    return {
      grid: this.grid,
      players: this.players,
      markedNumbers: Array.from(this.markedNumbers),
      markedCells: Array.from(this.markedCells),
      currentTurn: this.currentTurn,
      gameStarted: this.gameStarted,
      winner: this.winner,
      winningLines: this.winningLines,
      turnIndex: this.turnIndex,
      lastMarkedNumber: this.lastMarkedNumber,
      isMyTurn: this.currentTurn === this.localPlayerId,
      offlineMode: this.offlineMode
    };
  }
}

export default BingoGameEngine;
