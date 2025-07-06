const socket = io();
const chess = new Chess();
const boardElement = document.querySelector('.chessboard');

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null; // 'w', 'b', or null for spectator
let gameId = null;
let gameStatus = 'waiting'; // 'waiting', 'active', 'finished'

// NEW: Tap-to-move functionality
let selectedSquare = null;
let highlightedMoves = [];

// UI elements
const statusElement = document.querySelector('#game-status') || createStatusElement();
const gameIdElement = document.querySelector('#game-id') || createGameIdElement();
const moveHistoryElement = document.querySelector('#move-history') || createMoveHistoryElement();

function createStatusElement() {
    const element = document.createElement('div');
    element.id = 'game-status';
    element.style.cssText = 'padding: 10px; margin: 10px; background: #f0f0f0; border-radius: 5px; text-align: center; font-weight: bold;';
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

function createMoveHistoryElement() {
    const element = document.createElement('div');
    element.id = 'move-history';
    element.style.cssText = 'padding: 10px; margin: 10px; background: #f9f9f9; border-radius: 5px; max-height: 150px; overflow-y: auto;';
    element.innerHTML = '<h4>Move History</h4><div id="moves-list"></div>';
    boardElement.parentNode.appendChild(element);
    return element;
}

// NEW: Get square notation from row/col
const getSquareNotation = (row, col) => {
    return `${String.fromCharCode(97 + col)}${8 - row}`;
};

// NEW: Get row/col from square notation
const getRowColFromSquare = (square) => {
    const col = square.charCodeAt(0) - 97;
    const row = 8 - parseInt(square[1]);
    return { row, col };
};

// NEW: Highlight possible moves
const highlightPossibleMoves = (square) => {
    clearHighlights();
    
    if (!square || gameStatus !== 'active') return;
    
    const moves = chess.moves({ square: square, verbose: true });
    highlightedMoves = moves.map(move => move.to);
    
    moves.forEach(move => {
        const { row, col } = getRowColFromSquare(move.to);
        const targetSquare = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        if (targetSquare) {
            targetSquare.classList.add('highlighted-move');
            
            // Add capture highlight if it's a capture move
            if (move.flags.includes('c')) {
                targetSquare.classList.add('capture-move');
            }
        }
    });
    
    // Highlight selected square
    const { row, col } = getRowColFromSquare(square);
    const sourceSquareElement = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (sourceSquareElement) {
        sourceSquareElement.classList.add('selected-square');
    }
};

// NEW: Clear all highlights
const clearHighlights = () => {
    document.querySelectorAll('.highlighted-move, .capture-move, .selected-square, .check-highlight').forEach(el => {
        el.classList.remove('highlighted-move', 'capture-move', 'selected-square', 'check-highlight');
    });
    highlightedMoves = [];
};

// NEW: Highlight king in check
const highlightCheck = () => {
    if (chess.inCheck()) {
        const kingSquare = chess.board().flat().find(piece => 
            piece && piece.type === 'k' && piece.color === chess.turn()
        );
        
        if (kingSquare) {
            // Find king position on board
            const board = chess.board();
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    const piece = board[row][col];
                    if (piece && piece.type === 'k' && piece.color === chess.turn()) {
                        const kingElement = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
                        if (kingElement) {
                            kingElement.classList.add('check-highlight');
                        }
                        return;
                    }
                }
            }
        }
    }
};

// NEW: Handle tap-to-move
const handleSquareTap = (squareElement) => {
    if (gameStatus !== 'active' || !playerRole) return;
    
    const row = parseInt(squareElement.dataset.row);
    const col = parseInt(squareElement.dataset.col);
    const square = getSquareNotation(row, col);
    const piece = chess.get(square);
    
    // If no piece is selected
    if (!selectedSquare) {
        // Select piece if it belongs to current player
        if (piece && piece.color === playerRole && chess.turn() === playerRole) {
            selectedSquare = square;
            highlightPossibleMoves(square);
        }
        return;
    }
    
    // If same square is tapped again, deselect
    if (selectedSquare === square) {
        selectedSquare = null;
        clearHighlights();
        return;
    }
    
    // If another piece of same color is tapped, select it
    if (piece && piece.color === playerRole) {
        selectedSquare = square;
        highlightPossibleMoves(square);
        return;
    }
    
    // Try to make move
    if (highlightedMoves.includes(square)) {
        makeMove(selectedSquare, square);
        selectedSquare = null;
        clearHighlights();
    }
};

