const { propostas } = require("./propostas");
const { REFERENCIA_PRECOS, PRECOS_INICIAIS, AJUSTES_PRECO, ajustarProduto } = require("./catalogo-precos");
const CATEGORIAS = new Set([
  "porta", "janela", "box", "fachada", "guarda_corpo", "fechamento",
  "espelho", "cobertura", "manutencao", "outro",
]);
const MATERIAIS = new Set(["aluminio_vidro", "aluminio", "vidro", "manutencao", "outro"]);
const PORTA_ESPECIFICACOES = Object.freeze({
  numero_folhas: new Set(["A definir", "1", "2", "3", "4", "5", "6", "8"]),
  configuracao_folhas: new Set(["A definir", "Todas móveis", "1 móvel e demais fixas", "2 móveis e demais fixas", "Laterais fixas e centrais móveis", "Todas de giro", "Articuladas"]),
  sentido_abertura: new Set(["A definir", "Direita", "Esquerda", "Ambos os lados", "Para dentro", "Para fora"]),
  trilhos: new Set(["A definir", "Sem trilho", "1 trilho", "2 trilhos", "3 trilhos", "4 trilhos"]),
  fechadura: new Set(["A definir", "Padrão com chave", "Bico de papagaio", "Multiponto", "Digital", "Sem fechadura"]),
  puxador: new Set(["A definir", "Concha", "Alça", "Tubular", "Embutido", "Sem puxador"]),
  soleira: new Set(["A definir", "Convencional", "Embutida", "Baixa acessível", "Sem soleira"]),
  tipo_instalacao: new Set(["A definir", "Vão novo", "Substituição", "Adequação do vão"]),
  retirada_existente: new Set(["A definir", "Sim", "Não"]),
  tela_mosquiteira: new Set(["A definir", "Sim", "Não"]),
  automatizacao: new Set(["A definir", "Sim", "Não"]),
});

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

