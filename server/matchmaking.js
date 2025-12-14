/**
 * Matchmaking System for 1v1 Online Pool
 * Queues players by stake amount and pairs them for matches
 */

class Matchmaking {
    constructor() {
        // Queue organized by stake amount: { 20: [...], 50: [...] }
        this.queues = {};
        // Active games: { roomId: GameRoom }
        this.activeGames = {};
        // Player to room mapping: { socketId: roomId }
        this.playerRooms = {};
        // Socket ID to player info: { socketId: { phone, username, stake } }
        this.playerInfo = {};
    }

    /**
     * Add player to matchmaking queue
     * @param {Object} player - { socketId, phone, username }
     * @param {number} stake - Entry stake amount
     * @returns {Object|null} - Match info if paired, null if queued
     */
    joinQueue(player, stake) {
        const { socketId, phone, username } = player;

        // Store player info
        this.playerInfo[socketId] = { phone, username, stake };

        // Initialize queue for this stake if needed
        if (!this.queues[stake]) {
            this.queues[stake] = [];
        }

        const queue = this.queues[stake];

        // Check if there's already someone waiting with same stake
        if (queue.length > 0) {
            // Found a match!
            const opponent = queue.shift(); // Remove first waiting player

            // Create game room
            const roomId = this.createGameRoom(opponent, player, stake);

            return {
                matched: true,
                roomId,
                player1: opponent,
                player2: player,
                stake,
                pot: stake * 2
            };
        } else {
            // No match, add to queue
            queue.push(player);
            return {
                matched: false,
                position: queue.length,
                stake
            };
        }
    }

    /**
     * Remove player from queue (cancelled or disconnected before match)
     * @param {string} socketId 
     */
    leaveQueue(socketId) {
        const info = this.playerInfo[socketId];
        if (!info) return false;

        const queue = this.queues[info.stake];
        if (queue) {
            const index = queue.findIndex(p => p.socketId === socketId);
            if (index !== -1) {
                queue.splice(index, 1);
                delete this.playerInfo[socketId];
                return true;
            }
        }
        return false;
    }

    /**
     * Create a new game room for matched players
     */
    createGameRoom(player1, player2, stake) {
        const roomId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const room = {
            roomId,
            player1: {
                socketId: player1.socketId,
                phone: player1.phone,
                username: player1.username,
                number: 1
            },
            player2: {
                socketId: player2.socketId,
                phone: player2.phone,
                username: player2.username,
                number: 2
            },
            stake,
            pot: stake * 2,
            currentPlayer: 1,
            state: 'STARTING', // STARTING, PLAYING, FINISHED
            balls: null, // Will be set when game initializes
            createdAt: new Date(),
            disconnectedPlayer: null,
            disconnectTimeout: null
        };

        this.activeGames[roomId] = room;
        this.playerRooms[player1.socketId] = roomId;
        this.playerRooms[player2.socketId] = roomId;

        // Remove from player info (they're now in a game)
        delete this.playerInfo[player1.socketId];
        delete this.playerInfo[player2.socketId];

        return roomId;
    }

    /**
     * Get game room by ID
     */
    getRoom(roomId) {
        return this.activeGames[roomId] || null;
    }

    /**
     * Get room by player socket ID
     */
    getRoomByPlayer(socketId) {
        const roomId = this.playerRooms[socketId];
        return roomId ? this.activeGames[roomId] : null;
    }

    /**
     * Get player number (1 or 2) in a room
     */
    getPlayerNumber(socketId) {
        const room = this.getRoomByPlayer(socketId);
        if (!room) return null;
        if (room.player1.socketId === socketId) return 1;
        if (room.player2.socketId === socketId) return 2;
        return null;
    }

    /**
     * Get opponent socket ID
     */
    getOpponentSocketId(socketId) {
        const room = this.getRoomByPlayer(socketId);
        if (!room) return null;
        if (room.player1.socketId === socketId) return room.player2.socketId;
        return room.player1.socketId;
    }

    /**
     * Get opponent info
     */
    getOpponent(socketId) {
        const room = this.getRoomByPlayer(socketId);
        if (!room) return null;
        if (room.player1.socketId === socketId) return room.player2;
        return room.player1;
    }

    /**
     * Switch turn in a game
     */
    switchTurn(roomId) {
        const room = this.activeGames[roomId];
        if (room) {
            room.currentPlayer = room.currentPlayer === 1 ? 2 : 1;
            return room.currentPlayer;
        }
        return null;
    }

    /**
     * Record game result and clean up
     */
    endGame(roomId, winnerSocketId) {
        const room = this.activeGames[roomId];
        if (!room) return null;

        room.state = 'FINISHED';

        const winner = room.player1.socketId === winnerSocketId ? room.player1 : room.player2;
        const loser = room.player1.socketId === winnerSocketId ? room.player2 : room.player1;

        const result = {
            roomId,
            winner,
            loser,
            pot: room.pot,
            stake: room.stake
        };

        // Clean up
        delete this.playerRooms[room.player1.socketId];
        delete this.playerRooms[room.player2.socketId];
        delete this.activeGames[roomId];

        // Clear any disconnect timeout
        if (room.disconnectTimeout) {
            clearTimeout(room.disconnectTimeout);
        }

        return result;
    }

    /**
     * Handle player disconnect
     * @returns opponent socketId if in active game
     */
    handleDisconnect(socketId) {
        // Check if in queue
        this.leaveQueue(socketId);

        // Check if in active game
        const room = this.getRoomByPlayer(socketId);
        if (room) {
            const opponentSocketId = this.getOpponentSocketId(socketId);
            const playerNum = this.getPlayerNumber(socketId);

            room.disconnectedPlayer = playerNum;

            return {
                inGame: true,
                roomId: room.roomId,
                opponentSocketId,
                disconnectedPlayer: playerNum
            };
        }

        return { inGame: false };
    }

    /**
     * Handle player reconnect
     */
    handleReconnect(oldSocketId, newSocketId, phone) {
        // Find room by phone number
        for (const roomId in this.activeGames) {
            const room = this.activeGames[roomId];

            if (room.player1.phone === phone) {
                room.player1.socketId = newSocketId;
                this.playerRooms[newSocketId] = roomId;
                delete this.playerRooms[oldSocketId];
                room.disconnectedPlayer = null;

                if (room.disconnectTimeout) {
                    clearTimeout(room.disconnectTimeout);
                    room.disconnectTimeout = null;
                }

                return { reconnected: true, room, playerNumber: 1 };
            }

            if (room.player2.phone === phone) {
                room.player2.socketId = newSocketId;
                this.playerRooms[newSocketId] = roomId;
                delete this.playerRooms[oldSocketId];
                room.disconnectedPlayer = null;

                if (room.disconnectTimeout) {
                    clearTimeout(room.disconnectTimeout);
                    room.disconnectTimeout = null;
                }

                return { reconnected: true, room, playerNumber: 2 };
            }
        }

        return { reconnected: false };
    }

    /**
     * Get queue status for a stake level
     */
    getQueueStatus(stake) {
        const queue = this.queues[stake] || [];
        return {
            stake,
            playersWaiting: queue.length
        };
    }

    /**
     * Get all active games (for admin/debug)
     */
    getActiveGames() {
        return Object.values(this.activeGames).map(room => ({
            roomId: room.roomId,
            player1: room.player1.username,
            player2: room.player2.username,
            stake: room.stake,
            state: room.state,
            currentPlayer: room.currentPlayer
        }));
    }
}

// Singleton instance
const matchmaking = new Matchmaking();

module.exports = matchmaking;
