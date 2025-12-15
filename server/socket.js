/**
 * Socket.IO Handler for Real-time Multiplayer Pool
 * Handles game events, matchmaking, and state synchronization
 */

const matchmaking = require('./matchmaking');

// Database reference (set during init)
let db = null;

// Disconnect grace period (30 seconds)
const DISCONNECT_TIMEOUT = 30000;

/**
 * Initialize socket handler
 * @param {SocketIO.Server} io - Socket.IO server instance
 * @param {Object} database - SQLite database instance
 */
function initSocket(io, database) {
    db = database;

    io.on('connection', (socket) => {
        console.log(`[Socket] Client connected: ${socket.id}`);

        // Store phone on socket for reference
        socket.phone = null;
        socket.username = null;

        /**
         * Authenticate socket connection
         * Client sends this after connecting
         */
        socket.on('auth', (data) => {
            const { phone, username } = data;
            socket.phone = phone;
            socket.username = username;
            console.log(`[Socket] Authenticated: ${username} (${phone})`);

            // Check if reconnecting to an existing game
            const reconnectResult = matchmaking.handleReconnect(null, socket.id, phone);
            if (reconnectResult.reconnected) {
                console.log(`[Socket] Player ${phone} reconnecting to game ${reconnectResult.room.roomId}`);

                // Rejoin the room
                socket.join(reconnectResult.room.roomId);

                // Notify opponent that player is back
                const opponentSocketId = matchmaking.getOpponentSocketId(socket.id);
                io.to(opponentSocketId).emit('opponent-reconnected');

                // Send game state to reconnecting player
                socket.emit('game-reconnect', {
                    roomId: reconnectResult.room.roomId,
                    playerNumber: reconnectResult.playerNumber,
                    opponent: matchmaking.getOpponent(socket.id),
                    currentPlayer: reconnectResult.room.currentPlayer,
                    pot: reconnectResult.room.pot,
                    ballState: reconnectResult.room.balls
                });
            }
        });

        /**
         * Join matchmaking queue for 1v1
         */
        socket.on('queue:join', async (data) => {
            const { stake } = data;

            console.log(`[Queue:Join] Received from socket ${socket.id}`);
            console.log(`[Queue:Join] Phone: ${socket.phone}, Username: ${socket.username}, Stake: ${stake}`);

            if (!socket.phone) {
                console.log(`[Queue:Join] ERROR: Not authenticated`);
                socket.emit('error', { message: 'Not authenticated' });
                return;
            }

            console.log(`[Queue] ${socket.username} joining queue for stake ${stake}`);

            // Verify balance before queuing
            const user = await getUser(socket.phone);
            console.log(`[Queue:Join] User balance: ${user ? user.balance : 'user not found'}`);

            if (!user || user.balance < stake) {
                console.log(`[Queue:Join] ERROR: Insufficient balance`);
                socket.emit('queue:error', { message: 'Insufficient balance' });
                return;
            }

            // Try to find a match
            console.log(`[Queue:Join] Calling matchmaking.joinQueue...`);
            const result = matchmaking.joinQueue(
                { socketId: socket.id, phone: socket.phone, username: socket.username },
                stake
            );
            console.log(`[Queue:Join] Result:`, JSON.stringify(result));

            if (result.matched) {
                console.log(`[Match] Found! ${result.player1.username} vs ${result.player2.username}`);
                console.log(`[Match] Room: ${result.roomId}, Pot: ${result.pot}`);

                // Deduct stake from both players
                await deductBalance(result.player1.phone, stake);
                await deductBalance(result.player2.phone, stake);

                // Join both players to the game room
                const room = matchmaking.getRoom(result.roomId);
                const p1Socket = io.sockets.sockets.get(result.player1.socketId);
                const p2Socket = io.sockets.sockets.get(result.player2.socketId);

                console.log(`[Match] P1 socket exists: ${!!p1Socket}, P2 socket exists: ${!!p2Socket}`);

                p1Socket?.join(result.roomId);
                p2Socket?.join(result.roomId);

                // Notify both players
                console.log(`[Match] Emitting match:found to both players...`);
                io.to(result.player1.socketId).emit('match:found', {
                    roomId: result.roomId,
                    playerNumber: 1,
                    opponent: { username: result.player2.username, phone: result.player2.phone },
                    stake: result.stake,
                    pot: result.pot
                });

                io.to(result.player2.socketId).emit('match:found', {
                    roomId: result.roomId,
                    playerNumber: 2,
                    opponent: { username: result.player1.username, phone: result.player1.phone },
                    stake: result.stake,
                    pot: result.pot
                });
                console.log(`[Match] match:found events sent!`);
            } else {
                // Added to queue, waiting
                console.log(`[Queue:Join] No match, player added to queue at position ${result.position}`);
                socket.emit('queue:waiting', {
                    position: result.position,
                    stake: result.stake
                });
            }
        });

        /**
         * Leave matchmaking queue
         */
        socket.on('queue:leave', () => {
            const removed = matchmaking.leaveQueue(socket.id);
            if (removed) {
                console.log(`[Queue] ${socket.username} left queue`);
                socket.emit('queue:left');
            }
        });

        /**
         * Game ready - player loaded into game
         */
        socket.on('game:ready', (data) => {
            const room = matchmaking.getRoomByPlayer(socket.id);
            if (!room) return;

            const playerNum = matchmaking.getPlayerNumber(socket.id);
            room[`player${playerNum}Ready`] = true;

            console.log(`[Game] Player ${playerNum} ready in room ${room.roomId}`);

            // Check if both players ready
            if (room.player1Ready && room.player2Ready) {
                room.state = 'PLAYING';
                io.to(room.roomId).emit('game:start', {
                    currentPlayer: 1,
                    pot: room.pot
                });
            }
        });

        /**
         * Player took a shot - broadcast to opponent
         */
        socket.on('game:shot', (data) => {
            const room = matchmaking.getRoomByPlayer(socket.id);
            if (!room || room.state !== 'PLAYING') return;

            const playerNum = matchmaking.getPlayerNumber(socket.id);

            // Verify it's this player's turn
            if (room.currentPlayer !== playerNum) {
                socket.emit('error', { message: 'Not your turn' });
                return;
            }

            console.log(`[Game] Shot by Player ${playerNum}: angle=${data.angle.toFixed(2)}, power=${data.power.toFixed(2)}`);

            // Broadcast shot to opponent
            const opponentSocketId = matchmaking.getOpponentSocketId(socket.id);
            io.to(opponentSocketId).emit('opponent:shot', {
                angle: data.angle,
                power: data.power
            });
        });

        /**
         * Shot completed - switch turn
         */
        socket.on('game:shot-complete', (data) => {
            const room = matchmaking.getRoomByPlayer(socket.id);
            if (!room) return;

            const { pottedBalls, foul, ballState } = data;

            // Store ball state for reconnections
            room.balls = ballState;

            // Determine if turn switches
            // Turn stays same if: potted own ball and no foul
            // Turn switches if: no pot, potted opponent's ball, or foul
            let switchTurn = true;
            if (pottedBalls && pottedBalls.length > 0 && !foul) {
                // Check if potted own balls (simplified - actual logic depends on game rules)
                switchTurn = false;
            }

            if (switchTurn || foul) {
                const newCurrentPlayer = matchmaking.switchTurn(room.roomId);
                io.to(room.roomId).emit('game:turn-change', {
                    currentPlayer: newCurrentPlayer,
                    foul: foul || false
                });
            }
        });

        /**
         * Game over - winner determined
         */
        socket.on('game:over', async (data) => {
            const room = matchmaking.getRoomByPlayer(socket.id);
            if (!room) return;

            const { winner } = data; // 1 or 2
            const winnerSocketId = winner === 1 ? room.player1.socketId : room.player2.socketId;

            const result = matchmaking.endGame(room.roomId, winnerSocketId);
            if (!result) return;

            console.log(`[Game] Over! Winner: ${result.winner.username}, Pot: ${result.pot}`);

            // Award pot to winner and record stats
            await awardWinnings(result.winner.phone, result.pot);
            await recordLoss(result.loser.phone);

            // Notify both players
            io.to(room.roomId).emit('game:result', {
                winner: result.winner.username,
                winnerNumber: winner,
                pot: result.pot
            });

            // Clean up socket room
            io.sockets.sockets.get(result.winner.socketId)?.leave(room.roomId);
            io.sockets.sockets.get(result.loser.socketId)?.leave(room.roomId);
        });

        /**
         * Forfeit / Quit game
         */
        socket.on('game:forfeit', async () => {
            const room = matchmaking.getRoomByPlayer(socket.id);
            if (!room) return;

            const myPlayerNum = matchmaking.getPlayerNumber(socket.id);
            const opponentNum = myPlayerNum === 1 ? 2 : 1;
            const opponentSocketId = matchmaking.getOpponentSocketId(socket.id);

            const result = matchmaking.endGame(room.roomId, opponentSocketId);
            if (!result) return;

            console.log(`[Game] Forfeit by ${socket.username}, ${result.winner.username} wins`);

            // Award pot to opponent
            await awardWinnings(result.winner.phone, result.pot);
            await recordLoss(result.loser.phone);

            // Notify opponent
            io.to(opponentSocketId).emit('game:opponent-forfeit', {
                pot: result.pot
            });

            // Notify self
            socket.emit('game:you-forfeit');
        });

        /**
         * Handle disconnect
         */
        socket.on('disconnect', () => {
            console.log(`[Socket] Client disconnected: ${socket.id} (${socket.username})`);

            const result = matchmaking.handleDisconnect(socket.id);

            if (result.inGame) {
                console.log(`[Game] Player ${result.disconnectedPlayer} disconnected from room ${result.roomId}`);

                // Notify opponent
                io.to(result.opponentSocketId).emit('opponent-disconnected', {
                    timeout: DISCONNECT_TIMEOUT / 1000
                });

                // Set timeout for auto-forfeit
                const room = matchmaking.getRoom(result.roomId);
                if (room) {
                    room.disconnectTimeout = setTimeout(async () => {
                        console.log(`[Game] Disconnect timeout - auto forfeit for room ${result.roomId}`);

                        // Award win to connected player
                        const endResult = matchmaking.endGame(result.roomId, result.opponentSocketId);
                        if (endResult) {
                            await awardWinnings(endResult.winner.phone, endResult.pot);
                            await recordLoss(endResult.loser.phone);

                            io.to(result.opponentSocketId).emit('game:opponent-timeout', {
                                pot: endResult.pot
                            });
                        }
                    }, DISCONNECT_TIMEOUT);
                }
            }
        });
    });

    console.log('[Socket] Handler initialized');
}

// Database helper functions - now use MongoDB module
async function getUser(phone) {
    return await db.getUser(phone);
}

async function deductBalance(phone, amount) {
    await db.deductBalance(phone, amount);
    await db.recordTransaction(
        Date.now().toString() + Math.random().toString(36).substring(7),
        phone, -amount, 'GAME_ENTRY', 'Multiplayer Game Stake', 'COMPLETED'
    );
}

async function awardWinnings(phone, amount) {
    await db.recordWin(phone, amount);
    await db.recordTransaction(
        Date.now().toString() + Math.random().toString(36).substring(7),
        phone, amount, 'GAME_WIN', 'Multiplayer Game Winnings', 'COMPLETED'
    );
}

async function recordLoss(phone) {
    await db.recordLoss(phone);
}

module.exports = { initSocket };

