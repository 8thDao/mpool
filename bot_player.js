/**
 * Bot that joins matchmaking queue and plays
 * Run this while a browser player is waiting in queue
 */

const io = require('socket.io-client');

const socket = io('http://localhost:3000');

console.log('Bot connecting to matchmaking...');

socket.on('connect', () => {
    console.log('Bot connected:', socket.id);

    socket.emit('auth', {
        phone: '0699000001',
        username: 'AI_Bot'
    });

    // Join queue with stake 20
    setTimeout(() => {
        console.log('Bot joining queue (stake: 20)...');
        socket.emit('queue:join', { stake: 20 });
    }, 1000);
});

socket.on('queue:waiting', (data) => {
    console.log('Bot in queue, position:', data.position);
    console.log('Waiting for human player...');
});

socket.on('match:found', (data) => {
    console.log('\n*** MATCH FOUND! ***');
    console.log('Opponent:', data.opponent.username);
    console.log('Pot:', data.pot);

    setTimeout(() => {
        console.log('Bot sending ready...');
        socket.emit('game:ready');
    }, 1000);
});

socket.on('game:start', (data) => {
    console.log('Game started! Current player:', data.currentPlayer);
    console.log('Bot is player 2, waiting for opponent turn...');
});

socket.on('opponent:shot', (data) => {
    console.log('Opponent shot received:', data);

    // Bot makes a random shot when it's their turn
    setTimeout(() => {
        console.log('Bot making a shot...');
        const angle = Math.random() * Math.PI * 2;
        const power = 10 + Math.random() * 20;
        socket.emit('game:shot', { angle, power });
    }, 2000);
});

socket.on('game:turn-change', (data) => {
    console.log('Turn changed to player:', data.currentPlayer);
});

socket.on('game:result', (data) => {
    console.log('\n*** GAME OVER ***');
    console.log('Winner:', data.winner);
    console.log('Pot:', data.pot);

    setTimeout(() => {
        socket.disconnect();
        process.exit(0);
    }, 2000);
});

socket.on('disconnect', () => {
    console.log('Bot disconnected');
});

// Keep running for 5 minutes max
setTimeout(() => {
    console.log('Bot timeout - exiting');
    socket.disconnect();
    process.exit(0);
}, 300000);
