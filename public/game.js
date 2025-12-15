/**
 * Mobile 8-Ball Pool Game Engine
 */

const CONSTANTS = {
    TABLE_RATIO: 1.8,
    BALL_RADIUS_RATIO: 0.02,
    FRICTION: 0.99,
    WALL_BOUNCE: 0.7,
    POCKET_RADIUS_RATIO: 0.035,
    MAX_POWER: 40
};

/**
 * Multiplayer Manager - Handles Socket.IO connection and game events
 */
class MultiplayerManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.isInQueue = false;
        this.isInGame = false;
        this.roomId = null;
        this.playerNumber = null; // 1 or 2
        this.opponent = null;
        this.currentPlayer = 1;
        this.stake = 0;
        this.pot = 0;
    }

    /**
     * Connect to Socket.IO server
     */
    connect() {
        if (this.socket && this.isConnected) return;

        // Use Socket.IO client from CDN (loaded in HTML)
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('[MP] Connected to server');
            this.isConnected = true;
            this.updateUI();

            // Authenticate with user info
            if (window.wallet && window.wallet.phone) {
                this.socket.emit('auth', {
                    phone: window.wallet.phone,
                    username: window.wallet.username
                });
            }
        });

        this.socket.on('disconnect', () => {
            console.log('[MP] Disconnected from server');
            this.isConnected = false;
            this.updateUI();
        });

        // Matchmaking events
        this.socket.on('queue:waiting', (data) => {
            console.log('[MP] In queue, position:', data.position);
            this.isInQueue = true;
            this.showMatchmakingModal(data.position);
        });

        this.socket.on('queue:left', () => {
            console.log('[MP] Left queue');
            this.isInQueue = false;
            this.hideMatchmakingModal();
        });

        this.socket.on('queue:error', (data) => {
            console.error('[MP] Queue error:', data.message);
            alert(data.message);
            this.hideMatchmakingModal();
        });

        // Match found!
        this.socket.on('match:found', (data) => {
            console.log('[MP] Match found!', data);
            this.isInQueue = false;
            this.isInGame = true;
            this.roomId = data.roomId;
            this.playerNumber = data.playerNumber;
            this.opponent = data.opponent;
            this.stake = data.stake;
            this.pot = data.pot;
            this.currentPlayer = 1;

            this.hideMatchmakingModal();
            this.startMultiplayerGame();
        });

        // Game events
        this.socket.on('game:start', (data) => {
            console.log('[MP] Game starting!', data);
            this.currentPlayer = data.currentPlayer;
            if (gameInstance) {
                gameInstance.currentPlayer = data.currentPlayer;
                gameInstance.updateUI();
            }
        });

        this.socket.on('opponent:shot', (data) => {
            console.log('[MP] Opponent shot:', data);
            if (gameInstance && gameInstance.isMultiplayer) {
                gameInstance.receiveOpponentShot(data.angle, data.power);
            }
        });

        this.socket.on('game:turn-change', (data) => {
            console.log('[MP] Turn change:', data);
            this.currentPlayer = data.currentPlayer;
            if (gameInstance) {
                gameInstance.currentPlayer = data.currentPlayer;
                gameInstance.state = 'AIMING';
                gameInstance.updateUI();

                if (data.foul) {
                    gameInstance.showTemporaryMessage('FOUL! Ball in hand');
                }
            }
            // Update turn indicator
            this.updateTurnIndicator();
        });

        this.socket.on('game:result', (data) => {
            console.log('[MP] Game result:', data);
            this.isInGame = false;
            this.hideOpponentInfo();
            if (gameInstance) {
                const didWin = data.winnerNumber === this.playerNumber;
                gameInstance.gameOver(didWin ? this.playerNumber : (this.playerNumber === 1 ? 2 : 1));
            }
            // Refresh wallet balance
            window.wallet.refresh();
        });

        this.socket.on('opponent-disconnected', (data) => {
            console.log('[MP] Opponent disconnected, timeout:', data.timeout);
            this.showOpponentDisconnectedModal(data.timeout);
        });

        this.socket.on('opponent-reconnected', () => {
            console.log('[MP] Opponent reconnected');
            this.hideOpponentDisconnectedModal();
        });

        this.socket.on('game:opponent-timeout', (data) => {
            console.log('[MP] Opponent timed out, you win!');
            this.isInGame = false;
            alert(`Opponent left the game. You win ${data.pot} coins!`);
            window.wallet.refresh();
            showPage('home-page');
        });

        this.socket.on('game:opponent-forfeit', (data) => {
            console.log('[MP] Opponent forfeited');
            this.isInGame = false;
            alert(`Opponent forfeited. You win ${data.pot} coins!`);
            window.wallet.refresh();
            showPage('home-page');
        });

        this.socket.on('game:you-forfeit', () => {
            console.log('[MP] You forfeited');
            this.isInGame = false;
            showPage('home-page');
        });

        this.socket.on('error', (data) => {
            console.error('[MP] Error:', data.message);
        });
    }

    /**
     * Join matchmaking queue
     */
    joinQueue(stake) {
        if (!this.isConnected) {
            alert('Not connected to server. Please refresh.');
            return;
        }
        this.stake = stake;
        this.socket.emit('queue:join', { stake });
        this.showMatchmakingModal(0);
    }

    /**
     * Leave matchmaking queue
     */
    leaveQueue() {
        if (this.socket) {
            this.socket.emit('queue:leave');
        }
        this.isInQueue = false;
        this.hideMatchmakingModal();
    }

    /**
     * Send shot to server
     */
    sendShot(angle, power) {
        if (this.socket && this.isInGame) {
            this.socket.emit('game:shot', { angle, power });
        }
    }

    /**
     * Notify server shot is complete
     */
    sendShotComplete(pottedBalls, foul, ballState) {
        if (this.socket && this.isInGame) {
            this.socket.emit('game:shot-complete', { pottedBalls, foul, ballState });
        }
    }

    /**
     * Send game over to server
     */
    sendGameOver(winnerNumber) {
        if (this.socket && this.isInGame) {
            this.socket.emit('game:over', { winner: winnerNumber });
        }
    }

    /**
     * Forfeit current game
     */
    forfeit() {
        if (this.socket && this.isInGame) {
            this.socket.emit('game:forfeit');
        }
    }

    /**
     * Notify server this player is ready
     */
    sendReady() {
        if (this.socket && this.isInGame) {
            this.socket.emit('game:ready');
        }
    }

    /**
     * Start multiplayer game
     */
    startMultiplayerGame() {
        showPage('game-page');

        if (!gameInstance) {
            gameInstance = new Game();
        }

        gameInstance.isMultiplayer = true;
        gameInstance.myPlayerNumber = this.playerNumber;
        gameInstance.opponentInfo = this.opponent;
        gameInstance.stake = this.stake;
        gameInstance.pot = this.pot;
        gameInstance.currentPlayer = 1;
        gameInstance.resetGame();
        gameInstance.start();
        gameInstance.updateUI();

        // Show opponent info
        this.showOpponentInfo();
        this.updateTurnIndicator();

        // Notify server we're ready
        this.sendReady();
    }

    /**
     * Show opponent info display
     */
    showOpponentInfo() {
        const opponentInfoEl = document.getElementById('opponent-info');
        const opponentNameEl = document.getElementById('opponent-name');

        if (opponentInfoEl && opponentNameEl && this.opponent) {
            opponentNameEl.textContent = this.opponent.username;
            opponentInfoEl.classList.remove('hidden');
        }
    }

    /**
     * Hide opponent info display
     */
    hideOpponentInfo() {
        const opponentInfoEl = document.getElementById('opponent-info');
        if (opponentInfoEl) {
            opponentInfoEl.classList.add('hidden');
        }
    }

    /**
     * Update turn indicator
     */
    updateTurnIndicator() {
        const turnIndicatorEl = document.getElementById('turn-indicator');
        if (!turnIndicatorEl) return;

        const isMyTurn = this.isMyTurn();
        turnIndicatorEl.textContent = isMyTurn ? 'YOUR TURN' : 'WAITING...';
        turnIndicatorEl.className = 'turn-indicator ' + (isMyTurn ? 'my-turn' : 'their-turn');
    }

    /**
     * Check if it's this player's turn
     */
    isMyTurn() {
        return this.currentPlayer === this.playerNumber;
    }

    // UI Helpers
    showMatchmakingModal(position) {
        let modal = document.getElementById('matchmaking-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'matchmaking-modal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <h2><i class="ph ph-magnifying-glass"></i> Finding Opponent</h2>
                    <p id="matchmaking-status">Searching for players...</p>
                    <div class="matchmaking-spinner"></div>
                    <button id="btn-cancel-queue" class="danger">Cancel</button>
                </div>
            `;
            document.getElementById('app').appendChild(modal);
            document.getElementById('btn-cancel-queue').addEventListener('click', () => {
                this.leaveQueue();
            });
        }
        document.getElementById('matchmaking-status').textContent =
            position > 0 ? `Position in queue: ${position}` : 'Searching for players...';
        modal.classList.remove('hidden');
    }

    hideMatchmakingModal() {
        const modal = document.getElementById('matchmaking-modal');
        if (modal) modal.classList.add('hidden');
    }

    showOpponentDisconnectedModal(timeout) {
        let modal = document.getElementById('opponent-disconnected-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'opponent-disconnected-modal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <h2><i class="ph ph-wifi-slash"></i> Opponent Disconnected</h2>
                    <p>Waiting for opponent to reconnect...</p>
                    <p id="disconnect-timer">Time remaining: ${timeout}s</p>
                </div>
            `;
            document.getElementById('app').appendChild(modal);
        }
        modal.classList.remove('hidden');

        // Countdown timer
        let remaining = timeout;
        const timerEl = document.getElementById('disconnect-timer');
        const interval = setInterval(() => {
            remaining--;
            if (timerEl) timerEl.textContent = `Time remaining: ${remaining}s`;
            if (remaining <= 0) clearInterval(interval);
        }, 1000);
    }

    hideOpponentDisconnectedModal() {
        const modal = document.getElementById('opponent-disconnected-modal');
        if (modal) modal.classList.add('hidden');
    }

    updateUI() {
        // Update connection status indicator if exists
        const indicator = document.getElementById('connection-status');
        if (indicator) {
            indicator.textContent = this.isConnected ? 'Online' : 'Offline';
            indicator.className = this.isConnected ? 'status-online' : 'status-offline';
        }
    }
}

