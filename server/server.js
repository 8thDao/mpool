const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const tournament = require('./tournament');
const { initSocket } = require('./socket');

// Initialize Tournament System
tournament.init(db);

const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Initialize Socket Handler
initSocket(io, db);

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// === API ROUTES ===

// Login User (Strict with Password)
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;
    // Allow login with phone (primary key) OR username
    db.get('SELECT * FROM users WHERE phone_number = ? OR username = ?', [identifier, identifier], async (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
            // Verify password
            const match = await bcrypt.compare(password, row.password_hash);
            if (match) {
                // Return user info (excluding password hash)
                const { password_hash, ...user } = row;
                res.json({ message: 'Login successful', user });
            } else {
                res.status(401).json({ error: 'Invalid credentials' });
            }
        } else {
            res.status(404).json({ error: 'User not found. Please register.' });
        }
    });
});

app.post('/api/register', async (req, res) => {
    const { phone, password, username } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'Phone number and password required' });

    const cleanPhone = phone.replace(/\D/g, '');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Default username if not provided
    const finalUsername = username && username.trim() !== "" ? username.trim() : `Player${cleanPhone.slice(-4)}`;

    // STICT ENFORCEMENT: Check if username exists (whether custom or auto-generated)
    const existing = await new Promise((resolve, reject) => {
        db.get('SELECT phone_number FROM users WHERE username = ?', [finalUsername], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });

    if (existing) {
        return res.status(409).json({ error: 'Username already taken' });
    }

    db.run('INSERT INTO users (phone_number, balance, password_hash, username, wins, losses) VALUES (?, 0, ?, ?, 0, 0)',
        [cleanPhone, hashedPassword, finalUsername], function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ error: 'Phone number already registered' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'User registered successfully', user: { phone_number: cleanPhone, balance: 0, username: finalUsername } });
        });
});

// Helper to log transaction
function logTransaction(phone, amount, type, description, status = 'COMPLETED') {
    const id = Date.now().toString() + Math.random().toString(36).substring(7);
    db.run('INSERT INTO transactions (transaction_id, phone_number, amount, type, description, status) VALUES (?, ?, ?, ?, ?, ?)',
        [id, phone, amount, type, description, status], (err) => {
            if (err) console.error("Transaction Log Error:", err);
        });
}

// Get Balance & Stats
app.get('/api/balance/:phone', (req, res) => {
    const { phone } = req.params;
    db.get('SELECT balance, username, wins, losses, avatar_url FROM users WHERE phone_number = ?', [phone], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'User not found' });
        res.json({
            balance: row.balance,
            username: row.username,
            wins: row.wins,
            losses: row.losses,
            avatar_url: row.avatar_url
        });
    });
});

// Deduct Balance (Join Tournament / Stake)
app.post('/api/deduct', (req, res) => {
    const { phone, amount } = req.body;

    db.serialize(() => {
        db.get('SELECT balance FROM users WHERE phone_number = ?', [phone], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: 'User not found' });

            if (row.balance < amount) {
                return res.status(400).json({ error: 'Insufficient funds' });
            }

            db.run('UPDATE users SET balance = balance - ? WHERE phone_number = ?', [amount, phone], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                logTransaction(phone, -amount, 'GAME_ENTRY', 'Entry Fee / Stake');
                res.json({ success: true, newBalance: row.balance - amount });
            });
        });
    });
});

// Add Winnings (Game Won)
app.post('/api/win', (req, res) => {
    const { phone, amount } = req.body;

    db.run('UPDATE users SET balance = balance + ?, wins = wins + 1 WHERE phone_number = ?', [amount, phone], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        logTransaction(phone, amount, 'GAME_WIN', 'Game Winnings');
        res.json({ success: true });
    });
});

// Record Loss
app.post('/api/loss', (req, res) => {
    const { phone } = req.body;

    db.run('UPDATE users SET losses = losses + 1 WHERE phone_number = ?', [phone], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        // Loss transaction is already covered by 'deduct' (stake). We don't log another negative here unless we want to track 'outcome' explicitly.
        // For simplicity, we just update stats.
        res.json({ success: true });
    });
});



