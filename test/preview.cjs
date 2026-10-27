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
  await instance.db.run("UPDATE precos_orcamento SET descricao=?,precos_cores_json=?,preco_m2_centavos=?,preco_minimo_centavos=?,instalacao_centavos=?,origem='empresa' WHERE categoria=? AND modelo=?", ["Linha padrão de demonstração", JSON.stringify({ Branco: 95000, Preto: 109000, Bronze: 112000, Amadeirado: 128000 }), 95000, 80000, 18000, "janela", "De correr"]);
  const material = await instance.db.run(`INSERT INTO materiais_custo
    (codigo,nome,grupo,unidade,custo_unitario_centavos,perda_padrao_bp,fornecedor,referencia_em,custo_confirmado)
    VALUES(?,?,?,?,?,?,?,?,1)`, ["VID-6", "Vidro temperado 6 mm", "Vidro", "m2", 18500, 800, "Fornecedor de demonstração", "2026-10-16"]);
  const ficha = await instance.db.run(`INSERT INTO fichas_tecnicas
    (categoria,modelo,preco_minimo_centavos,validada) VALUES(?,?,?,1)`, ["janela", "De correr", 80000]);
  await instance.db.run(`INSERT INTO ficha_componentes
    (ficha_id,material_id,base_calculo,fator_milesimos) VALUES(?,?,?,?)`, [ficha.lastID, material.lastID, "area_m2", 1000]);
  const demoQuote = await instance.db.run(`INSERT INTO orcamentos(codigo,usuario_id,nome,email,telefone,cidade,bairro,itens_json,instalacao,estimativa_centavos,estimativa_detalhes_json,tipo_calculo,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["MDE-2026-000001", user.lastID, "Ana Ribeiro", "ana@example.test", "21999990001", "Rio de Janeiro", "Centro",
    JSON.stringify([{ categoria: "janela", material: "aluminio_vidro", modelo: "De correr", largura_cm: 120, altura_cm: 100, quantidade: 2, ambiente: "Sala", acessorios: ["Roldanas reforçadas", "Kit de vedação"] }]),
    1, 264000, JSON.stringify([{ categoria: "janela", modelo: "De correr", quantidade: 2, metodo: "composicao", produto_unitario_centavos: 132000,
      subtotal_centavos: 264000, partes_venda_unitarias_centavos: { materiais: 101000, mao_obra: 21000, instalacao: 10000 } }]),
    "composicao", "recebido"]);
  await instance.db.run("INSERT INTO usos_orcamento(usuario_id,periodo_chave,slot,orcamento_id) VALUES(?,?,?,?)",
    [user.lastID, "gratuito", 1, demoQuote.lastID]);
  await instance.db.run("INSERT INTO creditos_orcamento(usuario_id,stripe_session_id,tipo,quantidade,valor_centavos) VALUES(?,?,?,?,?)",
    [user.lastID, "visual-preview-credit", "pacote10", 10, 990]);
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