function especificacoesPorta(item, categoria, index) {
  const result = {};
  for (const [field, allowed] of Object.entries(PORTA_ESPECIFICACOES)) {
    if (categoria !== "porta") {
      result[field] = "";
      continue;
    }
    const value = clean(item[field], 60) || "A definir";
    if (!allowed.has(value)) throw fail(400, `A especificação ${field.replaceAll("_", " ")} do item ${index + 1} é inválida.`);
    result[field] = value;
  }
  return result;
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
      ...especificacoesPorta(item, categoria, index),
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

async function initOrcamentos({ app, db, exigirLogin, changesLimit, comprasOrcamentoConfiguradas = false, aceitarCreditosMPTeste = false }) {
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
  for (const [name, type] of [["estimativa_centavos", "INTEGER"], ["estimativa_detalhes_json", "TEXT"], ["atualizado_em", "TEXT"], ["removido_em", "TEXT"]]) {
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
    origem TEXT NOT NULL DEFAULT 'empresa',
    referencia_em TEXT,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT,
    UNIQUE (categoria, modelo)
  )`);
  const priceColumns = await db.all("PRAGMA table_info(precos_orcamento)");
  for (const [name, type] of [["origem", "TEXT NOT NULL DEFAULT 'empresa'"], ["referencia_em", "TEXT"]]) {
    if (!priceColumns.some((column) => column.name === name)) await db.run(`ALTER TABLE precos_orcamento ADD COLUMN ${name} ${type}`);
  }
  for (const item of PRECOS_INICIAIS) {
    await db.run(`INSERT OR IGNORE INTO precos_orcamento
      (categoria,modelo,descricao,preco_m2_centavos,preco_minimo_centavos,instalacao_centavos,ativo,origem,referencia_em)
      VALUES (?,?,?,?,?,?,1,'referencia',?)`,
    [item.categoria, item.modelo, item.descricao, item.preco_m2_centavos,
      item.preco_minimo_centavos, item.instalacao_centavos, REFERENCIA_PRECOS.data]);
  }
  await db.run(`CREATE TABLE IF NOT EXISTS usos_orcamento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    periodo_chave TEXT NOT NULL,
    slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 10),
    orcamento_id INTEGER UNIQUE REFERENCES orcamentos(id) ON DELETE SET NULL,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (usuario_id, periodo_chave, slot)
  )`);

  async function acessoOrcamentos(usuarioId) {
    const gratis = await db.get(
      "SELECT COUNT(*) AS usados FROM usos_orcamento WHERE usuario_id = ? AND periodo_chave = 'gratuito'",
      [usuarioId],
    );
    if (!gratis.usados) {
      return { plano: "gratuito", limite: 1, usados: 0, restantes: 1 };
    }

    const lotes = await db.all(`SELECT c.id,c.quantidade,COUNT(u.id) AS usados
      FROM creditos_orcamento c LEFT JOIN usos_orcamento u
        ON u.usuario_id=c.usuario_id AND u.periodo_chave='compra:' || c.id
      WHERE c.usuario_id=? AND c.revogado=0 AND (c.stripe_session_id NOT LIKE 'mp:test:%' OR ?)
      GROUP BY c.id ORDER BY c.id`, [usuarioId, aceitarCreditosMPTeste ? 1 : 0]);
    const limite = lotes.reduce((total, lote) => total + lote.quantidade, 0);
    const usados = lotes.reduce((total, lote) => total + lote.usados, 0);
    return {
      plano: limite ? "creditos" : "gratuito", limite, usados, restantes: Math.max(0, limite - usados),
      compra_disponivel: comprasOrcamentoConfiguradas,
      opcoes: { individual: { quantidade: 1, preco_centavos: 599 }, pacote10: { quantidade: 10, preco_centavos: 990 } },
    };
  }

  async function reservarUso(usuarioId, acesso) {
    if (!acesso.restantes) throw fail(402, "Você já utilizou seus orçamentos disponíveis. Compre outro crédito para continuar.");
    if (acesso.plano === "gratuito") {
      const result = await db.run(`INSERT INTO usos_orcamento (usuario_id,periodo_chave,slot)
        SELECT ?, 'gratuito', 1 WHERE NOT EXISTS
        (SELECT 1 FROM usos_orcamento WHERE usuario_id=? AND periodo_chave='gratuito')`, [usuarioId, usuarioId]);
      if (result.changes) return { id: result.lastID, periodo: "gratuito" };
    } else {
      const lotes = await db.all(`SELECT id,quantidade FROM creditos_orcamento WHERE usuario_id=? AND revogado=0
        AND (stripe_session_id NOT LIKE 'mp:test:%' OR ?) ORDER BY id`, [usuarioId, aceitarCreditosMPTeste ? 1 : 0]);
      for (const lote of lotes) {
        const periodo = `compra:${lote.id}`;
        const result = await db.run(`INSERT INTO usos_orcamento (usuario_id,periodo_chave,slot)
          SELECT ?, ?, COUNT(*) + 1 FROM usos_orcamento
          WHERE usuario_id=? AND periodo_chave=? HAVING COUNT(*) < ?
          AND EXISTS(SELECT 1 FROM creditos_orcamento WHERE id=? AND usuario_id=? AND revogado=0
            AND (stripe_session_id NOT LIKE 'mp:test:%' OR ?))`,
        [usuarioId, periodo, usuarioId, periodo, lote.quantidade, lote.id, usuarioId, aceitarCreditosMPTeste ? 1 : 0]);
        if (result.changes) return { id: result.lastID, periodo };
      }
    }
    throw fail(402, "Você já utilizou seus orçamentos disponíveis. Compre outro crédito para continuar.");
  }

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
      const produtoBase = Math.max(base, rule.preco_minimo_centavos);
      const produtoUnitario = ajustarProduto(produtoBase, item);
      const instalacaoUnitaria = instalacao ? rule.instalacao_centavos : 0;
      const subtotal = (produtoUnitario + instalacaoUnitaria) * item.quantidade;
      total += subtotal;
      detalhes.push({
        categoria: item.categoria, modelo: item.modelo, quantidade: item.quantidade,
        area_m2: areaM2, produto_base_centavos: produtoBase, produto_unitario_centavos: produtoUnitario,
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
    res.json({ precos: rows, ajustes: AJUSTES_PRECO, referencia: REFERENCIA_PRECOS });
  });

  app.get("/api/orcamentos/acesso", exigirLogin, async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ acesso: await acessoOrcamentos(req.session.usuario.id) });
  });

  app.post("/api/orcamentos", exigirLogin, changesLimit, async (req, res) => {
    const dados = validarOrcamento(req.body);
    const usuarioId = req.session.usuario.id;
    const estimativa = await calcularEstimativa(dados.itens, dados.instalacao);
    const acesso = await acessoOrcamentos(usuarioId);
    const reserva = await reservarUso(usuarioId, acesso);
    let result;
    try {
      result = await db.run(
        `INSERT INTO orcamentos
         (usuario_id,nome,email,telefone,cidade,bairro,itens_json,instalacao,observacoes,estimativa_centavos,estimativa_detalhes_json)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [usuarioId, dados.nome, dados.email, dados.telefone, dados.cidade, dados.bairro,
          JSON.stringify(dados.itens), dados.instalacao ? 1 : 0, dados.observacoes || null,
          estimativa.total, estimativa.total == null ? null : JSON.stringify(estimativa.detalhes)],
      );
    } catch (error) {
      await db.run(
        "DELETE FROM usos_orcamento WHERE id = ? AND usuario_id = ? AND orcamento_id IS NULL",
        [reserva.id, usuarioId],
      );
      throw error;
    }
    await db.run(
      "UPDATE usos_orcamento SET orcamento_id = ? WHERE id = ? AND usuario_id = ? AND orcamento_id IS NULL",
      [result.lastID, reserva.id, usuarioId],
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
      `SELECT codigo,nome,email,telefone,cidade,bairro,itens_json,instalacao,observacoes,estimativa_centavos,estimativa_detalhes_json,status,criado_em,atualizado_em,propostas_json,proposta_versao
       FROM orcamentos WHERE usuario_id = ? AND removido_em IS NULL ORDER BY id DESC LIMIT 50`,
      [req.session.usuario.id],
    );
    res.json({ orcamentos: rows.map((row) => ({
      codigo: row.codigo,
      nome: row.nome,
      email: row.email,
      telefone: row.telefone,
      cidade: row.cidade,
      bairro: row.bairro,
      itens: JSON.parse(row.itens_json),
      instalacao: Boolean(row.instalacao),
      observacoes: row.observacoes,
      estimativa_centavos: row.estimativa_centavos,
      estimativa_detalhes: row.estimativa_detalhes_json ? JSON.parse(row.estimativa_detalhes_json) : [],
      status: row.status,
      criado_em: row.criado_em,
      atualizado_em: row.atualizado_em,
      propostas: propostas(row),
      proposta_versao: row.proposta_versao,
    })) });
  });

  app.delete("/api/orcamentos/:codigo", exigirLogin, changesLimit, async (req, res) => {
    const row = await db.get("SELECT id,status FROM orcamentos WHERE codigo=? AND usuario_id=? AND removido_em IS NULL",
      [req.params.codigo, req.session.usuario.id]);
    if (!row) throw fail(404, "Orçamento não encontrado.");
    if (["aprovado", "concluido"].includes(row.status)) {
      throw fail(409, "Este orçamento já foi aprovado e não pode ser removido. Fale com a empresa se precisar cancelar o serviço.");
    }
    await db.run(`UPDATE orcamentos SET status='cancelado', removido_em=CURRENT_TIMESTAMP,
      atualizado_em=CURRENT_TIMESTAMP WHERE id=? AND removido_em IS NULL`, [row.id]);
    res.json({ mensagem: "Orçamento removido da sua conta. O uso não foi devolvido." });
  });
}

module.exports = { initOrcamentos, validarOrcamento };