// Global multiplayer manager instance
let multiplayer = null;


class Wallet {
    constructor() {
        this.balance = 0;
        this.phone = localStorage.getItem('user_phone');
        this.updateUI();
        if (this.phone) {
            this.refresh();
        } else {
            this.showLogin();
        }
    }

    showLogin() {
        document.getElementById('auth-container').classList.remove('hidden');
    }

    async login(identifier, password) {
        try {
            console.log("Attempting login with:", identifier);
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, password })
            });

            if (!res.ok) {
                const errJson = await res.json();
                throw new Error(errJson.error || "Login failed");
            }

            const data = await res.json();

            if (data.user) {
                this.updateLocalUser(data.user);
                this.updateUI();

                // Add slight Delay to ensure transition
                setTimeout(() => {
                    showPage('home-page');
                    // document.getElementById('auth-container').classList.add('hidden'); // handled by showPage? no its a modal
                    document.getElementById('auth-container').classList.add('hidden');
                }, 500);

                return true;
            }
        } catch (e) {
            console.error("Login Exception:", e);
            document.getElementById('auth-error').textContent = e.message;
            document.getElementById('auth-error').classList.remove('hidden');
        }
        return false;
    }

    updateLocalUser(user) {
        this.phone = user.phone_number;
        this.balance = user.balance;
        this.username = user.username;
        this.wins = user.wins || 0;
        this.losses = user.losses || 0;
        localStorage.setItem('user_phone', this.phone);
    }

    logout() {
        this.phone = null;
        this.balance = 0;
        localStorage.removeItem('user_phone');
        showPage('home-page'); // or reload
        // Show login modal
        document.getElementById('auth-container').classList.remove('hidden');
        // Reset tabs
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelector('button[data-tab="login"]').classList.add('active');
        document.getElementById('tab-login').classList.add('active');
    }

    async register(phone, password, username) {
        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, password, username })
            });

            if (res.ok) {
                return { success: true };
            } else {
                const err = await res.json();
                return { success: false, message: err.error };
            }
        } catch (e) {
            return { success: false, message: "Network error" };
        }
    }

    async refresh() {
        if (!this.phone) return false;
        try {
            const res = await fetch(`/api/balance/${this.phone}`);
            if (!res.ok) {
                console.log('[Wallet] Refresh failed - API error');
                return false;
            }
            const data = await res.json();
            if (data.balance !== undefined) {
                this.updateLocalUser({
                    phone_number: this.phone,
                    balance: data.balance,
                    username: data.username,
                    wins: data.wins,
                    losses: data.losses
                });
                this.updateUI();
                console.log('[Wallet] Session restored for', this.phone);
                return true;
            }
            return false;
        } catch (e) {
            console.error('[Wallet] Refresh error:', e);
            return false;
        }
    }

    updateUI() {
        const balEls = ['home-balance', 'unique-wallet-balance', 'modal-balance'];
        balEls.forEach(id => {
            let el = document.getElementById(id);
            if (el) el.textContent = this.balance;
        });

        const phoneDisplay = document.getElementById('user-phone-display');
        if (phoneDisplay && this.phone) phoneDisplay.textContent = this.phone;

        // Profile UI
        const elUsername = document.getElementById('profile-username');
        if (elUsername) elUsername.textContent = this.username || "Player";

        const elWins = document.getElementById('profile-wins');
        if (elWins) elWins.textContent = this.wins || 0;

        const elLosses = document.getElementById('profile-losses');
        if (elLosses) elLosses.textContent = this.losses || 0;

        const elWalletPhone = document.getElementById('wallet-phone');
        if (elWalletPhone) elWalletPhone.textContent = this.phone || "---";
    }

    canAfford(amount) {
        return this.balance >= amount;
    }

    async deduct(amount) {
        if (!this.canAfford(amount)) return false;

        try {
            const res = await fetch('/api/deduct', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: this.phone, amount })
            });
            const data = await res.json();

            if (data.success) {
                this.balance = data.newBalance; // reliable server balance
                this.updateUI();
                return true;
            }
        } catch (e) {
            console.error(e);
        }
        return false;
    }

    async add(amount) {
        // In a real app, the server would handle this securely after game validation
        try {
            const res = await fetch('/api/win', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: this.phone, amount })
            });
            if (res.ok) {
                this.wins = (this.wins || 0) + 1; // local update
                this.refresh(); // get updated balance
            }
        } catch (e) { console.error(e); }
    }

    async recordLoss() {
        try {
            const res = await fetch('/api/loss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: this.phone })
            });
            if (res.ok) {
                this.losses = (this.losses || 0) + 1; // local update
                this.updateUI();
            }
        } catch (e) { console.error(e); }
    }

    async updateProfile(username, avatar) {
        try {
            const res = await fetch('/api/profile/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: this.phone, username, avatar_url: avatar })
            });
            if (res.ok) {
                this.username = username;
                // this.avatar = avatar; // if we were storing it
                this.updateUI();
                return true;
            }
        } catch (e) { console.error(e); }
        return false;
    }

    async deleteAccount() {
        if (!confirm("Are you sure you want to delete your account? This cannot be undone.")) return;

        try {
            const res = await fetch(`/api/profile/${this.phone}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                alert("Account deleted.");
                this.logout();
            } else {
                alert("Failed to delete account.");
            }
        } catch (e) {
            console.error(e);
            alert("Network error.");
        }
    }

    async triggerSTK(amount) {
        try {
            const res = await fetch('/api/deposit/stk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: this.phone, amount })
            });
            const data = await res.json();
            return data.success;
        } catch (e) { console.error(e); }
        return false;
    }

    async requestWithdrawal(amount) {
        try {
            const res = await fetch('/api/withdraw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: this.phone, amount })
            });

            const data = await res.json();

            if (res.ok) {
                this.refresh();
                return { success: true, message: data.message };
            } else {
                return { success: false, message: data.error };
            }
        } catch (e) {
            console.error(e);
            return { success: false, message: e.message };
        }
    }

    async getHistory() {
        try {
            const res = await fetch(`/api/transactions/${this.phone}`);
            if (res.ok) {
                return await res.json();
            }
        } catch (e) { console.error(e); }
        return [];
    }
}


class Vector {
    constructor(x, y) { this.x = x; this.y = y; }
    add(v) { return new Vector(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vector(this.x - v.x, this.y - v.y); }
    mult(n) { return new Vector(this.x * n, this.y * n); }
    mag() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    normalize() { let m = this.mag(); return m === 0 ? new Vector(0, 0) : new Vector(this.x / m, this.y / m); }
    dist(v) { return Math.sqrt(Math.pow(this.x - v.x, 2) + Math.pow(this.y - v.y, 2)); }
    dot(v) { return this.x * v.x + this.y * v.y; }
}

class Ball {
    constructor(id, x, y, radius, color, type) {
        this.id = id;
        this.pos = new Vector(x, y);
        this.vel = new Vector(0, 0);
        this.radius = radius;
        this.color = color;
        this.type = type; // 'solid', 'stripe', 'cue', 'eight'
        this.potted = false;

        // Rolling Simulation
        this.rotation = new Vector(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);

    }

    update() {
        if (this.potted) return;
        this.pos = this.pos.add(this.vel);
        this.vel = this.vel.mult(CONSTANTS.FRICTION);

        // Update Rotation for visuals
        // Simple approximation: rotate based on velocity
        this.rotation.x += this.vel.x * 0.1;
        this.rotation.y += this.vel.y * 0.1;

        if (this.vel.mag() < 0.05) this.vel = new Vector(0, 0);
    }

    draw(ctx) {
        if (this.potted) return;

        // Drop Shadow
        ctx.beginPath();
        ctx.arc(this.pos.x + this.radius * 0.15, this.pos.y + this.radius * 0.15, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        // Ball Rendering
        const drawSphere = (color) => {
            const grad = ctx.createRadialGradient(
                this.pos.x - this.radius * 0.3, this.pos.y - this.radius * 0.3, this.radius * 0.1,
                this.pos.x, this.pos.y, this.radius
            );
            grad.addColorStop(0, 'white');
            grad.addColorStop(0.2, color);
            grad.addColorStop(0.9, color); // Keep color pure near edge
            grad.addColorStop(1, 'rgba(0,0,0,0.4)'); // Darken edge for 3D effect
            return grad;
        };

        if (this.type === 'stripe') {
            // Base White
            ctx.beginPath();
            ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = drawSphere('#fff');
            ctx.fill();

            // Stripe
            ctx.save();
            ctx.beginPath();
            // Create a band clip
            ctx.rect(this.pos.x - this.radius, this.pos.y - this.radius * 0.5, this.radius * 2, this.radius);
            ctx.clip();

            ctx.beginPath();
            ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = drawSphere(this.color);
            ctx.fill();
            ctx.restore();
        } else if (this.type === 'cue') {
            ctx.beginPath();
            ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = drawSphere('#ffffee'); // Slightly off-white for cue ball
            ctx.fill();
        } else if (this.type === 'eight') {
            ctx.beginPath();
            ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = drawSphere('black');
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = drawSphere(this.color);
            ctx.fill();
        }

        // Shine/Gloss
        ctx.beginPath();
        ctx.arc(this.pos.x - this.radius * 0.3, this.pos.y - this.radius * 0.3, this.radius * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fill();

        // Number Circle
        if (this.id !== 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.beginPath();
            ctx.arc(this.pos.x, this.pos.y, this.radius * 0.45, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${this.radius * 0.5}px sans-serif`;
            ctx.fillText(this.id, this.pos.x, this.pos.y);
        }
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Game State
        this.state = 'AIMING'; // AIMING, MOVING, GAMEOVER
        this.currentPlayer = 1;
        this.playerGroups = { 1: null, 2: null }; // 'solid', 'stripe'
        this.pottedThisTurn = [];
        this.messageEl = document.getElementById('game-message');
        this.messageArea = document.getElementById('message-area');
        this.p1Score = document.getElementById('p1-score');
        this.p2Score = document.getElementById('p2-score');
        this.potDisplay = document.getElementById('game-pot');
        this.stake = 0;
        this.pot = 0;
        this.timerEl = document.getElementById('timer');
        this.turnTime = 30;
        this.currentTurnTime = 30;
        this.lastTime = Date.now();
        this.timerActive = false;

        // Multiplayer State
        this.isMultiplayer = false;
        this.myPlayerNumber = 1;
        this.opponentInfo = null;

        // Physics State
        this.balls = [];
        this.pockets = [];
        this.cueBall = null;
        this.tableRect = { x: 0, y: 0, w: 0, h: 0 };

        // Input State
        this.mousePos = new Vector(0, 0);
        this.isDragging = false;
        this.dragStart = new Vector(0, 0);

        // High-Fidelity Graphics State
        this.textures = { felt: null, wood: null };
        this.generateTextures();
        this.shotPower = 0; // Current animated power
        this.animationState = 'IDLE'; // IDLE, ANIMATING_SHOT

        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Controls
        this.setupInput();
        document.getElementById('reset-btn').addEventListener('click', () => this.resetGame());

        this.isRunning = true;

        this.loop();
    }

    generateTextures() {
        // Felt Texture
        const fCan = document.createElement('canvas');
        fCan.width = 100;
        fCan.height = 100;
        const fCtx = fCan.getContext('2d');
        // Base Green
        fCtx.fillStyle = '#2c8c45';
        fCtx.fillRect(0, 0, 100, 100);
        // Noise
        for (let i = 0; i < 500; i++) {
            fCtx.fillStyle = `rgba(255,255,255,${Math.random() * 0.1})`;
            fCtx.fillRect(Math.random() * 100, Math.random() * 100, 2, 2);
            fCtx.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
            fCtx.fillRect(Math.random() * 100, Math.random() * 100, 2, 2);
        }
        this.textures.felt = this.ctx.createPattern(fCan, 'repeat');

        // Wood Texture
        const wCan = document.createElement('canvas');
        wCan.width = 100;
        wCan.height = 100;
        const wCtx = wCan.getContext('2d');
        wCtx.fillStyle = '#5d4037';
        wCtx.fillRect(0, 0, 100, 100);
        // Grain
        for (let i = 0; i < 20; i++) {
            wCtx.strokeStyle = `rgba(0,0,0,${Math.random() * 0.2})`;
            wCtx.lineWidth = Math.random() * 2 + 1;
            wCtx.beginPath();
            wCtx.moveTo(0, Math.random() * 100);
            wCtx.bezierCurveTo(30, Math.random() * 100, 70, Math.random() * 100, 100, Math.random() * 100);
            wCtx.stroke();
        }
        this.textures.wood = this.ctx.createPattern(wCan, 'repeat');
    }

    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.lastTime = Date.now();
            this.loop();
        }
    }

    stop() {
        this.isRunning = false;
    }

    setupInput() {
        const getPos = (e) => {
            if (e.touches) return new Vector(e.touches[0].clientX, e.touches[0].clientY);
            return new Vector(e.clientX, e.clientY);
        };

        const start = (e) => {
            if (this.state !== 'AIMING') return;

            // In multiplayer, only allow input if it's my turn
            if (this.isMultiplayer && this.currentPlayer !== this.myPlayerNumber) {
                return;
            }

            let p = getPos(e);
            this.mousePos = p;

            // Allow aiming from anywhere, but check logic if needed
            if (this.cueBall && !this.cueBall.potted) {
                this.isDragging = true;
                this.dragStart = p;
                if (!this.timerActive && this.state === 'AIMING') {
                    this.timerActive = true;
                    this.lastTime = Date.now();
                }
            }
        };

        const move = (e) => {
            let p = getPos(e);
            this.mousePos = p;
        };

        const end = (e) => {
            if (this.isDragging && this.state === 'AIMING') {
                // In multiplayer, only allow shot if it's my turn
                if (this.isMultiplayer && this.currentPlayer !== this.myPlayerNumber) {
                    this.isDragging = false;
                    return;
                }

                let vector = this.dragStart.sub(this.mousePos);
                let power = vector.mag();

                if (power > 10) {
                    let dir = vector.normalize();
                    let shotPower = Math.min(power * 0.15, CONSTANTS.MAX_POWER);

                    // Calculate angle for multiplayer sync
                    let angle = Math.atan2(dir.y, dir.x);

                    // Send shot to server in multiplayer
                    if (this.isMultiplayer && multiplayer) {
                        multiplayer.sendShot(angle, shotPower);
                    }

                    this.cueBall.vel = dir.mult(shotPower);
                    this.state = 'MOVING';
                    this.pottedThisTurn = [];
                }
            }
            this.isDragging = false;
        };

        this.canvas.addEventListener('mousedown', start);
        this.canvas.addEventListener('mousemove', move);
        window.addEventListener('mouseup', end);
        this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); start(e); }, { passive: false });
        this.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); move(e); }, { passive: false });
        window.addEventListener('touchend', end);
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        let screenRatio = this.canvas.width / this.canvas.height;
        let w, h;

        if (screenRatio > CONSTANTS.TABLE_RATIO) {
            h = this.canvas.height * 0.9;
            w = h * CONSTANTS.TABLE_RATIO;
        } else {
            w = this.canvas.width * 0.9;
            h = w / CONSTANTS.TABLE_RATIO;
        }

        this.tableRect = {
            x: (this.canvas.width - w) / 2,
            y: (this.canvas.height - h) / 2,
            w: w,
            h: h
        };

        this.initPockets();
        if (this.balls.length === 0) this.resetGame();
    }

    initPockets() {
        this.pockets = [];
        let r = this.tableRect.w * CONSTANTS.POCKET_RADIUS_RATIO;
        let corners = [[0, 0], [0.5, 0], [1, 0], [0, 1], [0.5, 1], [1, 1]];
        corners.forEach(c => {
            this.pockets.push({
                pos: new Vector(this.tableRect.x + this.tableRect.w * c[0], this.tableRect.y + this.tableRect.h * c[1]),
                radius: r
            });
        });
    }

    resetGame() {
        this.state = 'AIMING';
        this.currentPlayer = 1;
        this.playerGroups = { 1: null, 2: null };
        this.pottedThisTurn = [];
        if (this.messageArea) this.messageArea.classList.add('hidden');
        if (this.potDisplay) this.potDisplay.textContent = this.pot;
        this.updateUI();

        this.balls = [];
        let r = this.tableRect.w * CONSTANTS.BALL_RADIUS_RATIO;

        // Cue Ball
        this.cueBall = new Ball(0, this.tableRect.x + this.tableRect.w * 0.25, this.tableRect.y + this.tableRect.h / 2, r, '#fff', 'cue');
        this.balls.push(this.cueBall);

        // Rack
        let startX = this.tableRect.x + this.tableRect.w * 0.75;
        let startY = this.tableRect.y + this.tableRect.h / 2;
        let rowCount = 5;
        let ballId = 1;

        let colors = ['yellow', 'blue', 'red', 'purple', 'orange', 'green', 'maroon', 'black', 'gold', 'blue', 'red', 'purple', 'orange', 'green', 'maroon'];

        for (let row = 0; row < rowCount; row++) {
            for (let col = 0; col <= row; col++) {
                let x = startX + (row * (r * 1.8));
                let y = startY - (row * r) + (col * (r * 2));
                y += (Math.random() - 0.5);

                let currentId = ballId++;
                let color = colors[currentId - 1];
                let type = currentId === 8 ? 'eight' : (currentId < 8 ? 'solid' : 'stripe');

                this.balls.push(new Ball(currentId, x, y, r, color, type));
            }
        }
    }

    respawnCueBall() {
        this.cueBall.potted = false;
        this.cueBall.vel = new Vector(0, 0);
        this.cueBall.pos = new Vector(this.tableRect.x + this.tableRect.w * 0.25, this.tableRect.y + this.tableRect.h / 2);
    }

    update() {
        if (this.state === 'GAMEOVER') return;

        let steps = 4;
        for (let s = 0; s < steps; s++) {
            this.balls.forEach(b => {
                b.update();
                this.checkWalls(b);
                this.checkPockets(b);
            });

            for (let i = 0; i < this.balls.length; i++) {
                for (let j = i + 1; j < this.balls.length; j++) {
                    if (!this.balls[i].potted && !this.balls[j].potted) {
                        this.resolveCollision(this.balls[i], this.balls[j]);
                    }
                }
            }
        }

        // Timer Logic
        if (this.state === 'AIMING') {
            this.updateUI(); // Ensure UI updates
            if (this.timerActive) {
                let now = Date.now();
                let delta = (now - this.lastTime) / 1000;
                this.lastTime = now;

                this.currentTurnTime -= delta;
                if (this.currentTurnTime <= 0) {
                    this.currentPlayer = 3 - this.currentPlayer;
                    this.currentTurnTime = this.turnTime;
                    this.timerActive = false;
                    this.updateUI();
                }
            } else {
                this.lastTime = Date.now();
            }
        } else {
            this.lastTime = Date.now();
        }

        if (this.state === 'MOVING') {
            if (!this.balls.some(b => b.vel.mag() > 0 && !b.potted)) {
                this.handleTurnEnd();
            }
        }
    }

    handleTurnEnd() {
        this.state = 'AIMING';

        let cuePotted = this.pottedThisTurn.find(b => b.id === 0);
        let eightPotted = this.pottedThisTurn.find(b => b.id === 8);
        let others = this.pottedThisTurn.filter(b => b.id !== 0 && b.id !== 8);

        let foul = !!cuePotted;
        let switchTurn = true;

        if (cuePotted) {
            this.respawnCueBall();
        }

        if (eightPotted) {
            let myGroup = this.playerGroups[this.currentPlayer];
            let hasOwnBallsLeft = false;
            if (myGroup) {
                hasOwnBallsLeft = this.balls.some(b => b.type === myGroup && !b.potted && b.id !== 8);
            } else {
                hasOwnBallsLeft = true;
            }

            if (foul || hasOwnBallsLeft) {
                this.gameOver(3 - this.currentPlayer);
            } else {
                this.gameOver(this.currentPlayer);
            }
            return;
        }

        if (this.playerGroups[1] === null && others.length > 0 && !foul) {
            let first = others[0];
            this.playerGroups[this.currentPlayer] = first.type;
            this.playerGroups[3 - this.currentPlayer] = (first.type === 'solid' ? 'stripe' : 'solid');
            switchTurn = false;
        }
        else if (!foul) {
            if (others.length > 0) {
                let myGroup = this.playerGroups[this.currentPlayer];
                if (!myGroup) {
                    switchTurn = false;
                } else {
                    let pottedOwn = others.some(b => b.type === myGroup);
                    if (pottedOwn) switchTurn = false;
                }
            }
        }

        if (switchTurn) {
            this.currentPlayer = 3 - this.currentPlayer;
        }

        this.currentTurnTime = this.turnTime;
        this.timerActive = false;
        this.lastTime = Date.now();

        this.updateUI();
    }

    gameOver(winner) {
        this.state = 'GAMEOVER';
        this.messageEl.textContent = `Player ${winner} Wins!`;
        this.messageEl.style.color = 'lime';

        let prizeMsg = document.getElementById('prize-message');
        if (winner === 1) {
            let winAmount = this.pot * 0.9; // House takes 10%
            winAmount = Math.floor(winAmount); // Ensure integer coins
            window.wallet.add(winAmount);
            prizeMsg.textContent = `You Won ${winAmount} Coins! (House Fee: 10%)`;
        } else {
            window.wallet.recordLoss();
            prizeMsg.textContent = `You Lost ${this.stake} Coins!`;
        }

        this.messageArea.classList.remove('hidden');
    }
    updateUI() {
        if (!this.p1Score || !this.p2Score) return;
        this.p1Score.classList.toggle('active', this.currentPlayer === 1);
        this.p2Score.classList.toggle('active', this.currentPlayer === 2);

        const getLabel = (p) => {
            let g = this.playerGroups[p];
            return `P${p} ${g ? '(' + (g === 'solid' ? 'Solids' : 'Stripes') + ')' : ''}`;
        };

        this.p1Score.textContent = getLabel(1);
        this.p2Score.textContent = getLabel(2);

        if (this.timerEl) {
            this.timerEl.textContent = Math.ceil(this.currentTurnTime);
            if (this.currentTurnTime < 10) this.timerEl.style.color = 'red';
            else this.timerEl.style.color = 'white';
        }
    }

    checkWalls(b) {
        if (b.potted) return;
        let r = b.radius;
        if (b.pos.x - r < this.tableRect.x) { b.pos.x = this.tableRect.x + r; b.vel.x *= -CONSTANTS.WALL_BOUNCE; }
        else if (b.pos.x + r > this.tableRect.x + this.tableRect.w) { b.pos.x = this.tableRect.x + this.tableRect.w - r; b.vel.x *= -CONSTANTS.WALL_BOUNCE; }

        if (b.pos.y - r < this.tableRect.y) { b.pos.y = this.tableRect.y + r; b.vel.y *= -CONSTANTS.WALL_BOUNCE; }
        else if (b.pos.y + r > this.tableRect.y + this.tableRect.h) { b.pos.y = this.tableRect.y + this.tableRect.h - r; b.vel.y *= -CONSTANTS.WALL_BOUNCE; }
    }

    checkPockets(b) {
        if (b.potted) return;
        for (let p of this.pockets) {
            if (b.pos.dist(p.pos) < p.radius) {
                b.potted = true;
                b.vel = new Vector(0, 0);
                this.pottedThisTurn.push(b);
            }
        }
    }

    resolveCollision(b1, b2) {
        let dist = b1.pos.dist(b2.pos);
        if (dist < b1.radius + b2.radius) {
            let n = b2.pos.sub(b1.pos).normalize();
            let overlap = (b1.radius + b2.radius - dist) / 2;
            b1.pos = b1.pos.sub(n.mult(overlap));
            b2.pos = b2.pos.add(n.mult(overlap));

            let relativeVel = b2.vel.sub(b1.vel);
            let velAlongNormal = relativeVel.dot(n);
            if (velAlongNormal > 0) return;

            let j = -(1 + 0.9) * velAlongNormal;
            j /= 2;

            let impulse = n.mult(j);
            b1.vel = b1.vel.sub(impulse);
            b2.vel = b2.vel.add(impulse);
        }
    }

    draw() {
        // Clear screen (using fillRect with bg color for now)
        this.ctx.fillStyle = '#111'; // Darker background
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // --- Table Rendering ---

        // Rails (Wood)
        // Helper to draw beveled wood rail
        const drawRail = (x, y, w, h, isVertical) => {
            let grad = isVertical
                ? this.ctx.createLinearGradient(x, y, x + w, y)
                : this.ctx.createLinearGradient(x, y, x, y + h);

            grad.addColorStop(0, '#3e2723'); // Dark Edge
            grad.addColorStop(0.1, '#5d4037'); // Medium Wood
            grad.addColorStop(0.4, '#8d6e63'); // Highlight
            grad.addColorStop(0.9, '#3e2723'); // Dark Edge

            this.ctx.fillStyle = grad;
            this.ctx.fillRect(x, y, w, h);

            // Inner shadow overlay (where it meets felt)
            // (Simplified: handled in felt rendering logic if needed, or overlay here)
        };

        const railThickness = 25; // Slightly wider rails for visuals
        const outerRect = {
            x: this.tableRect.x - railThickness,
            y: this.tableRect.y - railThickness,
            w: this.tableRect.w + railThickness * 2,
            h: this.tableRect.h + railThickness * 2
        };

        // Draw Full Table Base (Wood)
        this.ctx.fillStyle = '#3e2723';
        this.ctx.fillRect(outerRect.x, outerRect.y, outerRect.w, outerRect.h);

        // Draw Rails individually for lighting effect
        // Top
        drawRail(outerRect.x, outerRect.y, outerRect.w, railThickness, false);
        // Bottom
        drawRail(outerRect.x, outerRect.y + outerRect.h - railThickness, outerRect.w, railThickness, false);
        // Left
        drawRail(outerRect.x, outerRect.y, railThickness, outerRect.h, true);
        // Right
        drawRail(outerRect.x + outerRect.w - railThickness, outerRect.y, railThickness, outerRect.h, true);

        // Felt (Playing Surface) - Inner Shadow
        this.ctx.fillStyle = '#1b5e20'; // Base green
        this.ctx.fillRect(this.tableRect.x, this.tableRect.y, this.tableRect.w, this.tableRect.h);

        // Felt Gradient for lighting (center focus)
        let feltGrad = this.ctx.createRadialGradient(
            this.tableRect.x + this.tableRect.w / 2, this.tableRect.y + this.tableRect.h / 2, this.tableRect.w * 0.2,
            this.tableRect.x + this.tableRect.w / 2, this.tableRect.y + this.tableRect.h / 2, this.tableRect.w * 0.8
        );
        feltGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
        feltGrad.addColorStop(1, 'rgba(0,0,0,0.2)');
        this.ctx.fillStyle = feltGrad;
        this.ctx.fillRect(this.tableRect.x, this.tableRect.y, this.tableRect.w, this.tableRect.h);

        // Pockets
        this.pockets.forEach(p => {
            let pGrad = this.ctx.createRadialGradient(p.pos.x, p.pos.y, p.radius * 0.2, p.pos.x, p.pos.y, p.radius);
            pGrad.addColorStop(0, '#000');
            pGrad.addColorStop(0.8, '#1a1a1a');
            pGrad.addColorStop(1, '#333');

            this.ctx.fillStyle = pGrad;
            this.ctx.beginPath();
            this.ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
            this.ctx.fill();

            // Pocket Bevel/Rim
            this.ctx.strokeStyle = '#222';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        });

        // Balls
        this.balls.forEach(b => b.draw(this.ctx));

        // Cue Stick
        if (this.isDragging && this.state === 'AIMING' && this.cueBall && !this.cueBall.potted) {
            let vector = this.dragStart.sub(this.mousePos);
            let power = vector.mag();

            this.ctx.save();
            this.ctx.translate(this.cueBall.pos.x, this.cueBall.pos.y);
            this.ctx.rotate(Math.atan2(vector.y, vector.x) + Math.PI);

            // Cue Stick Rendering
            const cueLength = 400;
            const cueWidth = 8;
            const tipLength = 6;
            const ferruleLength = 10;

            const startX = 20 + power * 0.5; // Distance from ball based on pull

            // Main Wood Shaft
            let stickGrad = this.ctx.createLinearGradient(0, -cueWidth / 2, 0, cueWidth / 2);
            stickGrad.addColorStop(0, '#8d6e63');
            stickGrad.addColorStop(0.5, '#efebe9'); // Highlight
            stickGrad.addColorStop(1, '#6d4c41');

            this.ctx.fillStyle = stickGrad;
            this.ctx.fillRect(startX + tipLength + ferruleLength, -cueWidth / 2, cueLength, cueWidth);

            // Ferrule (White part)
            this.ctx.fillStyle = '#eee';
            this.ctx.fillRect(startX + tipLength, -cueWidth / 2, ferruleLength, cueWidth);

            // Tip (Blue)
            this.ctx.fillStyle = '#0277bd';
            this.ctx.fillRect(startX, -cueWidth / 2, tipLength, cueWidth);

            this.ctx.restore();

            // Calculate Trajectory
            // aimDir is opposite to drag vector (drag is pull back, aim is forward)
            let aimDir = vector.normalize();

            // Calculate simulated hit
            let hit = this.getTrajectory(this.cueBall.pos, aimDir);

            // Draw Trajectory Line
            this.ctx.beginPath();
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.moveTo(this.cueBall.pos.x, this.cueBall.pos.y);
            this.ctx.lineTo(hit.pos.x, hit.pos.y);
            this.ctx.stroke();
            this.ctx.setLineDash([]);

            // Draw Ghost Ball at Impact
            if (hit.type === 'ball') {
                this.ctx.beginPath();
                this.ctx.arc(hit.pos.x, hit.pos.y, this.cueBall.radius, 0, Math.PI * 2);
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                this.ctx.lineWidth = 1;
                this.ctx.stroke();

                // Draw Short Impact Line (Direction of target ball)
                // The target ball will move along the normal (from hit pos to target center)
                let normal = hit.target.pos.sub(hit.pos).normalize();

                this.ctx.beginPath();
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                this.ctx.lineWidth = 2;
                this.ctx.moveTo(hit.target.pos.x, hit.target.pos.y);
                this.ctx.lineTo(hit.target.pos.x + normal.x * 40, hit.target.pos.y + normal.y * 40);
                this.ctx.stroke();
            }

            let pPercent = Math.min(power * 0.15 / CONSTANTS.MAX_POWER, 1) * 100;
            document.getElementById('power-fill').style.width = `${pPercent}%`;
        } else {
            document.getElementById('power-fill').style.width = '0%';
        }
    }

    getTrajectory(startPos, dir) {
        let closestHit = { pos: startPos.add(dir.mult(1000)), type: 'none', dist: 1000 };

        // Check Walls
        // X walls
        if (dir.x !== 0) {
            let t1 = (this.tableRect.x + this.cueBall.radius - startPos.x) / dir.x;
            let t2 = (this.tableRect.x + this.tableRect.w - this.cueBall.radius - startPos.x) / dir.x;
            let t = t1 > 0 ? t1 : t2; // simplified, actually need smallest positive
            if (t1 > 0 && t1 < closestHit.dist) closestHit = { pos: startPos.add(dir.mult(t1)), type: 'wall', dist: t1 };
            if (t2 > 0 && t2 < closestHit.dist) closestHit = { pos: startPos.add(dir.mult(t2)), type: 'wall', dist: t2 };
        }
        // Y walls
        if (dir.y !== 0) {
            let t1 = (this.tableRect.y + this.cueBall.radius - startPos.y) / dir.y;
            let t2 = (this.tableRect.y + this.tableRect.h - this.cueBall.radius - startPos.y) / dir.y;
            if (t1 > 0 && t1 < closestHit.dist) closestHit = { pos: startPos.add(dir.mult(t1)), type: 'wall', dist: t1 };
            if (t2 > 0 && t2 < closestHit.dist) closestHit = { pos: startPos.add(dir.mult(t2)), type: 'wall', dist: t2 };
        }

        // Check Balls
        this.balls.forEach(b => {
            if (b.id === 0 || b.potted) return;

            let f = startPos.sub(b.pos);
            let a = dir.dot(dir);
            let checkB = 2 * f.dot(dir);
            let c = f.dot(f) - (2 * b.radius) * (2 * b.radius);

            let discriminant = checkB * checkB - 4 * a * c;

            if (discriminant >= 0) {
                discriminant = Math.sqrt(discriminant);
                let t1 = (-checkB - discriminant) / (2 * a);
                // t2 is the exit point, we don't care about it usually for impacts

                if (t1 > 0 && t1 < closestHit.dist) {
                    closestHit = {
                        pos: startPos.add(dir.mult(t1)),
                        type: 'ball',
                        dist: t1,
                        target: b
                    };
                }
            }
        });

        return closestHit;
    }

    loop() {
        if (!this.isRunning) return;
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    /**
     * Receive and apply opponent's shot (multiplayer)
     */
    receiveOpponentShot(angle, power) {
        if (this.state !== 'AIMING' || !this.cueBall) return;

        // Calculate direction from angle
        const dir = new Vector(Math.cos(angle), Math.sin(angle));

        // Apply the shot
        this.cueBall.vel = dir.mult(power);
        this.state = 'MOVING';
        this.pottedThisTurn = [];

        console.log('[Game] Applied opponent shot:', { angle, power });
    }

    /**
     * Get serialized ball state for syncing
     */
    getBallState() {
        return this.balls.map(b => ({
            id: b.id,
            x: b.pos.x,
            y: b.pos.y,
            vx: b.vel.x,
            vy: b.vel.y,
            potted: b.potted
        }));
    }

    /**
     * Show a temporary message overlay
     */
    showTemporaryMessage(text, duration = 2000) {
        if (this.messageEl) {
            this.messageEl.textContent = text;
            this.messageArea.classList.remove('hidden');

            setTimeout(() => {
                if (this.state !== 'GAMEOVER') {
                    this.messageArea.classList.add('hidden');
                }
            }, duration);
        }
    }

    /**
     * Check if it's this player's turn (multiplayer)
     */
    isMyTurn() {
        if (!this.isMultiplayer) return true;
        return this.currentPlayer === this.myPlayerNumber;
    }
}

