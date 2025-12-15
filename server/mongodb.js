/**
 * MongoDB Database Module for MPOOL
 * Replaces SQLite with MongoDB for persistent cloud storage
 */

const { MongoClient } = require('mongodb');

// MongoDB connection string from environment variable
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'mpool';

let client = null;
let db = null;

/**
 * Connect to MongoDB
 */
async function connect() {
    if (db) return db;

    try {
        console.log('[MongoDB] Connecting to database...');
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DB_NAME);
        console.log('[MongoDB] Connected successfully to:', DB_NAME);

        // Create indexes for better performance
        await createIndexes();

        return db;
    } catch (error) {
        console.error('[MongoDB] Connection error:', error);
        throw error;
    }
}

/**
 * Create indexes for collections
 */
async function createIndexes() {
    try {
        // Users collection - phone_number is unique identifier
        await db.collection('users').createIndex({ phone_number: 1 }, { unique: true });

        // Transactions collection
        await db.collection('transactions').createIndex({ phone_number: 1 });
        await db.collection('transactions').createIndex({ transaction_id: 1 }, { unique: true });

        // Tournaments
        await db.collection('tournaments').createIndex({ id: 1 }, { unique: true });
        await db.collection('tournament_players').createIndex({ tournament_id: 1, phone_number: 1 });

        console.log('[MongoDB] Indexes created');
    } catch (error) {
        console.error('[MongoDB] Index creation error:', error);
    }
}

/**
 * Get the database instance
 */
function getDb() {
    if (!db) {
        throw new Error('Database not connected. Call connect() first.');
    }
    return db;
}

// ============= USER OPERATIONS =============

/**
 * Get user by phone number
 */
async function getUser(phone) {
    const users = getDb().collection('users');
    return await users.findOne({ phone_number: phone });
}

/**
 * Get user by phone or username (for login)
 */
async function getUserByIdentifier(identifier) {
    const users = getDb().collection('users');
    return await users.findOne({
        $or: [
            { phone_number: identifier },
            { username: identifier }
        ]
    });
}

/**
 * Create new user
 */
async function createUser(phone, passwordHash, username) {
    const users = getDb().collection('users');
    const newUser = {
        phone_number: phone,
        balance: 100, // Starting balance
        password_hash: passwordHash,
        username: username,
        wins: 0,
        losses: 0,
        avatar_url: null,
        created_at: new Date()
    };

    await users.insertOne(newUser);
    return newUser;
}

/**
 * Update user balance
 */
async function updateBalance(phone, amount) {
    const users = getDb().collection('users');
    const result = await users.updateOne(
        { phone_number: phone },
        { $inc: { balance: amount } }
    );
    return result.modifiedCount > 0;
}

/**
 * Deduct balance from user
 */
async function deductBalance(phone, amount) {
    return await updateBalance(phone, -amount);
}

/**
 * Add balance to user
 */
async function addBalance(phone, amount) {
    return await updateBalance(phone, amount);
}

/**
 * Record a win for user
 */
async function recordWin(phone, winnings) {
    const users = getDb().collection('users');
    await users.updateOne(
        { phone_number: phone },
        {
            $inc: {
                balance: winnings,
                wins: 1
            }
        }
    );
}

/**
 * Record a loss for user
 */
async function recordLoss(phone) {
    const users = getDb().collection('users');
    await users.updateOne(
        { phone_number: phone },
        { $inc: { losses: 1 } }
    );
}

/**
 * Update user profile
 */
async function updateProfile(phone, username, avatarUrl) {
    const users = getDb().collection('users');
    await users.updateOne(
        { phone_number: phone },
        { $set: { username, avatar_url: avatarUrl } }
    );
}

/**
 * Delete user account
 */
async function deleteUser(phone) {
    const users = getDb().collection('users');
    const transactions = getDb().collection('transactions');

    await users.deleteOne({ phone_number: phone });
    await transactions.deleteMany({ phone_number: phone });
}

// ============= TRANSACTION OPERATIONS =============

/**
 * Record a transaction
 */
