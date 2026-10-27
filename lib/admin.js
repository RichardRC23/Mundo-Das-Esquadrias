const { propostas } = require("./propostas");
const { BASES_CALCULO, UNIDADES, TIPOS_CUSTO, CAMPOS_CONDICAO } = require("./custos-reais");
const CATEGORIAS = new Set([
  "porta", "janela", "box", "fachada", "guarda_corpo", "fechamento",
  "espelho", "cobertura", "manutencao", "outro",
]);
const STATUS = new Set(["recebido", "em_analise", "aguardando_cliente", "aprovado", "concluido", "cancelado"]);
const CORES_ALUMINIO = new Set(["Branco", "Preto", "Bronze", "Natural fosco", "Amadeirado", "Cromada", "Dourado"]);

const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value, max = 120) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
const cents = (value, label, allowZero = true) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < (allowZero ? 0 : 1) || number > 1000000000) {
    throw fail(400, `${label} é inválido.`);
  }
  return number;
};
const integer = (value, min, max, label) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw fail(400, `${label} é inválido.`);
  return number;
};
const dateValue = (value) => {
  const result = text(value, 10);
  if (result && !/^\d{4}-\d{2}-\d{2}$/.test(result)) throw fail(400, "A data de referência é inválida.");
  return result || null;
};

function materialData(body = {}) {
  const codigo = text(body.codigo, 40).toUpperCase();
  const nome = text(body.nome, 120);
  const grupo = text(body.grupo, 60);
  const unidade = text(body.unidade, 5);
  const tipo_custo = text(body.tipo_custo, 30) || "materiais";
  if (!/^[A-Z0-9._-]+$/.test(codigo)) throw fail(400, "Use somente letras, números, ponto, traço ou sublinhado no código.");
  if (!nome || !grupo) throw fail(400, "Informe o nome e o grupo do material.");
  if (!UNIDADES[unidade]) throw fail(400, "Escolha uma unidade válida.");
  if (!TIPOS_CUSTO[tipo_custo]) throw fail(400, "Escolha a categoria de custo válida.");
  return {
    codigo, nome, grupo, unidade, tipo_custo,
    custo_unitario_centavos: cents(body.custo_unitario_centavos, "O custo unitário"),
    perda_padrao_bp: integer(body.perda_padrao_bp ?? 0, 0, 10000, "A perda padrão"),
    fornecedor: text(body.fornecedor, 120) || null,
    referencia_em: dateValue(body.referencia_em),
    custo_confirmado: body.custo_confirmado === true ? 1 : 0,
    ativo: body.ativo !== false ? 1 : 0,
  };
}

function fichaData(body = {}) {
  const categoria = text(body.categoria, 30);
  const modelo = text(body.modelo, 100);
  if (!CATEGORIAS.has(categoria) || !modelo) throw fail(400, "Escolha uma categoria e um modelo válidos.");
  return {
    categoria, modelo,
    preco_minimo_centavos: cents(body.preco_minimo_centavos ?? 0, "O preço mínimo"),
    validada: body.validada === true ? 1 : 0,
    ativo: body.ativo !== false ? 1 : 0,
  };
}

function componenteData(body = {}) {
  const base_calculo = text(body.base_calculo, 30);
  const condicao_campo = text(body.condicao_campo, 40) || null;
  const condicao_valor = text(body.condicao_valor, 80) || null;
  if (!BASES_CALCULO[base_calculo]) throw fail(400, "Escolha uma base de cálculo válida.");
  if ((condicao_campo && !CAMPOS_CONDICAO.has(condicao_campo)) || Boolean(condicao_campo) !== Boolean(condicao_valor)) {
    throw fail(400, "Preencha uma condição válida ou deixe os dois campos vazios.");
  }
  return {
    ficha_id: integer(body.ficha_id, 1, 1000000000, "A ficha técnica"),
    material_id: integer(body.material_id, 1, 1000000000, "O material"),
    base_calculo,
    fator_milesimos: integer(body.fator_milesimos, 0, 100000000, "O fator de consumo"),
    adicional_milesimos: integer(body.adicional_milesimos ?? 0, 0, 100000000, "O consumo fixo"),
    perda_bp: body.perda_bp == null || body.perda_bp === "" ? null : integer(body.perda_bp, 0, 10000, "A perda específica"),
    condicao_campo, condicao_valor,
    somente_instalacao: body.somente_instalacao === true ? 1 : 0,
  };
}