// Updated: Make move function
const makeMove = (from, to) => {
    const move = {
        from: from,
        to: to,
        promotion: 'q' // Auto-promote to queen for simplicity
    };
    
    console.log("Sending move:", move);
    socket.emit("move", move);
};

// Updated: Handle drag and drop move
const handleMove = (source, target) => {
    const sourceRow = parseInt(source.dataset.row);
    const sourceCol = parseInt(source.dataset.col);
    const targetRow = target.row;
    const targetCol = target.col;

    const from = getSquareNotation(sourceRow, sourceCol);
    const to = getSquareNotation(targetRow, targetCol);
    
    makeMove(from, to);
};

// Updated: Render board with new functionality
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
            
            // NEW: Add tap event listener
            squareElement.addEventListener('click', () => handleSquareTap(squareElement));
            
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
    
    // Highlight check after rendering
    highlightCheck();
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

// NEW: Update move history
const updateMoveHistory = (move) => {
    const movesList = document.getElementById('moves-list');
    if (movesList) {
        const moveElement = document.createElement('div');
        moveElement.textContent = `${move.from} → ${move.to}`;
        moveElement.style.cssText = 'padding: 2px 5px; margin: 1px 0; background: #e0e0e0; border-radius: 3px; font-size: 12px;';
        movesList.appendChild(moveElement);
        movesList.scrollTop = movesList.scrollHeight;
    }
};

// NEW: Show game analysis
const showGameAnalysis = (result) => {
    const showGameAnalysis = (result) => {
    let analysis = '';
    
    // Use server result as primary source of truth
    if (result === 'white_wins') {
        analysis = chess.isCheckmate() ? 
            '🏆 CHECKMATE! White wins by checkmate.' : 
            '🏆 White wins!';
    } else if (result === 'black_wins') {
        analysis = chess.isCheckmate() ? 
            '🏆 CHECKMATE! Black wins by checkmate.' : 
            '🏆 Black wins!';
    } else if (result === 'draw') {
        if (chess.isStalemate()) {
            analysis = '🤝 STALEMATE! No legal moves available - it\'s a draw.';
        } else if (chess.isThreefoldRepetition()) {
            analysis = '🔄 DRAW by threefold repetition.';
        } else if (chess.isInsufficientMaterial()) {
            analysis = '⚖️ DRAW by insufficient material.';
        } else {
            analysis = '🤝 DRAW by 50-move rule.';
        }
    }
    
    return analysis;
};
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
    clearHighlights(); // Clear any existing highlights
});

socket.on("boardState", function(fen) {
    chess.load(fen);
    renderBoard();
    
    if (gameStatus === 'active') {
        const currentTurn = chess.turn() === 'w' ? 'White' : 'Black';
        const isMyTurn = chess.turn() === playerRole;
        
        let statusMessage = `${currentTurn} to move`;
        if (chess.inCheck()) {
            statusMessage += ' - CHECK!';
        }
        if (playerRole) {
            statusMessage += ` ${isMyTurn ? '(Your turn)' : ''}`;
        } else {
            statusMessage = `Spectating: ${statusMessage}`;
        }
        
        updateStatus(statusMessage);

         checkGameOver();
    }
});

socket.on("move", function(move) {
    chess.move(move);
    updateMoveHistory(move);
    renderBoard();
    clearHighlights(); // Clear highlights after move
    
    // Check if game is over after the move
    checkGameOver();
});

// Remove the duplicate showGameAnalysis function and clean up the code

socket.on("invalidMove", function(error) {
    alert(`Invalid move: ${error}`);
    clearHighlights();
    selectedSquare = null;
});