async function recordTransaction(transactionId, phone, amount, type, description, status, mpesaReceipt = null) {
    const transactions = getDb().collection('transactions');
    await transactions.insertOne({
        transaction_id: transactionId,
        phone_number: phone,
        amount,
        type,
        description,
        status,
        mpesa_receipt: mpesaReceipt,
        created_at: new Date()
    });
}

/**
 * Get user transaction history
 */
async function getTransactionHistory(phone, limit = 20) {
    const transactions = getDb().collection('transactions');
    return await transactions
        .find({ phone_number: phone })
        .sort({ created_at: -1 })
        .limit(limit)
        .toArray();
}

// ============= TOURNAMENT OPERATIONS =============

/**
 * Get all tournaments
 */
async function getTournaments() {
    const tournaments = getDb().collection('tournaments');
    return await tournaments.find({}).toArray();
}

/**
 * Get tournament by ID
 */
async function getTournament(id) {
    const tournaments = getDb().collection('tournaments');
    return await tournaments.findOne({ id: parseInt(id) });
}

/**
 * Check if user is in tournament
 */
async function isPlayerInTournament(tournamentId, phone) {
    const players = getDb().collection('tournament_players');
    const player = await players.findOne({
        tournament_id: parseInt(tournamentId),
        phone_number: phone
    });
    return player !== null;
}

/**
 * Join tournament
 */
async function joinTournament(tournamentId, phone) {
    const players = getDb().collection('tournament_players');
    const tournaments = getDb().collection('tournaments');

    await players.insertOne({
        tournament_id: parseInt(tournamentId),
        phone_number: phone,
        status: 'ACTIVE',
        joined_at: new Date()
    });

    await tournaments.updateOne(
        { id: parseInt(tournamentId) },
        { $inc: { current_players: 1 } }
    );
}

/**
 * Get tournament players
 */
async function getTournamentPlayers(tournamentId) {
    const players = getDb().collection('tournament_players');
    return await players.find({
        tournament_id: parseInt(tournamentId),
        status: 'ACTIVE'
    }).toArray();
}

/**
 * Update tournament status
 */
async function updateTournamentStatus(tournamentId, status, currentRound = null) {
    const tournaments = getDb().collection('tournaments');
    const update = { $set: { status } };
    if (currentRound !== null) {
        update.$set.current_round = currentRound;
    }
    await tournaments.updateOne({ id: parseInt(tournamentId) }, update);
}

/**
 * Initialize default tournaments if none exist
 */
async function initializeTournaments() {
    const tournaments = getDb().collection('tournaments');
    const count = await tournaments.countDocuments();

    if (count === 0) {
        console.log('[MongoDB] Initializing default tournaments...');
        const defaultTournaments = [
            { id: 1, entry_fee: 20, prize_pool: 2304, max_players: 128, current_players: 0, status: 'WAITING', current_round: 0 },
            { id: 2, entry_fee: 50, prize_pool: 5760, max_players: 128, current_players: 0, status: 'WAITING', current_round: 0 },
            { id: 3, entry_fee: 100, prize_pool: 11520, max_players: 128, current_players: 0, status: 'WAITING', current_round: 0 },
            { id: 4, entry_fee: 200, prize_pool: 23040, max_players: 128, current_players: 0, status: 'WAITING', current_round: 0 },
            { id: 5, entry_fee: 500, prize_pool: 57600, max_players: 128, current_players: 0, status: 'WAITING', current_round: 0 }
        ];
        await tournaments.insertMany(defaultTournaments);
        console.log('[MongoDB] Default tournaments created');
    }
}

// Export all functions
module.exports = {
    connect,
    getDb,
    // User operations
    getUser,
    getUserByIdentifier,
    createUser,
    updateBalance,
    deductBalance,
    addBalance,
    recordWin,
    recordLoss,
    updateProfile,
    deleteUser,
    // Transaction operations
    recordTransaction,
    getTransactionHistory,
    // Tournament operations
    getTournaments,
    getTournament,
    isPlayerInTournament,
    joinTournament,
    getTournamentPlayers,
    updateTournamentStatus,
    initializeTournaments
};
