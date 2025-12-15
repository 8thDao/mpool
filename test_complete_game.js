/**
 * Complete 1v1 game simulation with winner
 * Uses forfeit to cleanly end the game with a winner
 */

const io = require('socket.io-client');

const RAILWAY_URL = 'https://mpool-production.up.railway.app';

console.log('╔════════════════════════════════════════╗');
console.log('║     MPOOL - COMPLETE GAME TEST         ║');
console.log('╚════════════════════════════════════════╝');
console.log('Server:', RAILWAY_URL);
console.log('');

const player1 = { phone: '0706336504', username: 'Player1' };
const player2 = { phone: '0700000001', username: 'Player2' };

let p1Socket, p2Socket;
let turnCount = 0;
const MAX_TURNS = 6;

// Player 1
console.log('[P1] Connecting...');
p1Socket = io(RAILWAY_URL, { transports: ['websocket', 'polling'] });

p1Socket.on('connect', () => {
    console.log('[P1] ✓ Connected');
    p1Socket.emit('auth', player1);
    setTimeout(() => {
        console.log('[P1] Joining queue...');
        p1Socket.emit('queue:join', { stake: 20 });
    }, 500);
});

p1Socket.on('queue:waiting', () => {
    console.log('[P1] Waiting for opponent...');
    if (!p2Socket) setTimeout(connectPlayer2, 1000);
});

p1Socket.on('match:found', (data) => {
    console.log('\n┌──────────────────────────────────────┐');
    console.log('│         🎱 MATCH FOUND! 🎱           │');
    console.log('├──────────────────────────────────────┤');
    console.log('│  Player 1:', player1.username.padEnd(24) + '│');
    console.log('│  Player 2:', (data.opponent?.username || 'Player2').padEnd(24) + '│');
    console.log('│  Pot:', String(data.pot + ' coins').padEnd(28) + '│');
    console.log('└──────────────────────────────────────┘\n');

    setTimeout(() => {
        console.log('[P1] Ready!');
        p1Socket.emit('game:ready');
    }, 300);
});

p1Socket.on('game:start', (data) => {
    console.log('🎱 BREAK! Player', data.currentPlayer, 'starts.\n');
    if (data.currentPlayer === 1) {
        setTimeout(() => playTurn(1), 1500);
    }
});

p1Socket.on('opponent:shot', () => {
    console.log('[P1] 👀 Watching opponent...');
});

p1Socket.on('game:turn-change', (data) => {
    turnCount++;
    console.log('\n═══ Turn', turnCount, '═══');

    // After MAX_TURNS, P2 forfeits so P1 wins
    if (turnCount >= MAX_TURNS) {
        console.log('\n[P2] 😓 Player 2 forfeits the match!');
        setTimeout(() => {
            p2Socket.emit('game:forfeit');
        }, 1000);
        return;
    }

    if (data.currentPlayer === 1) {
        setTimeout(() => playTurn(1), 1500);
    }
});

p1Socket.on('game:opponent-forfeit', (data) => {
    console.log('\n┌──────────────────────────────────────┐');
    console.log('│        🏆 VICTORY! 🏆               │');
    console.log('├──────────────────────────────────────┤');
    console.log('│  Opponent forfeited!                 │');
    console.log('│  You won:', String(data.pot + ' coins!').padEnd(25) + '│');
    console.log('└──────────────────────────────────────┘');
    endGame(true);
});

p1Socket.on('game:result', (data) => {
    console.log('\n┌──────────────────────────────────────┐');
    console.log('│          🏆 GAME OVER 🏆             │');
    console.log('├──────────────────────────────────────┤');
    console.log('│  Winner:', String(data.winner).padEnd(26) + '│');
    console.log('│  Prize:', String(data.pot + ' coins').padEnd(27) + '│');
    console.log('└──────────────────────────────────────┘');
    endGame(true);
});

// Player 2
function connectPlayer2() {
    console.log('[P2] Connecting...');
    p2Socket = io(RAILWAY_URL, { transports: ['websocket', 'polling'] });

    p2Socket.on('connect', () => {
        console.log('[P2] ✓ Connected');
        p2Socket.emit('auth', player2);
        setTimeout(() => {
            console.log('[P2] Joining queue...');
            p2Socket.emit('queue:join', { stake: 20 });
        }, 500);
    });

    p2Socket.on('match:found', () => {
        setTimeout(() => {
            console.log('[P2] Ready!');
            p2Socket.emit('game:ready');
        }, 300);
    });

    p2Socket.on('game:start', (data) => {
        if (data.currentPlayer === 2) {
            setTimeout(() => playTurn(2), 1500);
        }
    });

    p2Socket.on('opponent:shot', () => {
        console.log('[P2] 👀 Watching opponent...');
    });

    p2Socket.on('game:turn-change', (data) => {
        if (data.currentPlayer === 2 && turnCount < MAX_TURNS) {
            setTimeout(() => playTurn(2), 1500);
        }
    });

    p2Socket.on('game:forfeit-confirm', () => {
        console.log('\n[P2] 😞 You forfeited and lost your stake.');
    });

    p2Socket.on('game:result', (data) => {
        console.log('[P2] Game result received');
    });
}

function playTurn(player) {
    const socket = player === 1 ? p1Socket : p2Socket;
    const name = player === 1 ? 'Player1' : 'Player2';

    const power = 15 + Math.random() * 20;
    const angle = Math.random() * Math.PI * 2;

    console.log(`[${name}] 🎯 Taking shot (power: ${power.toFixed(0)})`);
    socket.emit('game:shot', { angle, power });

    setTimeout(() => {
        const potted = Math.random() > 0.5;
        const ballType = player === 1 ? 'solid' : 'stripe';

        if (potted) {
            console.log(`[${name}] ✅ Potted a ${ballType}!`);
        } else {
            console.log(`[${name}] ❌ Miss`);
        }

        socket.emit('game:shot-complete', {
            pottedBalls: potted ? [{ type: ballType }] : [],
            foul: false
        });
    }, 2000);
}

function endGame(success) {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║       TEST COMPLETE:', success ? 'SUCCESS ✓' : 'FAILED ✗', '       ║');
    console.log('╚════════════════════════════════════════╝\n');

    setTimeout(() => {
        if (p1Socket) p1Socket.disconnect();
        if (p2Socket) p2Socket.disconnect();
        process.exit(success ? 0 : 1);
    }, 1000);
}

// Timeout safety
setTimeout(() => {
    console.log('\n⏱️ Timeout');
    endGame(false);
}, 90000);

p1Socket.on('connect_error', (e) => console.log('[P1] Error:', e.message));