// Navigation & Initialization
let gameInstance = null;
window.wallet = null;

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');

    if (pageId === 'game-page') {
        // Game start is now handled by Stake Modal confirmation
    } else {
        if (gameInstance) gameInstance.stop();
    }
}

async function startGameWithStake(stake) {
    console.log("startGameWithStake called with:", stake);
    // Wait for server deduction first
    try {
        const deducted = await window.wallet.deduct(stake);
        console.log("Deduct result:", deducted);

        if (deducted) {
            showPage('game-page');

            // Pot logic: Player puts stake, Opponent matches it (simulated)
            // So Pot = Stake * 2
            let pot = stake * 2;

            if (!gameInstance) {
                console.log("Creating new Game instance");
                gameInstance = new Game();
            } else {
                console.log("Reusing Game instance");
            }

            gameInstance.stake = stake;
            gameInstance.pot = pot;
            gameInstance.resetGame(); // Reset physics/balls
            console.log("Starting game loop...");
            gameInstance.start();
        } else {
            alert("Transaction Failed or Insufficient Funds (Server Denied)");
        }
    } catch (e) {
        console.error("Error in startGameWithStake:", e);
        alert("Error starting game: " + e.message);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("Game JS Loaded & DOM Ready");
    if (window.location.protocol === 'file:') {
        alert("CRITICAL ERROR:\nYou must run this game from the server.\n\nPlease open 'http://localhost:3000' in your browser.");
        document.body.innerHTML = '<h1 style="color:white;text-align:center;margin-top:20%;">Please open <a href="http://localhost:3000" style="color:#0f0">http://localhost:3000</a></h1>';
        return;
    }

    window.wallet = new Wallet();

    // Initialize multiplayer manager
    multiplayer = new MultiplayerManager();
    multiplayer.connect();

    // ID Checks for new Auth UI
    const authContainer = document.getElementById('auth-container');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabs = document.querySelectorAll('.tab-content');

    // Check for existing session
    const storedPhone = localStorage.getItem('user_phone');
    if (storedPhone) {
        window.wallet.phone = storedPhone;
        window.wallet.refresh().then(success => {
            if (success) {
                authContainer.classList.add('hidden');
                showPage('home-page');
            } else {
                authContainer.classList.remove('hidden');
            }
        });
    } else {
        authContainer.classList.remove('hidden');
    }
});

