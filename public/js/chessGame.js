const socket = io();
const chess = new Chess();
const boardElement = document.querySelector('.chessboard');

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null; // 'w', 'b', or null for spectator
let gameId = null;
let gameStatus = 'waiting'; // 'waiting', 'active', 'finished'

// UI elements (add these to your HTML)
const statusElement = document.querySelector('#game-status') || createStatusElement();
const gameIdElement = document.querySelector('#game-id') || createGameIdElement();

function createStatusElement() {
    const element = document.createElement('div');
    element.id = 'game-status';
    element.style.cssText = 'padding: 10px; margin: 10px; background: #f0f0f0; border-radius: 5px; text-align: center;';
    boardElement.parentNode.insertBefore(element, boardElement);
    return element;
}

function createGameIdElement() {
    const element = document.createElement('div');
    element.id = 'game-id';
    element.style.cssText = 'padding: 5px; margin: 5px; font-size: 12px; color: #666; text-align: center;';
    boardElement.parentNode.insertBefore(element, boardElement);
    return element;
}

const renderBoard = () => {
    const board = chess.board();
    boardElement.innerHTML = '';
    
    board.forEach((row, rowIndex) => {
        row.forEach((square, squareIndex) => {
            const squareElement = document.createElement("div");
            squareElement.classList.add('square', 
                (rowIndex + squareIndex) % 2 === 0 ? "light" : "dark"
            );
            squareElement.dataset.row = rowIndex;
            squareElement.dataset.col = squareIndex;
            
            if (square) {
                const pieceElement = document.createElement("div");
                pieceElement.classList.add(
                    'piece',
                    square.color === 'w' ? 'white' : 'black'
                );
                pieceElement.innerText = getPieceUnicode(square);
                
                // Only allow dragging if it's the player's piece and game is active
                pieceElement.draggable = (playerRole === square.color) && (gameStatus === 'active');

                pieceElement.addEventListener('dragstart', (e) => {
                    if (pieceElement.draggable) {
                        draggedPiece = pieceElement;
                        sourceSquare = squareElement;
                        e.dataTransfer.setData('text/plain', '');
                    }
                });

                pieceElement.addEventListener('dragend', () => {
                    draggedPiece = null;
                    sourceSquare = null;
                });

                squareElement.appendChild(pieceElement);
            }

            squareElement.addEventListener('dragover', (e) => {
                e.preventDefault();
            });

            squareElement.addEventListener('drop', (e) => {
                e.preventDefault();
                if (draggedPiece && gameStatus === 'active') {
                    const targetSource = {
                        row: parseInt(squareElement.dataset.row),
                        col: parseInt(squareElement.dataset.col)
                    };
                    handleMove(sourceSquare, targetSource);
                }
            });
            
            boardElement.appendChild(squareElement);
        });
    });

    // Flip board for black player
    if (playerRole === 'b') {
        boardElement.classList.add("flipped");
    } else {
        boardElement.classList.remove("flipped");
    }
};

const handleMove = (source, target) => {
    const sourceRow = parseInt(source.dataset.row);
    const sourceCol = parseInt(source.dataset.col);
    const targetRow = target.row;
    const targetCol = target.col;

    const move = {
        from: `${String.fromCharCode(97 + sourceCol)}${8 - sourceRow}`,
        to: `${String.fromCharCode(97 + targetCol)}${8 - targetRow}`,
        promotion: 'q'
    };

    console.log("Sending move:", move);
    socket.emit("move", move);
};

const getPieceUnicode = (piece) => {
    const unicodePieces = {
        'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚',
        'P': '♙', 'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔'
    };
    return unicodePieces[piece.type] || '';
};

const updateStatus = (message) => {
    statusElement.innerHTML = message;
};

const updateGameId = (id) => {
    gameIdElement.innerHTML = id ? `Game ID: ${id}` : '';
};

// Socket event listeners
socket.on("playerRole", function(role) {
    playerRole = role;
    updateStatus(`You are playing as ${role === 'w' ? 'White' : 'Black'}. Waiting for opponent...`);
    renderBoard();
});

socket.on("spectatorRole", function() {
    playerRole = null;
    updateStatus("You are spectating this game.");
    renderBoard();
});

socket.on("gameId", function(id) {
    gameId = id;
    updateGameId(id);
});

socket.on("gameStart", function() {
    gameStatus = 'active';
    updateStatus(`Game started! ${chess.turn() === 'w' ? 'White' : 'Black'} to move.`);
});

socket.on("boardState", function(fen) {
    chess.load(fen);
    renderBoard();
    
    if (gameStatus === 'active') {
        const currentTurn = chess.turn() === 'w' ? 'White' : 'Black';
        const isMyTurn = chess.turn() === playerRole;
        
        if (playerRole) {
            updateStatus(`${currentTurn} to move ${isMyTurn ? '(Your turn)' : ''}`);
        } else {
            updateStatus(`Spectating: ${currentTurn} to move`);
        }
    }
});

socket.on("move", function(move) {
    chess.move(move);
    renderBoard();
});

socket.on("invalidMove", function(error) {
    alert(`Invalid move: ${error}`);
});

socket.on("gameOver", function(result) {
    gameStatus = 'finished';
    let message = '';
    
    switch(result) {
        case 'white_wins':
            message = 'White wins by checkmate!';
            break;
        case 'black_wins':
            message = 'Black wins by checkmate!';
            break;
        case 'draw':
            message = 'Game ended in a draw!';
            break;
    }
    
    updateStatus(message);
    
    // Offer to play again after 3 seconds
    setTimeout(() => {
        if (confirm(`${message}\n\nWould you like to play another game?`)) {
            location.reload();
        }
    }, 3000);
});

socket.on("playerDisconnected", function(color) {
    updateStatus(`${color} player disconnected. Waiting for reconnection...`);
});

socket.on("error", function(message) {
    alert(`Error: ${message}`);
});

// Initial render
renderBoard();
updateStatus("Connecting to server...");