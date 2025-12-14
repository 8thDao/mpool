const http = require('http');

const data = JSON.stringify({
    phone: '0788888888',
    tournamentId: 't_50'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/tournaments/join',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, res => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', body);
    });
});

req.on('error', err => console.error('Error:', err));
req.write(data);
req.end();
