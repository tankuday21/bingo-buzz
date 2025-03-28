const mongoose = require('mongoose');

const LeaderboardSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  gamesPlayed: {
    type: Number,
    default: 0
  },
  gamesWon: {
    type: Number,
    default: 0
  },
  totalScore: {
    type: Number,
    default: 0
  },
  highScore: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Virtual for win percentage
LeaderboardSchema.virtual('winPercentage').get(function() {
  if (this.gamesPlayed === 0) return 0;
  return Math.round((this.gamesWon / this.gamesPlayed) * 100);
});

// Virtual for average score
LeaderboardSchema.virtual('averageScore').get(function() {
  if (this.gamesPlayed === 0) return 0;
  return Math.round(this.totalScore / this.gamesPlayed);
});

// Configure the schema to include virtuals when converting to JSON
LeaderboardSchema.set('toJSON', { virtuals: true });
LeaderboardSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Leaderboard', LeaderboardSchema);
