const path = require("node:path");
const sqlite3 = require("sqlite3").verbose();

const email = String(process.argv[2] || "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Uso: node scripts/promover-admin.cjs email@exemplo.com");
  process.exit(1);
}

const database = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"), "usuarios.db");
const db = new sqlite3.Database(database);
const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (error) {
  if (error) reject(error); else resolve({ changes: this.changes });
}));
const all = (sql) => new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)));

(async () => {
  const columns = await all("PRAGMA table_info(usuarios)");
  if (!columns.some((column) => column.name === "papel")) {
    await run("ALTER TABLE usuarios ADD COLUMN papel TEXT NOT NULL DEFAULT 'cliente'");
  }
  const result = await run("UPDATE usuarios SET papel = 'admin' WHERE lower(email) = ?", [email]);
  if (!result.changes) throw new Error("Nenhuma conta foi encontrada com esse e-mail. Cadastre ou confirme o endereço e tente novamente.");
  console.log("Conta promovida a administradora com sucesso.");
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => db.close());
