const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');

// MongoDB Database
const mongodb = require('./mongodb');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// === API ROUTES ===

// Login User
app.post('/api/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;
        const user = await mongodb.getUserByIdentifier(identifier);

        if (!user) {
            return res.status(404).json({ error: 'User not found. Please register.' });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Return user info (excluding password hash)
        const { password_hash, _id, ...userData } = user;
        res.json({ message: 'Login successful', user: userData });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Register User
app.post('/api/register', async (req, res) => {
    try {
        const { phone, password, username } = req.body;
        if (!phone || !password) {
            return res.status(400).json({ error: 'Phone number and password required' });
        }

        const cleanPhone = phone.replace(/\D/g, '');
        const hashedPassword = await bcrypt.hash(password, 10);
        const finalUsername = username && username.trim() !== ""
            ? username.trim()
            : `Player${cleanPhone.slice(-4)}`;

        // Check if phone already exists
        const existingPhone = await mongodb.getUser(cleanPhone);
        if (existingPhone) {
            return res.status(409).json({ error: 'Phone number already registered' });
        }

        // Check if username is taken
        const existingUsername = await mongodb.getUserByIdentifier(finalUsername);
        if (existingUsername) {
            return res.status(409).json({ error: 'Username already taken' });
        }

        const user = await mongodb.createUser(cleanPhone, hashedPassword, finalUsername);
        res.json({
            message: 'User registered successfully',
            user: {
                phone_number: user.phone_number,
                balance: user.balance,
                username: user.username
            }
        });
    } catch (err) {
        console.error('Registration error:', err);
        if (err.code === 11000) {
            return res.status(409).json({ error: 'Phone number or username already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Get Balance & Stats
app.get('/api/balance/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const user = await mongodb.getUser(phone);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            balance: user.balance,
            username: user.username,
            wins: user.wins,
            losses: user.losses,
            avatar_url: user.avatar_url
        });
    } catch (err) {
        console.error('Balance error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Deduct Balance
app.post('/api/deduct', async (req, res) => {
    try {
        const { phone, amount } = req.body;
        const user = await mongodb.getUser(phone);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (user.balance < amount) {
            return res.status(400).json({ error: 'Insufficient funds' });
        }

        await mongodb.deductBalance(phone, amount);
        await mongodb.recordTransaction(
            Date.now().toString() + Math.random().toString(36).substring(7),
            phone, -amount, 'GAME_ENTRY', 'Entry Fee / Stake', 'COMPLETED'
        );

        res.json({ success: true, newBalance: user.balance - amount });
    } catch (err) {
        console.error('Deduct error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Add Winnings
app.post('/api/win', async (req, res) => {
    try {
        const { phone, amount } = req.body;
        await mongodb.recordWin(phone, amount);
        await mongodb.recordTransaction(
            Date.now().toString() + Math.random().toString(36).substring(7),
            phone, amount, 'GAME_WIN', 'Game Winnings', 'COMPLETED'
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Win error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Record Loss
app.post('/api/loss', async (req, res) => {
    try {
        const { phone } = req.body;
        await mongodb.recordLoss(phone);
        res.json({ success: true });
    } catch (err) {
        console.error('Loss error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get Transaction History
app.get('/api/transactions/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const transactions = await mongodb.getTransactionHistory(phone, 50);
        res.json(transactions);
    } catch (err) {
        console.error('Transaction history error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update Profile
app.post('/api/profile/update', async (req, res) => {
    try {
        const { phone, username, avatar_url } = req.body;

        // Check if username is taken by someone else
        const existing = await mongodb.getUserByIdentifier(username);
        if (existing && existing.phone_number !== phone) {
            return res.status(409).json({ error: 'Username already taken' });
        }

        await mongodb.updateProfile(phone, username, avatar_url);
        res.json({ success: true });
    } catch (err) {
        console.error('Profile update error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete Account
app.delete('/api/profile/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        await mongodb.deleteUser(phone);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete account error:', err);
        res.status(500).json({ error: err.message });
    }
});

// === M-PESA WEBHOOKS ===

app.post('/api/payment/validation', async (req, res) => {
    console.log('M-Pesa Validation Hit:', req.body);
    const msisdn = req.body.MSISDN;

    const user = await mongodb.getUser(msisdn);
    if (user) {
        res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    } else {
        console.log(`Rejecting payment from unregistered number: ${msisdn}`);
        res.json({ ResultCode: 1, ResultDesc: "Rejected - User not found" });
    }
});

app.post('/api/payment/confirmation', async (req, res) => {
    console.log('M-Pesa Confirmation Hit:', req.body);
    const { TransID, TransAmount, MSISDN } = req.body;

    try {
        await mongodb.recordTransaction(TransID, MSISDN, TransAmount, 'DEPOSIT', 'M-Pesa Top Up', 'COMPLETED', TransID);
        await mongodb.addBalance(MSISDN, TransAmount);
        res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    } catch (err) {
        console.error('M-Pesa confirmation error:', err);
        res.status(500).json({ ResultCode: 1, ResultDesc: "Internal Error" });
    }
});

// === M-PESA SIMULATION ===

app.post('/api/deposit/stk', async (req, res) => {
    const { phone, amount } = req.body;
    console.log(`Initiating STK Push for ${amount} to ${phone}`);

    // Simulate STK Push - auto-succeed after 2 seconds
    setTimeout(async () => {
        try {
            const transId = "STK" + Math.floor(Math.random() * 100000);
            await mongodb.recordTransaction(transId, phone, amount, 'DEPOSIT', 'STK Push Deposit', 'COMPLETED', transId);
            await mongodb.addBalance(phone, parseInt(amount));
            console.log(`Simulated STK Deposit Success: ${amount} for ${phone}`);
        } catch (err) {
            console.error('STK simulation error:', err);
        }
    }, 2000);

    res.json({ success: true, message: "STK Push sent. Check your phone." });
});

app.post('/api/withdraw', async (req, res) => {
    try {
        const { phone, amount } = req.body;
        console.log(`Requesting Withdrawal of ${amount} for ${phone}`);

        const user = await mongodb.getUser(phone);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        if (user.balance < amount) {
            return res.status(400).json({ error: "Insufficient balance" });
        }

        const transId = "B2C" + Math.floor(Math.random() * 100000);
        await mongodb.recordTransaction(transId, phone, -amount, 'WITHDRAWAL', 'B2C Withdrawal', 'COMPLETED', transId);
        await mongodb.deductBalance(phone, parseInt(amount));

        console.log(`Simulated B2C Withdrawal Success: ${amount} for ${phone}`);
        res.json({ success: true, message: "Withdrawal successful. Funds sent to phone." });
    } catch (err) {
        console.error('Withdrawal error:', err);
        res.status(500).json({ error: err.message });
    }
});

// === TOURNAMENT ENDPOINTS ===

app.post('/api/tournaments/join', async (req, res) => {
    try {
        const { phone, tournamentId } = req.body;

        // Check if already joined
        const alreadyJoined = await mongodb.isPlayerInTournament(tournamentId, phone);
        if (alreadyJoined) {
            return res.status(400).json({ error: 'Already joined this tournament' });
        }

        // Get tournament
        const tournament = await mongodb.getTournament(tournamentId);
        if (!tournament) {
            return res.status(404).json({ error: 'Tournament not found' });
        }
        if (tournament.current_players >= tournament.max_players) {
            return res.status(400).json({ error: 'Tournament is full' });
        }

        // Check balance
        const user = await mongodb.getUser(phone);
        if (!user || user.balance < tournament.entry_fee) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        // Deduct entry fee and join
        await mongodb.deductBalance(phone, tournament.entry_fee);
        await mongodb.joinTournament(tournamentId, phone);
        await mongodb.recordTransaction(
            Date.now().toString() + Math.random().toString(36).substring(7),
            phone, -tournament.entry_fee, 'TOURNAMENT_ENTRY', `Tournament ${tournamentId} Entry`, 'COMPLETED'
        );

        res.json({
            success: true,
            message: 'Joined tournament successfully',
            players: tournament.current_players + 1
        });
    } catch (err) {
        console.error('Tournament join error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/tournaments/:id/status/:phone', async (req, res) => {
    try {
        const { id, phone } = req.params;
        const tournament = await mongodb.getTournament(id);

        if (!tournament) {
            return res.status(404).json({ error: 'Tournament not found' });
        }

        const isJoined = await mongodb.isPlayerInTournament(id, phone);

        res.json({
            ...tournament,
            joined: isJoined
        });
    } catch (err) {
        console.error('Tournament status error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/tournaments', async (req, res) => {
    try {
        const tournaments = await mongodb.getTournaments();
        res.json(tournaments);
    } catch (err) {
        console.error('Get tournaments error:', err);
        res.status(500).json({ error: err.message });
    }
});

// === START SERVER ===

async function startServer() {
    try {
        // Connect to MongoDB first
        await mongodb.connect();

        // Initialize tournaments
        await mongodb.initializeTournaments();

        // Initialize Socket Handler
        const { initSocket } = require('./socket');
        initSocket(io, mongodb);

        server.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
            console.log(`Socket.IO enabled for real-time multiplayer`);
            console.log(`MongoDB connected`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

startServer();
