// Isolated visual QA server. Never serves or modifies the real customer database.
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const bcrypt = require("bcrypt");
process.env.STRIPE_SECRET_KEY = "";
const { createApp } = require("../server");
(async () => {
  const port = Number(process.env.PREVIEW_PORT || 3100);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mde-visual-qa-"));
  const instance = await createApp({ dataDir: directory, origin: `http://localhost:${port}`, sessionSecret: "isolated-visual-preview-not-used-for-customer-sessions" });
  const user = await instance.db.run("INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES(?,?,?,?)", ["Ana Ribeiro", "ana@example.test", await bcrypt.hash("Teste-visual-2026!", 12), "admin"]);
  await instance.db.run("INSERT INTO compras(usuario_id,titulo,descricao,status,valor_centavos) VALUES(?,?,?,?,?)", [user.lastID, "Janelas de alumínio", "Pedido de demonstração para conferir o layout", "em_andamento", 240000]);
  await instance.db.run("INSERT INTO contratos(usuario_id,titulo,status,valor_centavos) VALUES(?,?,?,?)", [user.lastID, "Instalação de esquadrias", "assinado", 240000]);
  await instance.db.run("INSERT INTO precos_orcamento(categoria,modelo,descricao,preco_m2_centavos,preco_minimo_centavos,instalacao_centavos) VALUES(?,?,?,?,?,?)", ["janela", "De correr", "Linha padrão de demonstração", 95000, 80000, 18000]);
  await instance.db.run(`INSERT INTO orcamentos(codigo,usuario_id,nome,email,telefone,cidade,bairro,itens_json,instalacao,estimativa_centavos,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`, ["MDE-2026-000001", user.lastID, "Ana Ribeiro", "ana@example.test", "21999990001", "Rio de Janeiro", "Centro",
    JSON.stringify([{ categoria: "janela", material: "aluminio_vidro", modelo: "De correr", largura_cm: 120, altura_cm: 100, quantidade: 2, ambiente: "Sala" }]), 1, 264000, "recebido"]);
  instance.app.get("/__preview", (req, res, next) => {
    req.session.usuario = { id: user.lastID, nome: "Ana Ribeiro" };
    req.session.save((error) => error ? next(error) : res.redirect("/perfil.html"));
  });
  instance.app.get("/__admin", (req, res, next) => {
    req.session.usuario = { id: user.lastID, nome: "Ana Ribeiro" };
    req.session.save((error) => error ? next(error) : res.redirect("/admin.html"));
  });
  const server = instance.app.listen(port, "127.0.0.1", () => console.log(`Visual QA: http://127.0.0.1:${port}/__preview (isolated demo data)`));
  server.on("error", (error) => { console.error(error.message); process.exit(1); });
})();
