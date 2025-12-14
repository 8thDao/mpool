const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'server/game.db');
const db = new sqlite3.Database(dbPath);

const phone = '0711111111';

db.serialize(() => {
    db.get("SELECT * FROM users WHERE phone_number = ?", [phone], (err, row) => {
        if (err) {
            console.error("Error checking user:", err);
            db.close();
            return;
        }

        if (!row) {
            console.log("User not found, creating...");
            db.run("INSERT INTO users (phone_number, balance) VALUES (?, 1000)", [phone], function (insertErr) {
                if (insertErr) {
                    console.error("Error creating user:", insertErr);
                } else {
                    console.log(`User ${phone} created with balance 1000.`);
                }
                db.close();
            });
        } else {
            console.log("Current Balance:", row.balance);
            db.run("UPDATE users SET balance = balance + 1000 WHERE phone_number = ?", [phone], function (updateErr) {
                if (updateErr) {
                    console.error("Error updating balance:", updateErr);
                } else {
                    console.log("Added 1000.");
                    // Fetch and log the new balance
                    db.get("SELECT balance FROM users WHERE phone_number = ?", [phone], (fetchErr, updatedRow) => {
                        if (fetchErr) {
                            console.error("Error fetching new balance:", fetchErr);
                        } else if (updatedRow) {
                            console.log("New Balance:", updatedRow.balance);
                        }
                        db.close();
                    });
                }
            });
        }
    });
});