function priceData(body = {}) {
  const categoria = text(body.categoria, 30);
  const modelo = text(body.modelo, 100);
  const descricao = text(body.descricao, 300);
  if (!CATEGORIAS.has(categoria)) throw fail(400, "Escolha uma categoria válida.");
  if (!modelo) throw fail(400, "Informe o modelo ao qual este preço se aplica.");
  const precosCoresRecebidos = body.precos_cores == null ? {} : body.precos_cores;
  if (!precosCoresRecebidos || typeof precosCoresRecebidos !== "object" || Array.isArray(precosCoresRecebidos)) {
    throw fail(400, "Os preços por cor são inválidos.");
  }
  const precos_cores = {};
  const coresPermitidas = categoria === "box" && modelo === "Até o teto"
    ? new Set(["Branco", "Preto", "Bronze", "Cromada", "Dourado"])
    : new Set(["Branco", "Preto", "Bronze", "Cromada", "Dourado"]);
  for (const [cor, valor] of Object.entries(precosCoresRecebidos)) {
    if (!CORES_ALUMINIO.has(cor) || !coresPermitidas.has(cor)) throw fail(400, "Escolha uma cor de alumínio válida para este modelo.");
    if (valor === "" || valor == null || Number(valor) === 0) continue;
    if (typeof valor === "object" && !Array.isArray(valor)) {
      precos_cores[cor] = {
        preco_m2_centavos: cents(valor.preco_m2_centavos, `O preço por metro quadrado da cor ${cor}`, false),
        preco_minimo_centavos: cents(valor.preco_minimo_centavos ?? 0, `O preço mínimo da cor ${cor}`),
        instalacao_centavos: cents(valor.instalacao_centavos ?? 0, `O preço da instalação da cor ${cor}`),
      };
    } else {
      precos_cores[cor] = cents(valor, `O preço da cor ${cor}`, false);
    }
  }
  return {
    categoria,
    modelo,
    descricao,
    precos_cores_json: JSON.stringify(precos_cores),
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
    estimativa_detalhes: row.estimativa_detalhes_json ? JSON.parse(row.estimativa_detalhes_json) : [],
    tipo_calculo: row.tipo_calculo,
    status: row.status,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
    propostas: propostas(row),
    proposta_versao: row.proposta_versao,
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
      "UPDATE orcamentos SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND proposta_versao = 0",
      [status, id],
    );
    if (!result.changes) throw fail(409, "Orçamento indisponível para alteração manual. Quando há proposta, use o fluxo de envio e resposta do cliente.");
    res.json({ mensagem: "Situação do orçamento atualizada.", status });
  });

  app.get("/api/admin/precos", async (_req, res) => {
    const rows = await db.all("SELECT * FROM precos_orcamento ORDER BY ativo DESC, categoria, modelo");
    res.json({ precos: rows.map((row) => ({ ...row, precos_cores: JSON.parse(row.precos_cores_json || "{}"), ativo: Boolean(row.ativo) })) });
  });

  app.post("/api/admin/precos", async (req, res) => {
    const item = priceData(req.body);
    const existing = await db.get("SELECT id,origem FROM precos_orcamento WHERE categoria = ? AND modelo = ?", [item.categoria, item.modelo]);
    if (existing?.origem === "referencia") {
      await db.run(`UPDATE precos_orcamento SET descricao=?,precos_cores_json=?,preco_m2_centavos=?,preco_minimo_centavos=?,
        instalacao_centavos=?,ativo=?,origem='empresa',referencia_em=NULL,atualizado_em=CURRENT_TIMESTAMP WHERE id=?`,
      [item.descricao, item.precos_cores_json, item.preco_m2_centavos, item.preco_minimo_centavos,
        item.instalacao_centavos, item.ativo, existing.id]);
      return res.status(201).json({ mensagem: "Preço de referência substituído pela tabela da empresa.", id: existing.id });
    }
    if (existing) {
      throw fail(409, "Já existe um preço para esta categoria e modelo. Use a opção de editar.");
    }
    const result = await db.run(
      `INSERT INTO precos_orcamento
       (categoria,modelo,descricao,precos_cores_json,preco_m2_centavos,preco_minimo_centavos,instalacao_centavos,ativo)
       VALUES (?,?,?,?,?,?,?,?)`,
      [item.categoria, item.modelo, item.descricao, item.precos_cores_json, item.preco_m2_centavos,
        item.preco_minimo_centavos, item.instalacao_centavos, item.ativo],
    );
    res.status(201).json({ mensagem: "Preço cadastrado.", id: result.lastID });
  });

  app.put("/api/admin/precos/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw fail(400, "Preço inválido.");
    const item = priceData(req.body);
    const result = await db.run(
      `UPDATE precos_orcamento SET categoria=?,modelo=?,descricao=?,precos_cores_json=?,preco_m2_centavos=?,
       preco_minimo_centavos=?,instalacao_centavos=?,ativo=?,origem='empresa',referencia_em=NULL,atualizado_em=CURRENT_TIMESTAMP WHERE id=?`,
      [item.categoria, item.modelo, item.descricao, item.precos_cores_json, item.preco_m2_centavos,
        item.preco_minimo_centavos, item.instalacao_centavos, item.ativo, id],
    );
    if (!result.changes) throw fail(404, "Preço não encontrado.");
    res.json({ mensagem: "Preço atualizado." });
  });

  app.get("/api/admin/custos", async (_req, res) => {
    const [configuracao, materiais, fichas, componentes] = await Promise.all([
      db.get("SELECT * FROM configuracao_custos WHERE id=1"),
      db.all("SELECT * FROM materiais_custo ORDER BY ativo DESC,grupo,nome"),
      db.all("SELECT * FROM fichas_tecnicas ORDER BY ativo DESC,categoria,modelo"),
      db.all(`SELECT fc.*,m.codigo,m.nome,m.unidade FROM ficha_componentes fc
        JOIN materiais_custo m ON m.id=fc.material_id ORDER BY fc.ficha_id,m.grupo,m.nome`),
    ]);
    res.json({
      configuracao,
      materiais: materiais.map((item) => ({ ...item, ativo: Boolean(item.ativo), custo_confirmado: Boolean(item.custo_confirmado) })),
      fichas: fichas.map((ficha) => ({ ...ficha, ativo: Boolean(ficha.ativo), validada: Boolean(ficha.validada), componentes: componentes.filter((item) => item.ficha_id === ficha.id) })),
      opcoes: { bases_calculo: BASES_CALCULO, unidades: UNIDADES, tipos_custo: TIPOS_CUSTO, campos_condicao: [...CAMPOS_CONDICAO] },
    });
  });

  app.put("/api/admin/custos/configuracao", async (req, res) => {
    const item = {
      margem_bp: integer(req.body?.margem_bp, 0, 9900, "A margem"),
      impostos_bp: integer(req.body?.impostos_bp, 0, 9900, "Os impostos"),
      taxa_pagamento_bp: integer(req.body?.taxa_pagamento_bp, 0, 9900, "A taxa de pagamento"),
      despesa_fixa_centavos: cents(req.body?.despesa_fixa_centavos, "A despesa fixa"),
      frete_base_centavos: cents(req.body?.frete_base_centavos, "O custo adicional de materiais"),
    };
    if (item.margem_bp + item.impostos_bp + item.taxa_pagamento_bp >= 10000) {
      throw fail(400, "Margem, impostos e taxa de pagamento devem somar menos de 100%.");
    }
    await db.run(`UPDATE configuracao_custos SET margem_bp=?,impostos_bp=?,taxa_pagamento_bp=?,
      despesa_fixa_centavos=?,frete_base_centavos=?,atualizado_em=CURRENT_TIMESTAMP WHERE id=1`,
    [item.margem_bp, item.impostos_bp, item.taxa_pagamento_bp, item.despesa_fixa_centavos, item.frete_base_centavos]);
    res.json({ mensagem: "Configuração comercial atualizada." });
  });

  app.post("/api/admin/custos/materiais", async (req, res) => {
    const item = materialData(req.body);
    if (await db.get("SELECT id FROM materiais_custo WHERE codigo=?", [item.codigo])) {
      throw fail(409, "Já existe um material com este código. Use a opção de editar.");
    }
    const result = await db.run(`INSERT INTO materiais_custo
      (codigo,nome,grupo,unidade,tipo_custo,custo_unitario_centavos,perda_padrao_bp,fornecedor,referencia_em,custo_confirmado,ativo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, Object.values(item));
    res.status(201).json({ mensagem: "Material cadastrado.", id: result.lastID });
  });

  app.put("/api/admin/custos/materiais/:id", async (req, res) => {
    const id = integer(req.params.id, 1, 1000000000, "O material");
    const item = materialData(req.body);
    const result = await db.run(`UPDATE materiais_custo SET codigo=?,nome=?,grupo=?,unidade=?,tipo_custo=?,custo_unitario_centavos=?,
      perda_padrao_bp=?,fornecedor=?,referencia_em=?,custo_confirmado=?,ativo=?,atualizado_em=CURRENT_TIMESTAMP WHERE id=?`,
    [...Object.values(item), id]);
    if (!result.changes) throw fail(404, "Material não encontrado.");
    res.json({ mensagem: "Material atualizado." });
  });

  app.post("/api/admin/custos/fichas", async (req, res) => {
    const item = fichaData(req.body);
    if (await db.get("SELECT id FROM fichas_tecnicas WHERE categoria=? AND modelo=?", [item.categoria, item.modelo])) {
      throw fail(409, "Já existe uma ficha para esta categoria e modelo. Use a opção de editar.");
    }
    const result = await db.run(`INSERT INTO fichas_tecnicas (categoria,modelo,preco_minimo_centavos,validada,ativo)
      VALUES (?,?,?,?,?)`, Object.values(item));
    res.status(201).json({ mensagem: "Ficha técnica cadastrada.", id: result.lastID });
  });

  app.put("/api/admin/custos/fichas/:id", async (req, res) => {
    const id = integer(req.params.id, 1, 1000000000, "A ficha técnica");
    const item = fichaData(req.body);
    const result = await db.run(`UPDATE fichas_tecnicas SET categoria=?,modelo=?,preco_minimo_centavos=?,validada=?,ativo=?,
      versao=versao+1,atualizado_em=CURRENT_TIMESTAMP WHERE id=?`, [...Object.values(item), id]);
    if (!result.changes) throw fail(404, "Ficha técnica não encontrada.");
    res.json({ mensagem: "Ficha técnica atualizada." });
  });

  app.post("/api/admin/custos/componentes", async (req, res) => {
    const item = componenteData(req.body);
    const result = await db.run(`INSERT INTO ficha_componentes
      (ficha_id,material_id,base_calculo,fator_milesimos,adicional_milesimos,perda_bp,condicao_campo,condicao_valor,somente_instalacao)
      VALUES (?,?,?,?,?,?,?,?,?)`, Object.values(item));
    await db.run("UPDATE fichas_tecnicas SET versao=versao+1,atualizado_em=CURRENT_TIMESTAMP WHERE id=?", [item.ficha_id]);
    res.status(201).json({ mensagem: "Componente adicionado.", id: result.lastID });
  });

  app.delete("/api/admin/custos/componentes/:id", async (req, res) => {
    const id = integer(req.params.id, 1, 1000000000, "O componente");
    const component = await db.get("SELECT ficha_id FROM ficha_componentes WHERE id=?", [id]);
    if (!component) throw fail(404, "Componente não encontrado.");
    await db.run("DELETE FROM ficha_componentes WHERE id=?", [id]);
    await db.run("UPDATE fichas_tecnicas SET versao=versao+1,atualizado_em=CURRENT_TIMESTAMP WHERE id=?", [component.ficha_id]);
    res.json({ mensagem: "Componente removido." });
  });
}

module.exports = { initAdmin };
