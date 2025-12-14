/**
 * Debug test to diagnose matchmaking issues
 */

const io = require('socket.io-client');

console.log('=== MATCHMAKING DEBUG TEST ===');
console.log('Connecting to server...\n');

// Connect to port 3000 where the Node.js server actually runs
const PORT = 3000;
console.log('Connecting to port:', PORT);

const socket = io(`http://localhost:${PORT}`, {
    transports: ['websocket', 'polling'],
    reconnection: true
});

// Track all events
socket.onAny((event, ...args) => {
    console.log(`[EVENT] ${event}:`, JSON.stringify(args, null, 2));
});

socket.on('connect', () => {
    console.log('[SUCCESS] Connected! Socket ID:', socket.id);
    console.log('[INFO] Transport:', socket.io.engine.transport.name);

    // Authenticate
    console.log('[ACTION] Authenticating as TestBot_1...');
    socket.emit('auth', {
        phone: '0699000001',
        username: 'TestBot_1'
    });

    // Join queue after auth
    setTimeout(() => {
        console.log('[ACTION] Joining queue with stake 20...');
        socket.emit('queue:join', { stake: 20 });
    }, 1000);
});

socket.on('connect_error', (err) => {
    console.log('[ERROR] Connection error:', err.message);
});

socket.on('disconnect', (reason) => {
    console.log('[DISCONNECTED] Reason:', reason);
});

// Timeout
setTimeout(() => {
    console.log('\n[TIMEOUT] Test finished');
    socket.disconnect();
    process.exit(0);
}, 10000);
