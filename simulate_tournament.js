const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'server/game.db');
const db = new sqlite3.Database(dbPath);

const TOURNAMENT_ID = 't_50'; // Amateur League

// Helper: wrapper for db.run
const run = (sql, params) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const BOT_COUNT = 127; // + 1 real user = 128

async function simulate() {
    console.log(`Resetting Tournament ${TOURNAMENT_ID}...`);

    // 0. Reset state
    await run("DELETE FROM tournament_players WHERE tournament_id = ?", [TOURNAMENT_ID]);
    await run("DELETE FROM tournament_matches WHERE tournament_id = ?", [TOURNAMENT_ID]);
    await run("UPDATE tournaments SET current_players = 0, status = 'WAITING', current_round = 0 WHERE id = ?", [TOURNAMENT_ID]);

    console.log(`Starting Simulation: Adding ${BOT_COUNT} bots to ${TOURNAMENT_ID}`);

    for (let i = 1; i <= BOT_COUNT; i++) {
        const phone = `0699000${i.toString().padStart(3, '0')}`;
        const username = `Bot_${i}`;

        try {
            // 1. Create User (if not exists)
            await run(`INSERT OR IGNORE INTO users (phone_number, balance, password_hash, username) VALUES (?, 1000, ?, ?)`,
                [phone, 'hash', username]);

            // 2. Add to Tournament (Direct DB insert)
            await run(`INSERT OR IGNORE INTO tournament_players (tournament_id, phone_number) VALUES (?, ?)`,
                [TOURNAMENT_ID, phone]);

        } catch (err) {
            console.error(`Error for ${username}:`, err.message);
        }
    }

    // Fix count
    db.get(`SELECT count(*) as count FROM tournament_players WHERE tournament_id = ?`, [TOURNAMENT_ID], async (err, row) => {
        console.log(`Current Players in ${TOURNAMENT_ID}: ${row.count}`);
        await run(`UPDATE tournaments SET current_players = ? WHERE id = ?`, [row.count, TOURNAMENT_ID]);

        console.log("Simulation Complete. Tournament ready for 128th player.");
        db.close();
    });
}

simulate();
