const fs = require("node:fs");
const path = require("node:path");
const sqlite3 = require("sqlite3");

const ONE_DAY = 24 * 60 * 60 * 1000;

module.exports = function createSQLiteSessionStore(session) {
  return class SQLiteSessionStore extends session.Store {
    constructor(options = {}) {
      super();
      const directory = path.resolve(options.dir || ".");
      const filename = options.db || "sessoes.db";
      if (path.basename(filename) !== filename) throw new Error("Nome inválido para o banco de sessões.");
      fs.mkdirSync(directory, { recursive: true });
      this.db = new sqlite3.Database(path.join(directory, filename));
      this.ready = new Promise((resolve, reject) => {
        this.db.exec(`CREATE TABLE IF NOT EXISTS sessions (
          sid TEXT PRIMARY KEY,
          expired INTEGER NOT NULL,
          sess TEXT NOT NULL
        ); CREATE INDEX IF NOT EXISTS sessions_expired_idx ON sessions(expired);`,
        (error) => error ? reject(error) : resolve());
      });
      this.cleanupTimer = setInterval(() => this.cleanup(), ONE_DAY);
      this.cleanupTimer.unref();
      this.ready.then(() => this.cleanup()).catch((error) => this.emit("error", error));
    }

    execute(action, callback = () => {}) {
      this.ready.then(action).catch(callback);
    }

    cleanup() {
      this.execute(() => this.db.run("DELETE FROM sessions WHERE expired < ?", [Date.now()],
        (error) => { if (error) this.emit("error", error); }));
    }

    get(sid, callback) {
      this.execute(() => this.db.get(
        "SELECT sess FROM sessions WHERE sid = ? AND expired >= ?",
        [sid, Date.now()],
        (error, row) => {
          if (error) return callback(error);
          if (!row) return callback(null, null);
          try { callback(null, JSON.parse(row.sess)); }
          catch (parseError) { callback(parseError); }
        },
      ), callback);
    }

    set(sid, value, callback = () => {}) {
      let serialized;
      try { serialized = JSON.stringify(value); }
      catch (error) { return callback(error); }
      const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime()
        : Date.now() + (value.cookie?.maxAge || ONE_DAY);
      this.execute(() => this.db.run(
        `INSERT INTO sessions (sid, expired, sess) VALUES (?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET expired = excluded.expired, sess = excluded.sess`,
        [sid, expires, serialized], callback,
      ), callback);
    }

    destroy(sid, callback = () => {}) {
      this.execute(() => this.db.run("DELETE FROM sessions WHERE sid = ?", [sid], callback), callback);
    }

    touch(sid, value, callback = () => {}) {
      const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime()
        : Date.now() + (value.cookie?.maxAge || ONE_DAY);
      this.execute(() => this.db.run(
        "UPDATE sessions SET expired = ? WHERE sid = ? AND expired >= ?",
        [expires, sid, Date.now()], callback,
      ), callback);
    }

    clear(callback = () => {}) {
      this.execute(() => this.db.run("DELETE FROM sessions", callback), callback);
    }

    length(callback) {
      this.execute(() => this.db.get("SELECT COUNT(*) AS total FROM sessions WHERE expired >= ?", [Date.now()],
        (error, row) => callback(error, row?.total || 0)), callback);
    }

    all(callback) {
      this.execute(() => this.db.all("SELECT sess FROM sessions WHERE expired >= ?", [Date.now()],
        (error, rows) => {
          if (error) return callback(error);
          try { callback(null, rows.map((row) => JSON.parse(row.sess))); }
          catch (parseError) { callback(parseError); }
        }), callback);
    }

    close(callback = () => {}) {
      clearInterval(this.cleanupTimer);
      this.ready.then(() => this.db.close(callback)).catch(callback);
    }
  };
};