// Tab Switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class from all
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

        // Activate clicked
        btn.classList.add('active');
        const target = btn.getAttribute('data-tab');
        document.getElementById(`tab-${target}`).classList.add('active');
    });
});

// Login Logic
document.getElementById('btn-login').addEventListener('click', async () => {
    const identifier = document.getElementById('login-identifier').value;
    const pass = document.getElementById('login-pass').value;
    const authError = document.getElementById('auth-error');
    authError.classList.add('hidden');

    if (identifier && pass) {
        if (await window.wallet.login(identifier, pass)) {
            // Login Success - Hide Auth, Show Home
            document.getElementById('auth-container').classList.add('hidden');
            showPage('home-page');
            document.getElementById('game-page').classList.remove('active'); // ensure game hidden
        }
    } else {
        authError.textContent = "Please enter phone/username and password";
        authError.classList.remove('hidden');
    }
});

// Register Button
const btnReg = document.getElementById('btn-register');
if (btnReg) {
    btnReg.addEventListener('click', async () => {
        console.log("Register Button Clicked");
        const phone = document.getElementById('reg-phone').value;
        const username = document.getElementById('reg-username').value;
        const pass = document.getElementById('reg-pass').value;

        const authError = document.getElementById('auth-error');
        authError.classList.add('hidden');

        if (phone && pass) {
            // Attempt Register
            const result = await window.wallet.register(phone, pass, username);
            if (result.success) {
                // Auto Login on success
                if (await window.wallet.login(phone, pass)) {
                    authContainer.classList.add('hidden');
                    showPage('home-page');
                    alert(`Welcome ${username || 'Player'}! Account created.`);
                }
            } else {
                authError.textContent = result.message;
                authError.classList.remove('hidden');
            }
        } else {
            authError.textContent = "Please fill in Phone and Password";
            authError.classList.remove('hidden');
        }
    });
} else {
    console.error("Register Button Not Found!");
}