socket.on("gameOver", function(result) {
    gameStatus = 'finished';
    clearHighlights();
    selectedSquare = null;
    
    // Show the overlay
    showGameOverlay(result, playerRole);
    
    // Update status text as well
    let statusMessage = '';
    if (result === 'white_wins') {
        statusMessage = '🏆 Game Over - White wins by checkmate!';
    } else if (result === 'black_wins') {
        statusMessage = '🏆 Game Over - Black wins by checkmate!';
    } else if (result === 'draw') {
        if (chess.isStalemate()) {
            statusMessage = '🤝 Game Over - Draw by stalemate!';
        } else if (chess.isThreefoldRepetition()) {
            statusMessage = '🔄 Game Over - Draw by threefold repetition!';
        } else if (chess.isInsufficientMaterial()) {
            statusMessage = '⚖️ Game Over - Draw by insufficient material!';
        } else {
            statusMessage = '🤝 Game Over - Draw!';
        }
    }
    
    updateStatus(statusMessage);
});

socket.on("playerDisconnected", function(color) {
    updateStatus(`${color} player disconnected. Waiting for reconnection...`);
    clearHighlights();
    selectedSquare = null;
});

socket.on("error", function(message) {
    alert(`Error: ${message}`);
    clearHighlights();
    selectedSquare = null;
});

// Initial render
renderBoard();
updateStatus("Connecting to server...");

// NEW: Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        clearHighlights();
        selectedSquare = null;
    }
});

// Add these functions to your chessGame.js file:

function showGameOverlay(result, playerColor) {
    const overlay = document.getElementById('game-overlay');
    const resultText = document.getElementById('game-result-text');
    const resultSubtitle = document.getElementById('game-result-subtitle');
    
    if (!overlay || !resultText || !resultSubtitle) {
        console.error('Game overlay elements not found');
        return;
    }
    
    // Clear previous classes
    resultText.className = 'game-result-text';
    
    // Determine result and set text based on server result
    if (result === 'white_wins') {
        if (playerColor === 'w') {
            resultText.textContent = 'YOU WON!';
            resultText.classList.add('win');
            resultSubtitle.textContent = 'Checkmate! Victory is yours!';
        } else {
            resultText.textContent = 'YOU LOST!';
            resultText.classList.add('lose');
            resultSubtitle.textContent = 'Checkmate! Better luck next time!';
        }
    } else if (result === 'black_wins') {
        if (playerColor === 'b') {
            resultText.textContent = 'YOU WON!';
            resultText.classList.add('win');
            resultSubtitle.textContent = 'Checkmate! Victory is yours!';
        } else {
            resultText.textContent = 'YOU LOST!';
            resultText.classList.add('lose');
            resultSubtitle.textContent = 'Checkmate! Better luck next time!';
        }
    } else if (result === 'draw') {
        resultText.textContent = 'DRAW!';
        resultText.classList.add('draw');
        
        // Determine draw reason
        if (chess.isStalemate()) {
            resultSubtitle.textContent = 'Stalemate! No legal moves available!';
        } else if (chess.isThreefoldRepetition()) {
            resultSubtitle.textContent = 'Draw by threefold repetition!';
        } else if (chess.isInsufficientMaterial()) {
            resultSubtitle.textContent = 'Draw by insufficient material!';
        } else {
            resultSubtitle.textContent = 'It\'s a draw!';
        }
    }
    
    // Show overlay with animation
    overlay.classList.add('show');
}


function hideGameOverlay() {
    const overlay = document.getElementById('game-overlay');
    if (overlay) {
        overlay.classList.remove('show');
    }
}


function checkGameOver() {
    if (chess.isGameOver()) {
        let result = 'draw';
        
        if (chess.isCheckmate()) {
            // The player who can't move loses
            result = chess.turn() === 'w' ? 'black_wins' : 'white_wins';
        }
        
        showGameOverlay(result, playerRole);
        return true;
    }
    return false;
}

// Use it in your game over event handler:
// Example: showGameOverlay('checkmate', 'white');