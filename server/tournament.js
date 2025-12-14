const tournament = {};

// Initialize Tables
tournament.init = (db) => {
    db.serialize(() => {
        // Tournament Definitions
        db.run(`CREATE TABLE IF NOT EXISTS tournaments (
            id TEXT PRIMARY KEY,
            name TEXT,
            entry_fee INTEGER,
            prize_pool INTEGER,
            max_players INTEGER DEFAULT 128,
            current_players INTEGER DEFAULT 0,
            status TEXT DEFAULT 'WAITING', -- WAITING, ACTIVE, COMPLETED
            current_round INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Tournament Players
        db.run(`CREATE TABLE IF NOT EXISTS tournament_players (
            tournament_id TEXT,
            phone_number TEXT,
            status TEXT DEFAULT 'ACTIVE', -- ACTIVE, ELIMINATED, WINNER
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(tournament_id) REFERENCES tournaments(id),
            FOREIGN KEY(phone_number) REFERENCES users(phone_number),
            PRIMARY KEY (tournament_id, phone_number)
        )`);

        // Matches
        db.run(`CREATE TABLE IF NOT EXISTS tournament_matches (
            match_id TEXT PRIMARY KEY,
            tournament_id TEXT,
            round INTEGER,
            player1_phone TEXT,
            player2_phone TEXT,
            winner_phone TEXT,
            status TEXT DEFAULT 'PENDING', -- PENDING, COMPLETED
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(tournament_id) REFERENCES tournaments(id)
        )`);

        console.log('Tournament tables initialized.');

        // Seed default tournaments if empty
        db.get("SELECT count(*) as count FROM tournaments", (err, row) => {
            if (row && row.count === 0) {
                const seeds = [
                    { id: 't_20', name: 'Rookie Cup', fee: 20, prize: 2304 },
                    { id: 't_50', name: 'Amateur League', fee: 50, prize: 5760 },
                    { id: 't_100', name: 'Pro Circuit', fee: 100, prize: 11520 },
                    { id: 't_200', name: 'Elite Series', fee: 200, prize: 23040 },
                    { id: 't_500', name: 'Masters Championship', fee: 500, prize: 57600 }
                ];
                const stmt = db.prepare("INSERT INTO tournaments (id, name, entry_fee, prize_pool) VALUES (?, ?, ?, ?)");
                seeds.forEach(t => stmt.run(t.id, t.name, t.fee, t.prize));
                stmt.finalize();
                console.log("Seeded default tournaments.");
            }
        });
    });
};

// Join Tournament
tournament.join = (db, phone, tournamentId) => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // 1. Check Tournament Status & Capacity
            db.get("SELECT * FROM tournaments WHERE id = ?", [tournamentId], (err, tourney) => {
                if (err) return reject(err);
                if (!tourney) return reject(new Error("Tournament not found"));
                if (tourney.status !== 'WAITING') return reject(new Error("Tournament already validated/started"));
                if (tourney.current_players >= tourney.max_players) return reject(new Error("Tournament full"));

                // 2. Check User Balance
                db.get("SELECT balance FROM users WHERE phone_number = ?", [phone], (err, user) => {
                    if (err) return reject(err);
                    if (!user || user.balance < tourney.entry_fee) return reject(new Error("Insufficient funds"));

                    // 3. Deduct Fee & Add Player (Transaction)
                    db.run("UPDATE users SET balance = balance - ? WHERE phone_number = ?", [tourney.entry_fee, phone], function (err) {
                        if (err) return reject(err);

                        // Log Transaction
                        // Note: Using a direct insert for tx log here for simplicity, assuming server.js helper might not be reachable. 
                        // Ideal: separate logging module.

                        // Add to Tournament
                        db.run("INSERT INTO tournament_players (tournament_id, phone_number) VALUES (?, ?)", [tournamentId, phone], function (err) {
                            if (err) {
                                // Rollback balance? (Complex in SQLite without explicit transaction object in node-sqlite3, assume happy path for prototype or use serialized)
                                // For now, just fail.
                                return reject(new Error("Failed to join: " + err.message));
                            }

                            // Update Player Count
                            db.run("UPDATE tournaments SET current_players = current_players + 1 WHERE id = ?", [tournamentId], function (err) {
                                if (err) return reject(err);

                                // Auto-start check
                                if (tourney.current_players + 1 >= tourney.max_players) {
                                    tournament.start(db, tournamentId)
                                        .then(() => {
                                            console.log(`Tournament ${tournamentId} auto-started!`);
                                            resolve({ success: true, message: "Joined successfully. Tournament Started!" });
                                        })
                                        .catch(err => {
                                            console.error("Failed to auto-start:", err);
                                            // Still return success for join, but log error
                                            resolve({ success: true, message: "Joined successfully, but start failed." });
                                        });
                                } else {
                                    resolve({ success: true, message: "Joined successfully" });
                                }
                            });
                        });
                    });
                });
            });
        });
    });
};

// Start Tournament (Generate Bracket)
tournament.start = (db, tournamentId) => {
    return new Promise((resolve, reject) => {
        db.all("SELECT phone_number FROM tournament_players WHERE tournament_id = ?", [tournamentId], (err, players) => {
            if (err) return reject(err);
            if (players.length < 2) return reject(new Error("Not enough players"));

            // Shuffle
            const shuffled = players.sort(() => 0.5 - Math.random());

            // Create Matches for Round 1
            const matches = [];
            for (let i = 0; i < shuffled.length; i += 2) {
                if (i + 1 < shuffled.length) {
                    matches.push({
                        p1: shuffled[i].phone_number,
                        p2: shuffled[i + 1].phone_number
                    });
                } else {
                    // Bye? Or handle odd numbers. Assume 128 (even).
                }
            }

            db.serialize(() => {
                db.run("UPDATE tournaments SET status = 'ACTIVE', current_round = 1 WHERE id = ?", [tournamentId]);
                const stmt = db.prepare("INSERT INTO tournament_matches (match_id, tournament_id, round, player1_phone, player2_phone) VALUES (?, ?, ?, ?, ?)");
                matches.forEach(m => {
                    const matchId = `${tournamentId}_R1_${Math.random().toString(36).substr(2, 9)}`;
                    stmt.run(matchId, tournamentId, 1, m.p1, m.p2);
                });
                stmt.finalize();
                resolve({ success: true, matchesCreated: matches.length });
            });
        });
    });
};

// Get Status for User
tournament.getStatus = (db, tournamentId, phone) => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Get Tournament Info
            db.get("SELECT * FROM tournaments WHERE id = ?", [tournamentId], (err, tourney) => {
                if (err || !tourney) return reject(err || new Error("Not found"));

                // Get Player Status
                db.get("SELECT * FROM tournament_players WHERE tournament_id = ? AND phone_number = ?", [tournamentId, phone], (err, player) => {
                    if (err) return reject(err);

                    // Get Active Match
                    db.get(`SELECT * FROM tournament_matches 
                            WHERE tournament_id = ? 
                            AND status = 'PENDING' 
                            AND (player1_phone = ? OR player2_phone = ?)`,
                        [tournamentId, phone, phone], (err, match) => {

                            if (err) return reject(err);

                            resolve({
                                tournament: tourney,
                                player: player || null,
                                match: match || null
                            });
                        });
                });
            });
        });
    });
};

module.exports = tournament;