// Refresh Balance Button
const refreshBtn = document.getElementById('btn-refresh-balance');
if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
        await window.wallet.refresh();
        const toast = document.getElementById('toast');
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 5000);
    });
}

// Navigation Buttons
// Generic Back Button
document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        if (target) showPage(target);
    });
});

// Play Click -> Open Stake Modal
document.getElementById('btn-play-menu').addEventListener('click', async () => {
    // Ensure balance is synced from server before showing modal
    await window.wallet.refresh();
    document.getElementById('modal-balance').textContent = window.wallet.balance;
    document.getElementById('stake-modal').classList.remove('hidden');
});

const btnWallet = document.getElementById('btn-wallet');
if (btnWallet) btnWallet.addEventListener('click', () => showPage('profile-page'));

const btnProfile = document.getElementById('btn-profile');
if (btnProfile) btnProfile.addEventListener('click', () => showPage('profile-page'));

// Make home balance clickable
const homeBalanceDisplay = document.querySelector('.wallet-display');
if (homeBalanceDisplay) {
    homeBalanceDisplay.addEventListener('click', () => {
        showPage('profile-page');
        setTimeout(() => window.showProfileSubView('wallet'), 50); // Slight delay to ensure profile loads
    });
}

const btnTourn = document.getElementById('btn-tournament');
if (btnTourn) {
    btnTourn.addEventListener('click', () => showPage('tournament-page'));
}

