/**
 * Test script to simulate two players connecting and matching
 * This script creates both players to test the full matchmaking flow
 */

const io = require('socket.io-client');

console.log('=== MULTIPLAYER MATCHMAKING TEST ===');
console.log('Starting test...\n');

// Player 1
const player1Socket = io('http://localhost:3000');
// Player 2
const player2Socket = io('http://localhost:3000');

let player1Matched = false;
let player2Matched = false;
let gameStarted = false;

// Player 1 Setup
player1Socket.on('connect', () => {
    console.log('[P1] Connected:', player1Socket.id);

    player1Socket.emit('auth', {
        phone: '0699000001',
        username: 'TestBot_1'
    });

    // Wait a bit then join queue
    setTimeout(() => {
        console.log('[P1] Joining queue with stake 20...');
        player1Socket.emit('queue:join', { stake: 20 });
    }, 500);
});

player1Socket.on('queue:waiting', (data) => {
    console.log('[P1] In queue, position:', data.position);
});

player1Socket.on('queue:error', (data) => {
    console.log('[P1] Queue error:', data.message);
});

player1Socket.on('match:found', (data) => {
    console.log('\n[P1] *** MATCH FOUND! ***');
    console.log('  Room ID:', data.roomId);
    console.log('  Player Number:', data.playerNumber);
    console.log('  Opponent:', data.opponent.username);
    console.log('  Pot:', data.pot);
    player1Matched = true;

    setTimeout(() => {
        console.log('[P1] Sending ready...');
        player1Socket.emit('game:ready');
    }, 500);
});

player1Socket.on('game:start', (data) => {
    console.log('[P1] Game started! Current player:', data.currentPlayer);
    gameStarted = true;
    checkComplete();
});

// Player 2 Setup
player2Socket.on('connect', () => {
    console.log('[P2] Connected:', player2Socket.id);

    player2Socket.emit('auth', {
        phone: '0699000002',
        username: 'TestBot_2'
    });

    // Wait a bit more then join queue
    setTimeout(() => {
        console.log('[P2] Joining queue with stake 20...');
        player2Socket.emit('queue:join', { stake: 20 });
    }, 1000);
});

player2Socket.on('queue:waiting', (data) => {
    console.log('[P2] In queue, position:', data.position);
});

player2Socket.on('queue:error', (data) => {
    console.log('[P2] Queue error:', data.message);
});

player2Socket.on('match:found', (data) => {
    console.log('\n[P2] *** MATCH FOUND! ***');
    console.log('  Room ID:', data.roomId);
    console.log('  Player Number:', data.playerNumber);
    console.log('  Opponent:', data.opponent.username);
    console.log('  Pot:', data.pot);
    player2Matched = true;

    setTimeout(() => {
        console.log('[P2] Sending ready...');
        player2Socket.emit('game:ready');
    }, 500);
});

player2Socket.on('game:start', (data) => {
    console.log('[P2] Game started! Current player:', data.currentPlayer);
    gameStarted = true;
    checkComplete();
});

function checkComplete() {
    if (player1Matched && player2Matched && gameStarted) {
        console.log('\n=== TEST PASSED! ===');
        console.log('Both players matched and game started successfully.');

        setTimeout(() => {
            player1Socket.disconnect();
            player2Socket.disconnect();
            process.exit(0);
        }, 2000);
    }
}

// Error handlers
player1Socket.on('error', (err) => console.log('[P1] Error:', err));
player2Socket.on('error', (err) => console.log('[P2] Error:', err));

player1Socket.on('disconnect', () => console.log('[P1] Disconnected'));
player2Socket.on('disconnect', () => console.log('[P2] Disconnected'));

// Timeout after 15 seconds
setTimeout(() => {
    console.log('\n=== TEST TIMEOUT ===');
    console.log('P1 Matched:', player1Matched);
    console.log('P2 Matched:', player2Matched);
    console.log('Game Started:', gameStarted);

    if (!player1Matched && !player2Matched) {
        console.log('ISSUE: Neither player was matched - possible queue or socket issue');
    } else if (!gameStarted) {
        console.log('ISSUE: Matched but game did not start - check ready signal handling');
    }

    player1Socket.disconnect();
    player2Socket.disconnect();
    process.exit(1);
}, 15000);
