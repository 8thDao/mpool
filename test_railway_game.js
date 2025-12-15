/**
 * Test multiplayer 1v1 game on Railway deployment
 * Using two real user accounts
 */

const io = require('socket.io-client');

const RAILWAY_URL = 'https://mpool-production.up.railway.app';

console.log('=== RAILWAY MULTIPLAYER TEST ===');
console.log('Server:', RAILWAY_URL);
console.log('');

// Player 1: 0706336504 / 1122
const player1 = {
    phone: '0706336504',
    username: 'Player1'
};

// Player 2: 0700000001 / 123123  
const player2 = {
    phone: '0700000001',
    username: 'Player2'
};

let p1Socket, p2Socket;
let p1Matched = false, p2Matched = false;
let gameStarted = false;
let currentPlayer = 1;
let p1Ready = false, p2Ready = false;

// Connect Player 1
console.log('[P1] Connecting...');
p1Socket = io(RAILWAY_URL, {
    transports: ['websocket', 'polling']
});

p1Socket.on('connect', () => {
    console.log('[P1] Connected:', p1Socket.id);
    p1Socket.emit('auth', player1);

    setTimeout(() => {
        console.log('[P1] Joining queue with stake 20...');
        p1Socket.emit('queue:join', { stake: 20 });
    }, 1000);
});

p1Socket.on('queue:waiting', (data) => {
    console.log('[P1] In queue, position:', data.position);

    // Connect Player 2 after P1 is in queue
    if (!p2Socket) {
        setTimeout(connectPlayer2, 2000);
    }
});

p1Socket.on('queue:error', (data) => {
    console.log('[P1] Queue error:', data.message);
});

p1Socket.on('match:found', (data) => {
    console.log('\n[P1] *** MATCH FOUND! ***');
    console.log('[P1] Room:', data.roomId);
    console.log('[P1] Opponent:', data.opponent?.username);
    console.log('[P1] Pot:', data.pot);
    p1Matched = true;

    setTimeout(() => {
        console.log('[P1] Sending ready...');
        p1Socket.emit('game:ready');
        p1Ready = true;
    }, 500);
});

p1Socket.on('game:start', (data) => {
    console.log('[P1] Game started! Current player:', data.currentPlayer);
    currentPlayer = data.currentPlayer;
    gameStarted = true;

    // If P1 goes first, make a shot
    if (currentPlayer === 1) {
        setTimeout(() => makeP1Shot(), 2000);
    }
});

p1Socket.on('opponent:shot', (data) => {
    console.log('[P1] Received opponent shot');
});

p1Socket.on('game:turn-change', (data) => {
    console.log('[P1] Turn changed to player:', data.currentPlayer);
    currentPlayer = data.currentPlayer;

    if (currentPlayer === 1) {
        setTimeout(() => makeP1Shot(), 2000);
    }
});

p1Socket.on('game:result', (data) => {
    console.log('\n[P1] *** GAME RESULT ***');
    console.log('[P1] Winner:', data.winner);
    console.log('[P1] Pot:', data.pot);
    endTest(true);
});

function makeP1Shot() {
    console.log('[P1] Making shot...');
    const angle = Math.random() * Math.PI * 2;
    const power = 15 + Math.random() * 20;
    p1Socket.emit('game:shot', { angle, power });

    // Simulate shot complete after 3 seconds
    setTimeout(() => {
        console.log('[P1] Shot complete, sending result...');
        p1Socket.emit('game:shot-complete', {
            pottedBalls: [],
            foul: false,
            ballState: []
        });
    }, 3000);
}

// Connect Player 2
function connectPlayer2() {
    console.log('\n[P2] Connecting...');
    p2Socket = io(RAILWAY_URL, {
        transports: ['websocket', 'polling']
    });

    p2Socket.on('connect', () => {
        console.log('[P2] Connected:', p2Socket.id);
        p2Socket.emit('auth', player2);

        setTimeout(() => {
            console.log('[P2] Joining queue with stake 20...');
            p2Socket.emit('queue:join', { stake: 20 });
        }, 1000);
    });

    p2Socket.on('queue:waiting', (data) => {
        console.log('[P2] In queue, position:', data.position);
    });

    p2Socket.on('queue:error', (data) => {
        console.log('[P2] Queue error:', data.message);
    });

    p2Socket.on('match:found', (data) => {
        console.log('\n[P2] *** MATCH FOUND! ***');
        console.log('[P2] Room:', data.roomId);
        console.log('[P2] Opponent:', data.opponent?.username);
        console.log('[P2] Pot:', data.pot);
        p2Matched = true;

        setTimeout(() => {
            console.log('[P2] Sending ready...');
            p2Socket.emit('game:ready');
            p2Ready = true;
        }, 500);
    });

    p2Socket.on('game:start', (data) => {
        console.log('[P2] Game started! Current player:', data.currentPlayer);
    });

    p2Socket.on('opponent:shot', (data) => {
        console.log('[P2] Received opponent shot');
    });

    p2Socket.on('game:turn-change', (data) => {
        console.log('[P2] Turn changed to player:', data.currentPlayer);

        if (data.currentPlayer === 2) {
            setTimeout(() => makeP2Shot(), 2000);
        }
    });

    p2Socket.on('game:result', (data) => {
        console.log('\n[P2] *** GAME RESULT ***');
        console.log('[P2] Winner:', data.winner);
        console.log('[P2] Pot:', data.pot);
        endTest(true);
    });
}

function makeP2Shot() {
    console.log('[P2] Making shot...');
    const angle = Math.random() * Math.PI * 2;
    const power = 15 + Math.random() * 20;
    p2Socket.emit('game:shot', { angle, power });

    setTimeout(() => {
        console.log('[P2] Shot complete, sending result...');
        p2Socket.emit('game:shot-complete', {
            pottedBalls: [],
            foul: false,
            ballState: []
        });
    }, 3000);
}

function endTest(success) {
    console.log('\n=== TEST COMPLETE ===');
    console.log('P1 Matched:', p1Matched);
    console.log('P2 Matched:', p2Matched);
    console.log('Game Started:', gameStarted);
    console.log('Result:', success ? 'SUCCESS' : 'INCOMPLETE');

    if (p1Socket) p1Socket.disconnect();
    if (p2Socket) p2Socket.disconnect();

    setTimeout(() => process.exit(success ? 0 : 1), 1000);
}

// Timeout after 60 seconds
setTimeout(() => {
    console.log('\n=== TIMEOUT ===');
    console.log('P1 Matched:', p1Matched);
    console.log('P2 Matched:', p2Matched);
    console.log('Game Started:', gameStarted);

    if (!p1Matched || !p2Matched) {
        console.log('ISSUE: Players did not match');
    } else if (!gameStarted) {
        console.log('ISSUE: Game did not start');
    }

    endTest(false);
}, 60000);

// Error handlers
p1Socket.on('connect_error', (err) => {
    console.log('[P1] Connection error:', err.message);
});

p1Socket.on('error', (err) => {
    console.log('[P1] Error:', err);
});
