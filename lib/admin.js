const CATEGORIAS = new Set([
  "porta", "janela", "box", "fachada", "guarda_corpo", "fechamento",
  "espelho", "cobertura", "manutencao", "outro",
]);
const STATUS = new Set(["recebido", "em_analise", "aguardando_cliente", "aprovado", "concluido", "cancelado"]);

const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value, max = 120) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
const cents = (value, label, allowZero = true) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < (allowZero ? 0 : 1) || number > 1000000000) {
    throw fail(400, `${label} é inválido.`);
  }
  return number;
};

function priceData(body = {}) {
  const categoria = text(body.categoria, 30);
  const modelo = text(body.modelo, 100);
  const descricao = text(body.descricao, 300);
  if (!CATEGORIAS.has(categoria)) throw fail(400, "Escolha uma categoria válida.");
  if (!modelo) throw fail(400, "Informe o modelo ao qual este preço se aplica.");
  return {
    categoria,
    modelo,
    descricao,
    preco_m2_centavos: cents(body.preco_m2_centavos, "O preço por metro quadrado", false),
    preco_minimo_centavos: cents(body.preco_minimo_centavos ?? 0, "O preço mínimo"),
    instalacao_centavos: cents(body.instalacao_centavos ?? 0, "O preço da instalação"),
    ativo: body.ativo !== false ? 1 : 0,
  };
}

function quote(row) {
  return {
    id: row.id,
    codigo: row.codigo,
    usuario_id: row.usuario_id,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    cidade: row.cidade,
    bairro: row.bairro,
    itens: JSON.parse(row.itens_json),
    instalacao: Boolean(row.instalacao),
    observacoes: row.observacoes,
    estimativa_centavos: row.estimativa_centavos,
    status: row.status,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

async function initAdmin({ app, db, exigirAdmin, changesLimit }) {
  app.use("/api/admin", exigirAdmin, changesLimit);

  app.get("/api/admin/resumo", async (_req, res) => {
    const [quotes, clients, prices] = await Promise.all([
      db.get(`SELECT COUNT(*) total,
        SUM(CASE WHEN status IN ('recebido','em_analise','aguardando_cliente') THEN 1 ELSE 0 END) pendentes,
        SUM(CASE WHEN status = 'aprovado' THEN 1 ELSE 0 END) aprovados
        FROM orcamentos`),
      db.get("SELECT COUNT(*) total FROM usuarios WHERE papel = 'cliente'"),
      db.get("SELECT COUNT(*) total FROM precos_orcamento WHERE ativo = 1"),
    ]);
    res.json({
      orcamentos: { total: quotes.total || 0, pendentes: quotes.pendentes || 0, aprovados: quotes.aprovados || 0 },
      clientes: clients.total || 0,
      precos_ativos: prices.total || 0,
    });
  });

  app.get("/api/admin/orcamentos", async (req, res) => {
    const status = text(req.query.status, 30);
    if (status && !STATUS.has(status)) throw fail(400, "Filtro de situação inválido.");
    const rows = status
      ? await db.all("SELECT * FROM orcamentos WHERE status = ? ORDER BY id DESC LIMIT 200", [status])
      : await db.all("SELECT * FROM orcamentos ORDER BY id DESC LIMIT 200");
    res.json({ orcamentos: rows.map(quote) });
  });

  app.put("/api/admin/orcamentos/:id/status", async (req, res) => {
    const id = Number(req.params.id);
    const status = text(req.body?.status, 30);
    if (!Number.isSafeInteger(id) || id < 1 || !STATUS.has(status)) throw fail(400, "Situação inválida.");
    const result = await db.run(
      "UPDATE orcamentos SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
      [status, id],
    );
    if (!result.changes) throw fail(404, "Orçamento não encontrado.");
    res.json({ mensagem: "Situação do orçamento atualizada.", status });
  });

  app.get("/api/admin/precos", async (_req, res) => {
    const rows = await db.all("SELECT * FROM precos_orcamento ORDER BY ativo DESC, categoria, modelo");
    res.json({ precos: rows.map((row) => ({ ...row, ativo: Boolean(row.ativo) })) });
  });

  app.post("/api/admin/precos", async (req, res) => {
    const item = priceData(req.body);
    if (await db.get("SELECT id FROM precos_orcamento WHERE categoria = ? AND modelo = ?", [item.categoria, item.modelo])) {
      throw fail(409, "Já existe um preço para esta categoria e modelo. Use a opção de editar.");
    }
    const result = await db.run(
      `INSERT INTO precos_orcamento
       (categoria,modelo,descricao,preco_m2_centavos,preco_minimo_centavos,instalacao_centavos,ativo)
       VALUES (?,?,?,?,?,?,?)`,
      [item.categoria, item.modelo, item.descricao, item.preco_m2_centavos,
        item.preco_minimo_centavos, item.instalacao_centavos, item.ativo],
    );
    res.status(201).json({ mensagem: "Preço cadastrado.", id: result.lastID });
  });

  app.put("/api/admin/precos/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw fail(400, "Preço inválido.");
    const item = priceData(req.body);
    const result = await db.run(
      `UPDATE precos_orcamento SET categoria=?,modelo=?,descricao=?,preco_m2_centavos=?,
       preco_minimo_centavos=?,instalacao_centavos=?,ativo=?,atualizado_em=CURRENT_TIMESTAMP WHERE id=?`,
      [item.categoria, item.modelo, item.descricao, item.preco_m2_centavos,
        item.preco_minimo_centavos, item.instalacao_centavos, item.ativo, id],
    );
    if (!result.changes) throw fail(404, "Preço não encontrado.");
    res.json({ mensagem: "Preço atualizado." });
  });
}

module.exports = { initAdmin };
