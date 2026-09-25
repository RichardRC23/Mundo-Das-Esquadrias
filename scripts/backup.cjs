// Consistent SQLite snapshots; does not modify or overwrite the source databases.
const fs = require("node:fs");
const path = require("node:path");
const sqlite3 = require("sqlite3");

(async () => {
  const data = path.join(__dirname, "..", "data");
  const parent = path.join(data, "backups");
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, "antes-area-cliente-"));
  for (const filename of ["usuarios.db", "sessoes.db"]) {
    const source = path.join(data, filename);
    if (!fs.existsSync(source)) continue;
    const db = await new Promise((resolve, reject) => {
      const connection = new sqlite3.Database(source, sqlite3.OPEN_READONLY,
        (error) => error ? reject(error) : resolve(connection));
    });
    try {
      const backup = await new Promise((resolve, reject) => {
        const operation = db.backup(path.join(directory, filename), (error) => error ? reject(error) : resolve(operation));
      });
      try {
        await new Promise((resolve, reject) => backup.step(-1, (error, completed) => {
          if (error) reject(error);
          else if (!completed) reject(new Error("Backup incompleto; tente novamente."));
          else resolve();
        }));
      } finally { await new Promise((resolve) => backup.finish(resolve)); }
    } finally { await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
  }
  console.log(`Backup dos bancos salvo em: ${directory}`);
})().catch((error) => { console.error("Backup não concluído:", error.message); process.exitCode = 1; });
