const http = require('http');

function request(path, method, body) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runTest() {
    console.log("=== Starting M-Pesa Integration Test ===");

    const phone = "2547" + Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
    console.log("Using Test Phone:", phone);

    // 1. Simulate Login (Create User)
    console.log("\n1. Testing Login/Registration...");
    const loginRes = await request('/api/login', 'POST', { phone });
    console.log("Login Result:", loginRes.body);
    if (loginRes.body.user.balance !== 0) throw new Error("Expected initial 0 balance");

    // 2. Simulate M-Pesa Validation (Incoming pay check)
    console.log("\n2. Testing M-Pesa Validation URL...");
    const valRes = await request('/api/payment/validation', 'POST', { MSISDN: phone });
    console.log("Validation Result:", valRes.body);
    if (valRes.body.ResultCode !== 0) throw new Error("Validation should accept registered user");

    // Test unregistered user rejection
    const rejectRes = await request('/api/payment/validation', 'POST', { MSISDN: "254799999999" });
    if (rejectRes.body.ResultCode !== 1) throw new Error("Validation should reject unregistered user");
    console.log("Unregistered Rejection Passed.");

    // 3. Simulate M-Pesa Confirmation (Deposit)
    console.log("\n3. Testing M-Pesa Confirmation URL (Deposit 500)...");
    const confRes = await request('/api/payment/confirmation', 'POST', {
        TransactionType: "Pay Bill",
        TransID: "RKTQDM7W6S",
        TransTime: "20241210100000",
        TransAmount: 500,
        BusinessShortCode: "123456",
        BillRefNumber: phone,
        InvoiceNumber: "",
        OrgAccountBalance: "",
        ThirdPartyTransID: "",
        MSISDN: phone,
        FirstName: "John"
    });
    console.log("Confirmation Result:", confRes.body);

    // 4. Check Balance
    console.log("\n4. Checking Balance (waiting 1s)...");
    await new Promise(r => setTimeout(r, 1000));
    const balRes = await request(`/api/balance/${phone}`, 'GET');
    console.log("Current Balance:", balRes.body);
    if (balRes.body.balance !== 500) throw new Error(`Expected 500, got ${balRes.body.balance}`);

    // 5. Deduct (Join Game)
    console.log("\n5. Testing Deduction (Join Game - 100)...");
    const deductRes = await request('/api/deduct', 'POST', { phone, amount: 100 });
    console.log("Deduction Result:", deductRes.body);
    if (deductRes.body.newBalance !== 400) throw new Error(`Expected 400, got ${deductRes.body.newBalance}`);

    console.log("\n✅ ALL TESTS PASSED SUCCESSFULLY");
}

runTest().catch(console.error);
