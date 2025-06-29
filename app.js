const express = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socket(server);

// Store multiple game instances
let games = {};
let waitingPlayers = [];

// Game class to manage individual chess games
class ChessGame {
    constructor(gameId) {
        this.gameId = gameId;
        this.chess = new Chess();
        this.players = {};
        this.spectators = new Set();
        this.currentPlayer = "w";
    }

    addPlayer(socketId, socket) {
        if (!this.players.white) {
            this.players.white = socketId;
            socket.join(this.gameId);
            socket.emit("playerRole", "w");
            socket.emit("gameId", this.gameId);
            return "white";
        } else if (!this.players.black) {
            this.players.black = socketId;
            socket.join(this.gameId);
            socket.emit("playerRole", "b");
            socket.emit("gameId", this.gameId);
            // Game is ready to start
            io.to(this.gameId).emit("gameStart");
            io.to(this.gameId).emit("boardState", this.chess.fen());
            return "black";
        }
        return null;
    }

    addSpectator(socketId, socket) {
        this.spectators.add(socketId);
        socket.join(this.gameId);
        socket.emit("spectatorRole");
        socket.emit("gameId", this.gameId);
        socket.emit("boardState", this.chess.fen());
    }

    removePlayer(socketId) {
        if (this.players.white === socketId) {
            delete this.players.white;
            io.to(this.gameId).emit("playerDisconnected", "white");
        } else if (this.players.black === socketId) {
            delete this.players.black;
            io.to(this.gameId).emit("playerDisconnected", "black");
        } else {
            this.spectators.delete(socketId);
        }

        // If no players left, mark game for deletion
        if (!this.players.white && !this.players.black) {
            return true; // Game should be deleted
        }
        return false;
    }

    makeMove(move, socketId) {
        try {
            // Validate player turn
            if (this.chess.turn() === 'w' && socketId !== this.players.white) {
                return { success: false, error: "Not your turn" };
            }
            if (this.chess.turn() === 'b' && socketId !== this.players.black) {
                return { success: false, error: "Not your turn" };
            }

            const result = this.chess.move(move);
            if (result) {
                this.currentPlayer = this.chess.turn();
                io.to(this.gameId).emit("move", move);
                io.to(this.gameId).emit("boardState", this.chess.fen());
                
                // Check for game end
                if (this.chess.isGameOver()) {
                    let gameResult = "draw";
                    if (this.chess.isCheckmate()) {
                        gameResult = this.chess.turn() === 'w' ? "black_wins" : "white_wins";
                    }
                    io.to(this.gameId).emit("gameOver", gameResult);
                }
                
                return { success: true };
            } else {
                return { success: false, error: "Invalid move" };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    getPlayerCount() {
        let count = 0;
        if (this.players.white) count++;
        if (this.players.black) count++;
        return count;
    }
}

// Helper functions
function generateGameId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function findOrCreateGame() {
    // First, try to find a game that needs players
    for (let gameId in games) {
        if (games[gameId].getPlayerCount() < 2) {
            return games[gameId];
        }
    }
    
    // If no available game, create a new one
    const gameId = generateGameId();
    games[gameId] = new ChessGame(gameId);
    console.log(`Created new game: ${gameId}`);
    return games[gameId];
}

function cleanupEmptyGames() {
    for (let gameId in games) {
        if (games[gameId].getPlayerCount() === 0 && games[gameId].spectators.size === 0) {
            delete games[gameId];
            console.log(`Deleted empty game: ${gameId}`);
        }
    }
}

// Express routes
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.render("homepage");
});

app.get("/play", (req, res) => {
    res.render("index");
});

// Socket.io connection handling
io.on("connection", function(socket) {
    console.log(`Player connected: ${socket.id}`);

    // Find or create a game for the player
    const game = findOrCreateGame();
    const playerRole = game.addPlayer(socket.id, socket);
    
    if (!playerRole) {
        // Game is full, add as spectator
        game.addSpectator(socket.id, socket);
        console.log(`${socket.id} joined as spectator in game ${game.gameId}`);
    } else {
        console.log(`${socket.id} joined as ${playerRole} in game ${game.gameId}`);
    }

    // Handle moves
    socket.on("move", (move) => {
        // Find which game this socket belongs to
        let currentGame = null;
        for (let gameId in games) {
            if (games[gameId].players.white === socket.id || 
                games[gameId].players.black === socket.id) {
                currentGame = games[gameId];
                break;
            }
        }

        if (currentGame) {
            const result = currentGame.makeMove(move, socket.id);
            if (!result.success) {
                socket.emit("invalidMove", result.error);
            }
        }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
        console.log(`Player disconnected: ${socket.id}`);
        
        // Find and remove player from their game
        for (let gameId in games) {
            const shouldDelete = games[gameId].removePlayer(socket.id);
            if (shouldDelete) {
                delete games[gameId];
                console.log(`Game ${gameId} deleted - no players left`);
            }
            break;
        }
        
        // Clean up empty games periodically
        cleanupEmptyGames();
    });

    // Handle joining specific game (optional feature)
    socket.on("joinGame", (gameId) => {
        if (games[gameId]) {
            const playerRole = games[gameId].addPlayer(socket.id, socket);
            if (!playerRole) {
                games[gameId].addSpectator(socket.id, socket);
            }
        } else {
            socket.emit("error", "Game not found");
        }
    });
});

// Cleanup empty games every 5 minutes
setInterval(cleanupEmptyGames, 5 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
