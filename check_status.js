const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'server/game.db'));

const PHONE = '0788888888'; // TestWinner
const TOURNAMENT_ID = 't_50';

db.get("SELECT * FROM tournament_players WHERE tournament_id = ? AND phone_number = ?", [TOURNAMENT_ID, PHONE], (err, row) => {
    if (err) console.error(err);
    if (row) {
        console.log("SUCCESS: User is in the tournament.");
        console.log(row);
    } else {
        console.log("FAIL: User is NOT in the tournament.");
    }
    db.close();
});
