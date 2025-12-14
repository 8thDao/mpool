const http = require('http');

function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    // Try parsing JSON, otherwise return text
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, body: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', (e) => reject(e));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runTests() {
    const phone = "254998877665";
    const password = "DeleteTestPw";

    console.log("1. Registering User with Username...");
    // Register with custom username
    let res = await request('POST', '/api/register', { phone, password, username: "CustomUser" });
    if (res.status !== 200 && res.status !== 409) {
        throw new Error(`Register failed: ${JSON.stringify(res)}`);
    }
    console.log("Register:", res.status);

    console.log("2. Logging In...");
    res = await request('POST', '/api/login', { identifier: phone, password });
    if (res.status !== 200) throw new Error(`Login failed: ${JSON.stringify(res)}`);
    console.log("Login:", res.status, "User:", res.body.user.username);

    console.log("3. Updating Profile...");
    res = await request('POST', '/api/profile/update', { phone, username: "UpdatedUser", avatar_url: "fake_url" });
    if (res.status !== 200) throw new Error(`Update failed: ${JSON.stringify(res)}`);
    console.log("Update:", res.status);

    console.log("4. Verifying Update...");
    res = await request('GET', `/api/balance/${phone}`);
    if (res.body.username !== "UpdatedUser") throw new Error(`Username mismatch: ${res.body.username}`);
    console.log("Verified Username:", res.body.username);

    console.log("6. Verifying Username Login...");
    // Should be able to login with "CustomUser" (or UpdatedUser if update ran)
    // Wait, step 3 updates it to "UpdatedUser", so we check that first.
    // Actually, let's skip update profile step to verify registration username stickiness? 
    // No, keep update to verify update works too.

    // Login with UpdatedUser
    res = await request('POST', '/api/login', { identifier: "UpdatedUser", password });
    if (res.status !== 200) throw new Error(`Username login failed: ${JSON.stringify(res)}`);
    console.log("Username Login:", res.status);

    console.log("7. Deleting Account...");
    res = await request('DELETE', `/api/profile/${phone}`);
    if (res.status !== 200) throw new Error(`Delete failed: ${JSON.stringify(res)}`);
    console.log("Delete:", res.status);

    console.log("8. Verifying Login Fails...");
    res = await request('POST', '/api/login', { identifier: phone, password });
    if (res.status === 200) throw new Error("Login succeeded after delete!");

    console.log("SUCCESS: All profile tests passed.");
}

runTests().catch(e => {
    console.error("FAILED:", e);
    process.exit(1);
});
