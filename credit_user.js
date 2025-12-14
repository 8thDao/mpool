
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'server/game.db');
console.log(`Connecting to DB at: ${dbPath}`);
const db = new sqlite3.Database(dbPath);

const phone = '0700000001';
const amount = 500;

db.serialize(() => {
    // Check tables first
    db.all("SELECT name FROM sqlite_master WHERE type='table';", [], (err, tables) => {
        if (err) {
            console.error("Error listing tables:", err);
            return;
        }
        console.log("Tables found:", tables.map(t => t.name));
    });

    db.get('SELECT * FROM users WHERE phone_number = ?', [phone], (err, row) => {
        if (err) {
            console.error("Error finding user:", err);
            db.close();
            return;
        }
        if (!row) {
            console.log(`User ${phone} not found.`);
            db.close();
            return;
        }

        const newBalance = row.balance + amount;
        db.run('UPDATE users SET balance = ? WHERE phone_number = ?', [newBalance, phone], (err) => {
            if (err) {
                console.error("Update failed:", err.message);
            } else {
                console.log(`SUCCESS: Updated balance for ${phone}. New Balance: ${newBalance}`);

                // Also log transaction
                const stmt = db.prepare("INSERT INTO transactions (transaction_id, phone_number, amount, type, description) VALUES (?, ?, ?, ?, ?)");
                const txId = 'ADMIN-' + Date.now();
                stmt.run(txId, phone, amount, 'ADMIN_CREDIT', 'Manual credit by admin', (err) => {
                    if (err) console.error("Tx Log failed:", err);
                    stmt.finalize(() => {
                        db.close();
                    });
                });
            }
        });
    });
});
