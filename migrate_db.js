/**
 * Database migration script to add missing columns to transactions table
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'server/game.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    console.log('Connected to the database.');
    runMigration();
});

function runMigration() {
    console.log('Running migration...');

    db.get("PRAGMA table_info(transactions)", [], (err, row) => {
        if (err) {
            console.error('Error checking schema:', err);
            process.exit(1);
        }
    });

    // Check if 'type' column exists
    db.all("PRAGMA table_info(transactions)", [], (err, columns) => {
        if (err) {
            console.error('Error:', err);
            process.exit(1);
        }

        const columnNames = columns.map(c => c.name);
        console.log('Current columns:', columnNames);

        let migrations = [];

        if (!columnNames.includes('type')) {
            migrations.push('ALTER TABLE transactions ADD COLUMN type TEXT');
        }

        if (!columnNames.includes('description')) {
            migrations.push('ALTER TABLE transactions ADD COLUMN description TEXT');
        }

        if (migrations.length === 0) {
            console.log('No migrations needed.');
            db.close();
            process.exit(0);
        }

        console.log('Running migrations:', migrations.length);

        let completed = 0;
        migrations.forEach(sql => {
            console.log('Executing:', sql);
            db.run(sql, (err) => {
                if (err) {
                    console.error('Migration error:', err.message);
                } else {
                    console.log('Migration completed successfully.');
                }
                completed++;
                if (completed === migrations.length) {
                    console.log('All migrations complete.');
                    db.close();
                    process.exit(0);
                }
            });
        });
    });
}