// Logout
const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
    btnLogout.addEventListener('click', () => {
        window.wallet.logout();
    });
}

const btnDelete = document.getElementById('btn-delete-account');
if (btnDelete) {
    btnDelete.addEventListener('click', () => {
        window.wallet.deleteAccount();
    });
}

// Profile Sub-View Navigation (Hub & Spoke)
window.showProfileSubView = function (viewName) {
    // Hide all subviews
    document.querySelectorAll('.profile-subview').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('active');
    });

    // Show target
    let targetId = '';
    if (viewName === 'menu') targetId = 'profile-menu-view';
    else if (viewName === 'identity') targetId = 'view-identity';
    else if (viewName === 'wallet') targetId = 'view-wallet';

    const targetEl = document.getElementById(targetId);
    if (targetEl) {
        targetEl.classList.remove('hidden');
        // Small delay to allow display:flex to apply before opacity transition if needed
        setTimeout(() => targetEl.classList.add('active'), 10);
    }
};

// Hook into showPage to reset to menu when opening profile
const originalShowPage = showPage;
showPage = function (pageId) {
    originalShowPage(pageId);
    if (pageId === 'profile-page') {
        window.showProfileSubView('menu');
    }
};

// Transaction History
const btnTrans = document.getElementById('btn-transactions');
if (btnTrans) {
    btnTrans.addEventListener('click', async () => {
        const modal = document.getElementById('transactions-modal');
        const list = document.getElementById('transaction-list');
        modal.classList.remove('hidden');
        list.innerHTML = '<p>Loading...</p>';

        const history = await window.wallet.getHistory();
        list.innerHTML = '';

        if (history.length === 0) {
            list.innerHTML = '<p class="no-data">No transactions found.</p>';
        } else {
            history.forEach(tx => {
                const item = document.createElement('div');
                item.className = 'transaction-item';
                const isPos = tx.amount > 0;
                const date = new Date(tx.created_at).toLocaleDateString();
                const sign = isPos ? '+' : '';
                item.innerHTML = `
                    <div class="tx-left">
                        <div class="tx-type">${tx.type || 'TRANSACTION'}</div>
                        <div class="tx-desc">${tx.description || ''}</div>
                        <div class="tx-date">${date}</div>
                    </div>
                    <div class="tx-right ${isPos ? 'pos' : 'neg'}">
                        ${sign}${tx.amount}
                    </div>
                `;
                list.appendChild(item);
            });
        }
    });
}

