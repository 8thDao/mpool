
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'server/game.db');
console.log(`Using DB: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Failed to connect:", err.message);
        process.exit(1);
    }
});

db.configure("busyTimeout", 3000); // Wait up to 3s if locked

const phone = '0700000001';
const amount = 500;

db.serialize(() => {
    db.get('SELECT * FROM users WHERE phone_number = ?', [phone], (err, row) => {
        if (err) {
            console.error("Query Error:", err.message);
            process.exit(1);
        }

        if (!row) {
            console.log(`User ${phone} not found. Creating user...`);
            // Create user for convenience
            const cleanPhone = phone;
            const finalUsername = `Player${cleanPhone.slice(-4)}`;
            // Dummy hash
            const dummyHash = '$2a$10$abcdefg';

            db.run('INSERT INTO users (phone_number, balance, password_hash, username, wins, losses) VALUES (?, ?, ?, ?, 0, 0)',
                [cleanPhone, amount, dummyHash, finalUsername], (err) => {
                    if (err) {
                        console.error("Insert failed:", err.message);
                    } else {
                        console.log(`Created user ${phone} with ${amount} coins.`);
                    }
                    db.close();
                });
            return;
        }

        const newBalance = row.balance + amount;
        db.run('UPDATE users SET balance = ? WHERE phone_number = ?', [newBalance, phone], (err) => {
            if (err) {
                console.error("Update failed:", err.message);
            } else {
                console.log(`Updated balance for ${phone}. Old: ${row.balance}, New: ${newBalance}`);
                // Record transaction
                const txId = 'ADMIN-' + Date.now();
                db.run("INSERT INTO transactions (transaction_id, phone_number, amount, type, description) VALUES (?, ?, ?, ?, ?)",
                    [txId, phone, amount, 'ADMIN_CREDIT', 'Manual Credit'], (err) => {
                        if (err) console.error("Tx log failed:", err);
                        db.close();
                    });
            }
        });
    });
});
