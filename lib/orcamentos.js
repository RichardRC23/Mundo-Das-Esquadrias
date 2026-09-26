const CATEGORIAS = new Set([
  "porta", "janela", "box", "fachada", "guarda_corpo", "fechamento",
  "espelho", "cobertura", "manutencao", "outro",
]);
const MATERIAIS = new Set(["aluminio_vidro", "aluminio", "vidro", "manutencao", "outro"]);

const fail = (status, message) => Object.assign(new Error(message), { status });
const clean = (value, max = 200) => {
  if (value == null) return "";
  if (typeof value !== "string") throw fail(400, "Há informações inválidas no orçamento.");
  return value.trim().replace(/\s+/g, " ").slice(0, max);
};

function numberInRange(value, min, max, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw fail(400, `${label} deve estar entre ${min} e ${max}.`);
  }
  return Math.round(number * 10) / 10;
}

function validarOrcamento(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw fail(400, "Preencha os dados do orçamento.");
  }
  const nome = clean(body.nome, 120);
  const email = clean(body.email, 254).toLowerCase() || null;
  const telefone = clean(body.telefone, 30).replace(/\D/g, "");
  const cidade = clean(body.cidade, 100);
  const bairro = clean(body.bairro, 100);
  if (!nome) throw fail(400, "Informe o nome do responsável pelo orçamento.");
  if (!/^\d{10,13}$/.test(telefone)) throw fail(400, "Informe um telefone com DDD.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, "Informe um e-mail válido.");
  if (!cidade) throw fail(400, "Informe a cidade da instalação.");
  if (!Array.isArray(body.itens) || body.itens.length < 1 || body.itens.length > 10) {
    throw fail(400, "Adicione de 1 a 10 itens ao orçamento.");
  }

  const itens = body.itens.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw fail(400, `O item ${index + 1} é inválido.`);
    }
    const categoria = clean(item.categoria, 30);
    const material = clean(item.material, 30);
    if (!CATEGORIAS.has(categoria)) throw fail(400, `Escolha o serviço do item ${index + 1}.`);
    if (!MATERIAIS.has(material)) throw fail(400, `Escolha o material do item ${index + 1}.`);
    return {
      categoria,
      material,
      modelo: clean(item.modelo, 100),
      linha_aluminio: clean(item.linha_aluminio, 60),
      cor: clean(item.cor, 60),
      tipo_vidro: clean(item.tipo_vidro, 60),
      composicao_vidro: clean(item.composicao_vidro, 60),
      espessura_vidro: clean(item.espessura_vidro, 20),
      largura_cm: numberInRange(item.largura_cm, 10, 1500, `A largura do item ${index + 1}`),
      altura_cm: numberInRange(item.altura_cm, 10, 1500, `A altura do item ${index + 1}`),
      quantidade: numberInRange(item.quantidade, 1, 50, `A quantidade do item ${index + 1}`),
      ambiente: clean(item.ambiente, 80),
      detalhes: clean(item.detalhes, 500),
    };
  }).map((item, index) => {
    if (!Number.isInteger(item.quantidade)) throw fail(400, `A quantidade do item ${index + 1} deve ser um número inteiro.`);
    return item;
  });

  return {
    nome, email, telefone, cidade, bairro, itens,
    instalacao: body.instalacao !== false,
    observacoes: clean(body.observacoes, 1000),
  };
}