// Avatar Mock
const editAvatarBtn = document.querySelector('.edit-avatar-btn');
if (editAvatarBtn) {
    editAvatarBtn.addEventListener('click', () => {
        alert("Avatar upload coming soon!");
    });
}

document.getElementById('btn-tournament').addEventListener('click', () => showPage('tournament-page'));

// --- Top Up Logic ---
const topupModal = document.getElementById('topup-modal');
const topupInput = document.getElementById('topup-amount');
const topupMsg = document.getElementById('topup-message');

document.getElementById('btn-topup-menu').addEventListener('click', () => {
    topupModal.classList.remove('hidden');
    topupMsg.classList.add('hidden');
    topupInput.value = '';
});

document.getElementById('btn-cancel-topup').addEventListener('click', () => topupModal.classList.add('hidden'));

document.getElementById('btn-confirm-topup').addEventListener('click', async () => {
    const val = parseInt(topupInput.value);
    if (!val || val < 10) return alert("Min amount is 10");

    topupMsg.textContent = "Sending STK Push to your phone...";
    topupMsg.classList.remove('hidden');
    topupMsg.style.color = 'yellow';

    const success = await window.wallet.triggerSTK(val);
    if (success) {
        topupMsg.textContent = "Prompt Sent! Check your phone.";
        topupMsg.style.color = 'lime';
        setTimeout(() => {
            topupModal.classList.add('hidden');
            // Auto refresh after presumed payment time
            setTimeout(() => window.wallet.refresh(), 3000);
        }, 2000);
    } else {
        topupMsg.textContent = "Failed to send prompt.";
        topupMsg.style.color = 'red';
    }
});

