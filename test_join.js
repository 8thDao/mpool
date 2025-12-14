const http = require('http');

const data = JSON.stringify({
    phone: '0711111111',
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

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log(`STATUS: ${res.statusCode}`);
        console.log(`BODY: ${body}`);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
