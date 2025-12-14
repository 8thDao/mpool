const http = require('http');

const loginData = JSON.stringify({ identifier: '0799999999', password: 'password' });
const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': loginData.length
    }
}, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        console.log('LOGIN API RESPONSE:', body);
    });
});
req.write(loginData);
req.end();
