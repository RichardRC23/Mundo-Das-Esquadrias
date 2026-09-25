// Isolated visual QA server. Never serves or modifies the real customer database.
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const bcrypt = require("bcrypt");
process.env.STRIPE_SECRET_KEY = "";
const { createApp } = require("../server");
(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mde-visual-qa-"));
  const instance = await createApp({ dataDir: directory, origin: "http://localhost:3100", sessionSecret: "isolated-visual-preview-not-used-for-customer-sessions" });
  const user = await instance.db.run("INSERT INTO usuarios(nome,email,senha_hash) VALUES(?,?,?)", ["Ana Ribeiro", "ana@example.test", await bcrypt.hash("Teste-visual-2026!", 12)]);
  await instance.db.run("INSERT INTO compras(usuario_id,titulo,descricao,status,valor_centavos) VALUES(?,?,?,?,?)", [user.lastID, "Janelas de alumínio", "Pedido de demonstração para conferir o layout", "em_andamento", 240000]);
  await instance.db.run("INSERT INTO contratos(usuario_id,titulo,status,valor_centavos) VALUES(?,?,?,?)", [user.lastID, "Instalação de esquadrias", "assinado", 240000]);
  instance.app.get("/__preview", (req, res, next) => {
    req.session.usuario = { id: user.lastID, nome: "Ana Ribeiro" };
    req.session.save((error) => error ? next(error) : res.redirect("/perfil.html"));
  });
  const server = instance.app.listen(3100, "127.0.0.1", () => console.log("Visual QA: http://127.0.0.1:3100/__preview (isolated demo data)"));
  server.on("error", (error) => { console.error(error.message); process.exit(1); });
})();