// --- Withdraw Logic ---
const withdrawModal = document.getElementById('withdraw-modal');
const withdrawInput = document.getElementById('withdraw-amount');
const withdrawMsg = document.getElementById('withdraw-message');

document.getElementById('btn-withdraw-menu').addEventListener('click', () => {
    withdrawModal.classList.remove('hidden');
    withdrawMsg.classList.add('hidden');
    withdrawInput.value = '';
});

document.getElementById('btn-cancel-withdraw').addEventListener('click', () => withdrawModal.classList.add('hidden'));

document.getElementById('btn-confirm-withdraw').addEventListener('click', async () => {
    const val = parseInt(withdrawInput.value);
    if (!val || val < 50) return alert("Min withdrawal is 50");

    withdrawMsg.textContent = "Processing Withdrawal...";
    withdrawMsg.classList.remove('hidden');
    withdrawMsg.style.color = 'yellow';

    const result = await window.wallet.requestWithdrawal(val);
    if (result.success) {
        withdrawMsg.textContent = "Success! Funds sent.";
        withdrawMsg.style.color = 'lime';
        setTimeout(() => withdrawModal.classList.add('hidden'), 2000);
    } else {
        withdrawMsg.textContent = result.message || "Failed.";
        withdrawMsg.style.color = 'red';
    }
});

// Stake Modal Logic
const stakeModal = document.getElementById('stake-modal');
const stakeInput = document.getElementById('stake-input');
const stakeError = document.getElementById('stake-error');

document.getElementById('btn-cancel-stake').addEventListener('click', () => {
    stakeModal.classList.add('hidden');
});

document.getElementById('btn-confirm-stake').addEventListener('click', () => {
    console.log("Confirm Stake Clicked");
    let val = parseInt(stakeInput.value);
    if (isNaN(val) || val < 20) {
        alert("Minimum stake is 20");
        stakeError.textContent = "Minimum stake is 20";
        stakeError.classList.remove('hidden');
        return;
    }
    if (!window.wallet.canAfford(val)) {
        alert(`Insufficient funds! Balance: ${window.wallet.balance}`);
        stakeError.textContent = "Insufficient funds!";
        stakeError.classList.remove('hidden');
        return;
    }

    stakeError.classList.add('hidden');
    stakeModal.classList.add('hidden');

    // Join multiplayer matchmaking queue
    if (multiplayer && multiplayer.isConnected) {
        console.log("Joining multiplayer queue with stake:", val);
        multiplayer.joinQueue(val);
    } else {
        alert("Not connected to server. Please refresh the page.");
    }
});

// Back Buttons
document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        let target = e.target.getAttribute('data-target');
        if (target) showPage(target);
    });
});

// Exit Game Handler (msg area button)
const exitBtn = document.querySelector('#message-area .back-btn');
if (exitBtn) {
    exitBtn.addEventListener('click', () => {
        document.getElementById('message-area').classList.add('hidden');
    });
}

// Pause functionality
const pauseModal = document.getElementById('pause-modal');

const pauseBtn = document.getElementById('pause-btn');
if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
        if (gameInstance && gameInstance.isRunning) {
            gameInstance.stop();
            pauseModal.classList.remove('hidden');
        }
    });
}

const resumeBtn = document.getElementById('resume-btn');
if (resumeBtn) {
    resumeBtn.addEventListener('click', () => {
        if (gameInstance && !gameInstance.isRunning) {
            gameInstance.start();
            pauseModal.classList.add('hidden');
        }
    });
}

const quitBtn = document.getElementById('quit-btn');
if (quitBtn) {
    quitBtn.addEventListener('click', () => {
        pauseModal.classList.add('hidden');
        showPage('home-page');
        // Game is already stopped by pause
    });
}

// Tournament Logic
function setupTournament() {
    console.log("Setting up tournament listeners...");

    // Use a flag to prevent double binding if setup is called multiple times
    if (window._tournamentSetupDone) return;
    window._tournamentSetupDone = true;

    document.querySelectorAll('.tournament-card').forEach(card => {
        const joinBtn = card.querySelector('.btn-join');
        const fee = parseInt(card.getAttribute('data-fee'));
        const status = card.querySelector('.status');
        const tournamentId = 't_' + fee;

        // Poll function
        const pollStatus = () => {
            if (!window.wallet || !window.wallet.phone) return;
            fetch(`/api/tournaments/${tournamentId}/status/${window.wallet.phone}`)
                .then(r => r.json())
                .then(data => {
                    if (data.tournament) {
                        const t = data.tournament;
                        if (data.player) {
                            card.classList.add('registered');
                            if (t.status === 'ACTIVE') {
                                status.textContent = `Tournament Started! Round ${t.current_round}`;
                                status.style.color = 'lime';
                            } else {
                                status.textContent = `Registered! Waiting (${t.current_players}/${t.max_players})`;
                            }
                        } else {
                            status.textContent = `Waiting for players (${t.current_players}/${t.max_players})`;
                            status.style.display = 'block';
                            card.classList.remove('registered');
                        }
                    }
                })
                .catch(err => { console.error("Poll Error:", err); });
        };

        pollStatus();
        setInterval(pollStatus, 5000);

        // Direct Listener (Simpler)
        joinBtn.removeEventListener('click', handleJoin); // Just in case
        joinBtn.addEventListener('click', () => handleJoin(fee, tournamentId, card, pollStatus));
    });
}

function handleJoin(fee, tournamentId, card, pollStatus) {
    console.log(`[DEBUG] Clicked join for fee: ${fee}`);

    // VISUAL DEBUG
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = "Processing Join...";
        toast.classList.remove('hidden');
    }

    if (!window.wallet || !window.wallet.phone) {
        alert("Please login to join tournaments.");
        document.getElementById('auth-container').classList.remove('hidden');
        return;
    }

    // REMOVED CONFIRM FOR DEBUGGING/UX FLUIDITY
    // if (confirm(`Join tournament for ${fee} coins?`)) { 
    console.log(`[DEBUG] Sending Join Request. Phone: ${window.wallet.phone}`);

    fetch('/api/tournaments/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: window.wallet.phone, tournamentId })
    })
        .then(res => res.json())
        .then(result => {
            console.log("[DEBUG] Join Result:", result);
            if (result.success) {
                // alert(result.message || "Joined Successfully!"); // Toast is enough
                if (toast) {
                    toast.textContent = result.message || "Joined Successfully!";
                    setTimeout(() => toast.classList.add('hidden'), 3000);
                }
                card.classList.add('registered');
                window.wallet.refresh();
                pollStatus();
            } else {
                alert("Failed to join: " + (result.error || "Unknown error"));
                if (toast) toast.classList.add('hidden');
            }
        })
        .catch(err => {
            console.error("[DEBUG] Join Error:", err);
            alert("Error joining tournament. Check console.");
            if (toast) toast.classList.add('hidden');
        });
    // }
}

// Ensure setup runs
document.addEventListener('DOMContentLoaded', () => {
    // Wait for wallet to be potentially restored
    setTimeout(setupTournament, 500);
});

// Fallback: If for some reason DOMContentLoaded already fired (e.g. fast load), check readyState
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(setupTournament, 500);
}
