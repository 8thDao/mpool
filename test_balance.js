const http = require('http');

// Test Balance API
http.get('http://localhost:3000/api/balance/0799999999', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('BALANCE API RESPONSE:', data);

        // If user doesn't exist or has 0 balance, that's the issue
        const parsed = JSON.parse(data);
        if (parsed.error) {
            console.log('USER DOES NOT EXIST!');
        } else if (parsed.balance === 0) {
            console.log('USER HAS ZERO BALANCE!');
        } else {
            console.log('User balance:', parsed.balance);

            // Test deduct
            const deductData = JSON.stringify({ phone: '0799999999', amount: 20 });
            const req = http.request({
                hostname: 'localhost',
                port: 3000,
                path: '/api/deduct',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': deductData.length
                }
            }, (res2) => {
                let body = '';
                res2.on('data', chunk => body += chunk);
                res2.on('end', () => {
                    console.log('DEDUCT API RESPONSE:', body);
                });
            });
            req.write(deductData);
            req.end();
        }
    });
}).on('error', (e) => {
    console.error('Error:', e.message);
});