async function initOrcamentos({ app, db, exigirLogin, changesLimit }) {
  await db.run(`CREATE TABLE IF NOT EXISTS orcamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE,
    usuario_id INTEGER,
    nome TEXT NOT NULL,
    email TEXT,
    telefone TEXT NOT NULL,
    cidade TEXT NOT NULL,
    bairro TEXT,
    itens_json TEXT NOT NULL,
    instalacao INTEGER NOT NULL DEFAULT 1,
    observacoes TEXT,
    status TEXT NOT NULL DEFAULT 'recebido',
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
  )`);
  const quoteColumns = await db.all("PRAGMA table_info(orcamentos)");
  for (const [name, type] of [["estimativa_centavos", "INTEGER"], ["estimativa_detalhes_json", "TEXT"], ["atualizado_em", "TEXT"]]) {
    if (!quoteColumns.some((column) => column.name === name)) await db.run(`ALTER TABLE orcamentos ADD COLUMN ${name} ${type}`);
  }
  await db.run(`CREATE TABLE IF NOT EXISTS precos_orcamento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria TEXT NOT NULL,
    modelo TEXT NOT NULL,
    descricao TEXT,
    preco_m2_centavos INTEGER NOT NULL,
    preco_minimo_centavos INTEGER NOT NULL DEFAULT 0,
    instalacao_centavos INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT,
    UNIQUE (categoria, modelo)
  )`);

  async function calcularEstimativa(itens, instalacao) {
    const rules = await db.all("SELECT * FROM precos_orcamento WHERE ativo = 1");
    const indexed = new Map(rules.map((rule) => [`${rule.categoria}\u0000${rule.modelo}`, rule]));
    let total = 0;
    const detalhes = [];
    for (const item of itens) {
      const rule = indexed.get(`${item.categoria}\u0000${item.modelo}`);
      if (!rule) return { total: null, detalhes: [] };
      const areaM2 = Math.round((item.largura_cm * item.altura_cm / 10000) * 1000) / 1000;
      const base = Math.round(areaM2 * rule.preco_m2_centavos);
      const produtoUnitario = Math.max(base, rule.preco_minimo_centavos);
      const instalacaoUnitaria = instalacao ? rule.instalacao_centavos : 0;
      const subtotal = (produtoUnitario + instalacaoUnitaria) * item.quantidade;
      total += subtotal;
      detalhes.push({
        categoria: item.categoria, modelo: item.modelo, quantidade: item.quantidade,
        area_m2: areaM2, produto_unitario_centavos: produtoUnitario,
        instalacao_unitaria_centavos: instalacaoUnitaria, subtotal_centavos: subtotal,
      });
    }
    return { total, detalhes };
  }

  app.get("/api/catalogo/precos", async (_req, res) => {
    const rows = await db.all(
      `SELECT categoria,modelo,descricao,preco_m2_centavos,preco_minimo_centavos,instalacao_centavos
       FROM precos_orcamento WHERE ativo = 1 ORDER BY categoria,modelo`,
    );
    res.json({ precos: rows });
  });

  app.post("/api/orcamentos", changesLimit, async (req, res) => {
    const dados = validarOrcamento(req.body);
    const usuarioId = req.session.usuario?.id || null;
    const estimativa = await calcularEstimativa(dados.itens, dados.instalacao);
    const result = await db.run(
      `INSERT INTO orcamentos
       (usuario_id,nome,email,telefone,cidade,bairro,itens_json,instalacao,observacoes,estimativa_centavos,estimativa_detalhes_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [usuarioId, dados.nome, dados.email, dados.telefone, dados.cidade, dados.bairro,
        JSON.stringify(dados.itens), dados.instalacao ? 1 : 0, dados.observacoes || null,
        estimativa.total, estimativa.total == null ? null : JSON.stringify(estimativa.detalhes)],
    );
    const codigo = `MDE-${new Date().getFullYear()}-${String(result.lastID).padStart(6, "0")}`;
    await db.run("UPDATE orcamentos SET codigo = ? WHERE id = ?", [codigo, result.lastID]);
    res.status(201).json({
      mensagem: "Solicitação de orçamento registrada com sucesso.",
      orcamento: { codigo, status: "recebido", estimativa_centavos: estimativa.total },
    });
  });

  app.get("/api/orcamentos", exigirLogin, async (req, res) => {
    const rows = await db.all(
      `SELECT codigo,itens_json,instalacao,estimativa_centavos,status,criado_em,atualizado_em
       FROM orcamentos WHERE usuario_id = ? ORDER BY id DESC LIMIT 50`,
      [req.session.usuario.id],
    );
    res.json({ orcamentos: rows.map((row) => ({
      codigo: row.codigo,
      itens: JSON.parse(row.itens_json),
      instalacao: Boolean(row.instalacao),
      estimativa_centavos: row.estimativa_centavos,
      status: row.status,
      criado_em: row.criado_em,
      atualizado_em: row.atualizado_em,
    })) });
  });
}

module.exports = { initOrcamentos, validarOrcamento };
