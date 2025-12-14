const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'server/game.db'));
const tournament = require('./server/tournament');

const PHONE = '0788888888'; // TestWinner
const TOURNAMENT_ID = 't_50';

async function verify() {
    console.log(`Attempting to join ${TOURNAMENT_ID} with ${PHONE}...`);

    try {
        const result = await tournament.join(db, PHONE, TOURNAMENT_ID);
        console.log("Join Result:", result);
    } catch (err) {
        console.error("Join Failed:", err.message);
    }

    // Check Status
    db.get("SELECT status, current_players, current_round FROM tournaments WHERE id = ?", [TOURNAMENT_ID], (err, row) => {
        if (err) console.error(err);
        console.log('\n--- Tournament State ---');
        console.log(row);

        if (row.status === 'ACTIVE') {
            console.log("SUCCESS: Tournament is ACTIVE.");
        } else {
            console.log("FAIL: Tournament is NOT ACTIVE.");
        }

        db.all("SELECT * FROM tournament_matches WHERE tournament_id = ? LIMIT 5", [TOURNAMENT_ID], (err, rows) => {
            console.log(`\nmatches created (sample 5):`);
            console.log(rows);
            if (rows.length > 0) {
                console.log(`SUCCESS: ${rows.length}+ matches found.`);
            }
            db.close();
        });
    });
}

// We need to init tournament (loading tables etc is fine, but we just need DB connection)
// tournament.init(db); // Not strictly needed if tables exist, but safe.
verify();