// Get Transaction History
app.get('/api/transactions/:phone', (req, res) => {
    const { phone } = req.params;
    db.all('SELECT * FROM transactions WHERE phone_number = ? ORDER BY created_at DESC LIMIT 50', [phone], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Update Profile
app.post('/api/profile/update', (req, res) => {
    const { phone, username, avatar_url } = req.body;

    // Check if username is taken by someone else
    db.get('SELECT phone_number FROM users WHERE username = ? AND phone_number != ?', [username, phone], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
            return res.status(409).json({ error: 'Username already taken' });
        }

        db.run('UPDATE users SET username = ?, avatar_url = ? WHERE phone_number = ?', [username, avatar_url, phone], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// Delete Account
app.delete('/api/profile/:phone', (req, res) => {
    const { phone } = req.params;
    db.serialize(() => {
        db.run('DELETE FROM users WHERE phone_number = ?', [phone]);
        db.run('DELETE FROM transactions WHERE phone_number = ?', [phone]); // Clean up history
        res.json({ success: true });
    });
});


// === DARAJA (M-PESA) WEBHOOKS ===

// 1. Validation URL
// M-Pesa calls this to check if we want to accept the payment.
app.post('/api/payment/validation', (req, res) => {
    console.log('M-Pesa Validation Hit:', req.body);

    // Structure of req.body usually includes { MSISDN, TransID, TransAmount, etc. }
    const msisdn = req.body.MSISDN;

    // Check if user exists
    db.get('SELECT * FROM users WHERE phone_number = ?', [msisdn], (err, row) => {
        if (row) {
            // Accept transaction
            return res.json({
                ResultCode: 0,
                ResultDesc: "Accepted"
            });
        } else {
            // Reject transaction - User not registered
            console.log(`Rejecting payment from unregistered number: ${msisdn}`);
            return res.json({
                ResultCode: 1,
                ResultDesc: "Rejected - User not found"
            });
        }
    });
});

// 2. Confirmation URL
// M-Pesa calls this when payment is successful. We update the balance here.
app.post('/api/payment/confirmation', (req, res) => {
    console.log('M-Pesa Confirmation Hit:', req.body);

    const {
        TransID,
        TransAmount,
        MSISDN,
        FirstName
    } = req.body;

    // Update User Balance
    db.serialize(() => {
        // Record Transaction
        db.run(`INSERT INTO transactions (transaction_id, phone_number, amount, mpesa_receipt, status) 
                VALUES (?, ?, ?, ?, ?)`,
            [TransID, MSISDN, TransAmount, TransID, 'COMPLETED'],
            (err) => {
                if (err) console.error('Error saving transaction:', err);
            }
        );

        // Credit User
        db.run('UPDATE users SET balance = balance + ? WHERE phone_number = ?', [TransAmount, MSISDN], function (err) {
            if (err) {
                console.error(err.message);
                return res.status(500).json({ ResultCode: 1, ResultDesc: "Internal Error" });
            }
            logTransaction(MSISDN, TransAmount, 'DEPOSIT', 'M-Pesa Top Up');
            res.json({
                ResultCode: 0,
                ResultDesc: "Accepted"
            });
        });
    });
});


// === M-PESA SIMULATION ENDPOINTS ===

// Simulate STK Push (Deposit)
app.post('/api/deposit/stk', (req, res) => {
    const { phone, amount } = req.body;

    // In Real World: Initiate STK Push request to Safaricom
    console.log(`Initiating STK Push for ${amount} to ${phone}`);

    // Simulation: Wait 2 seconds, then automatically succeed
    setTimeout(() => {
        const transId = "STK" + Math.floor(Math.random() * 100000);
        db.serialize(() => {
            // 1. Record Transaction
            db.run(`INSERT INTO transactions (transaction_id, phone_number, amount, mpesa_receipt, status) 
                    VALUES (?, ?, ?, ?, ?)`,
                [transId, phone, amount, transId, 'DEPOSIT'], (err) => { if (err) console.error(err); });

            // 2. Credit User
            db.run('UPDATE users SET balance = balance + ? WHERE phone_number = ?', [amount, phone], (err) => {
                if (err) console.error(err);
                console.log(`Simulated STK Deposit Success: ${amount} for ${phone}`);
            });
        });
    }, 2000);

    // Immediate response that "Prompt Sent"
    res.json({ success: true, message: "STK Push sent. Check your phone." });
});

// Simulate B2C (Withdrawal)
app.post('/api/withdraw', (req, res) => {
    const { phone, amount } = req.body;
    console.log(`Requesting Withdrawal of ${amount} for ${phone}`);

    db.get('SELECT balance FROM users WHERE phone_number = ?', [phone], (err, row) => {
        if (!row) return res.status(404).json({ error: "User not found" });
        if (row.balance < amount) return res.status(400).json({ error: "Insufficient balance" });

        // Deduct first
        db.serialize(() => {
            const transId = "B2C" + Math.floor(Math.random() * 100000);

            // 1. Record Transaction
            db.run(`INSERT INTO transactions (transaction_id, phone_number, amount, mpesa_receipt, status) 
                    VALUES (?, ?, ?, ?, ?)`,
                [transId, phone, -amount, transId, 'WITHDRAWAL'], (err) => { if (err) console.error(err); });

            // 2. Debit User
            db.run('UPDATE users SET balance = balance - ? WHERE phone_number = ?', [amount, phone], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                console.log(`Simulated B2C Withdrawal Success: ${amount} for ${phone}`);
                res.json({ success: true, message: "Withdrawal successful. Funds sent to phone." });
            });
        });
    });
});



// === TOURNAMENT ENDPOINTS ===

// Join Tournament
app.post('/api/tournaments/join', async (req, res) => {
    const { phone, tournamentId } = req.body;
    try {
        const result = await tournament.join(db, phone, tournamentId);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Get Tournament Status
app.get('/api/tournaments/:id/status/:phone', async (req, res) => {
    const { id, phone } = req.params;
    try {
        const status = await tournament.getStatus(db, id, phone);
        res.json(status);
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
});

// (Debug/Simulation) Start Tournament Manually
app.post('/api/tournaments/:id/start', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await tournament.start(db, id);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Socket.IO enabled for real-time multiplayer`);
});
