const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'server/game.db');
console.log('Opening database:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
    console.log('Connected.');

    db.run('UPDATE users SET balance = 1000 WHERE phone_number = ?', ['0712345678'], function (err) {
        if (err) {
            console.error('Update error:', err);
        } else {
            console.log('Rows changed:', this.changes);
            console.log('Credited TestPlayer1 (0712345678) with 1000');
        }

        db.close(() => {
            console.log('Done.');
            process.exit(0);
        });
    });
});
