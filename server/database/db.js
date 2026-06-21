const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const configuredPath = process.env.DB_PATH || "./database/sendtowp.db";
const dbPath = path.isAbsolute(configuredPath)
  ? configuredPath
  : path.resolve(__dirname, "..", configuredPath.replace(/^\.\/database[\\/]/, "database/"));

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath, (error) => {
  if (error) console.error("Unable to open database:", error.message);
});

db.serialize(() => {
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA busy_timeout = 5000");
  db.run(`
    CREATE TABLE IF NOT EXISTS ScheduledMessages (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      Phone TEXT NOT NULL,
      Message TEXT NOT NULL,
      ScheduleTime TEXT NOT NULL,
      RepeatType TEXT NOT NULL DEFAULT 'None',
      Status TEXT NOT NULL DEFAULT 'Pending',
      RetryCount INTEGER NOT NULL DEFAULT 0,
      ErrorMessage TEXT,
      CreatedOn TEXT NOT NULL,
      UpdatedOn TEXT NOT NULL,
      LastExecutionTime TEXT
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS IX_ScheduledMessages_Status_ScheduleTime ON ScheduledMessages(Status, ScheduleTime)");
  db.run("CREATE INDEX IF NOT EXISTS IX_ScheduledMessages_Phone ON ScheduledMessages(Phone)");

  db.run(`
    CREATE TABLE IF NOT EXISTS AutoReplySettings (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      IsEnabled INTEGER NOT NULL DEFAULT 1,
      FixedReplyEnabled INTEGER NOT NULL DEFAULT 1,
      AlwaysSendFixedMessage INTEGER NOT NULL DEFAULT 1,
      AIReplyEnabled INTEGER NOT NULL DEFAULT 1,
      FixedReplyText TEXT,
      CreatedOn TEXT NOT NULL,
      UpdatedOn TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS AutoReplyHistory (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      Phone TEXT NOT NULL,
      ContactName TEXT,
      IncomingMessage TEXT,
      FixedReply TEXT,
      AIReply TEXT,
      CreatedOn TEXT NOT NULL
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS IX_AutoReplyHistory_Phone ON AutoReplyHistory(Phone)");

  // Seed default settings if table is empty
  db.get("SELECT COUNT(*) AS count FROM AutoReplySettings", (err, row) => {
    if (err) {
      console.error("Error checking AutoReplySettings:", err.message);
      return;
    }
    if (row && row.count === 0) {
      const now = new Date().toISOString();
      const defaultText = "Hi 👋\n\nThank you for contacting me.\n\nI have received your message and will respond as soon as possible.";
      db.run(
        `INSERT INTO AutoReplySettings
         (IsEnabled, FixedReplyEnabled, AlwaysSendFixedMessage, AIReplyEnabled, FixedReplyText, CreatedOn, UpdatedOn)
         VALUES (1, 1, 1, 1, ?, ?, ?)`,
        [defaultText, now, now],
        (insertErr) => {
          if (insertErr) {
            console.error("Error seeding default AutoReplySettings:", insertErr.message);
          } else {
            console.log("Default AutoReplySettings initialized successfully");
          }
        }
      );
    }
  });
});

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });

module.exports = { db, run, get, all };
