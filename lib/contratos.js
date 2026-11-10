const path = require("node:path");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const multer = require("multer");

const STATUS = new Set(["rascunho", "enviado", "assinado", "concluido", "cancelado"]);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 2 } });
const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const text = (value, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";
const date = (value) => !value ? null : /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : (() => { throw fail(400, "Informe uma data válida."); })();

async function initContratos({ app, db, exigirAdmin, changesLimit, dataDir }) {
  const columns = await db.all("PRAGMA table_info(contratos)");
  for (const [name, type] of [
    ["orcamento_id", "INTEGER REFERENCES orcamentos(id)"], ["codigo", "TEXT"],
    ["validade_em", "TEXT"], ["inicio_em", "TEXT"], ["conclusao_em", "TEXT"],
    ["atualizado_em", "TEXT"],
  ]) if (!columns.some((column) => column.name === name)) await db.run(`ALTER TABLE contratos ADD COLUMN ${name} ${type}`);
  await db.run("UPDATE contratos SET atualizado_em=COALESCE(atualizado_em,criado_em,CURRENT_TIMESTAMP)");
  await db.run("CREATE UNIQUE INDEX IF NOT EXISTS contratos_orcamento_idx ON contratos(orcamento_id) WHERE orcamento_id IS NOT NULL");
  await db.run(`CREATE TABLE IF NOT EXISTS contrato_eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL, descricao TEXT NOT NULL, administrador_id INTEGER REFERENCES usuarios(id),
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS contrato_documentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
    arquivo TEXT NOT NULL, nome_original TEXT NOT NULL, administrador_id INTEGER REFERENCES usuarios(id),
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await fs.mkdir(path.join(dataDir, "contratos"), { recursive: true });

  const view = async (row) => ({
    ...row,
    eventos: await db.all("SELECT tipo,descricao,criado_em FROM contrato_eventos WHERE contrato_id=? ORDER BY id DESC LIMIT 50", [row.id]),
    documento_url: row.documento_arquivo ? `/api/admin/contratos/${row.id}/documento` : null,
  });
  app.get("/api/admin/contratos", exigirAdmin, wrap(async (_req, res) => {
    const rows = await db.all(`SELECT c.*,u.nome cliente_nome,u.email cliente_email,o.codigo orcamento_codigo
      FROM contratos c JOIN usuarios u ON u.id=c.usuario_id LEFT JOIN orcamentos o ON o.id=c.orcamento_id
      ORDER BY c.id DESC LIMIT 200`);
    res.json({ contratos: await Promise.all(rows.map(view)) });
  }));

  app.post("/api/admin/contratos", exigirAdmin, changesLimit, wrap(async (req, res) => {
    const quoteId = Number(req.body?.orcamento_id);
    if (!Number.isSafeInteger(quoteId) || quoteId < 1) throw fail(400, "Escolha um orçamento aprovado.");
    const quote = await db.get("SELECT * FROM orcamentos WHERE id=? AND usuario_id IS NOT NULL", [quoteId]);
    if (!quote || quote.status !== "aprovado") throw fail(409, "O contrato só pode ser criado para uma proposta aceita.");
    const proposals = JSON.parse(quote.propostas_json || "[]");
    const proposal = proposals.at(-1);
    if (proposal?.situacao !== "aceita") throw fail(409, "A proposta atual ainda não foi aceita pelo cliente.");
    const titulo = text(req.body?.titulo, 160);
    const descricao = text(req.body?.descricao, 3000);
    if (!titulo || !descricao) throw fail(400, "Informe o título e o objeto do contrato.");
    let result;
    try {
      result = await db.run(`INSERT INTO contratos
        (usuario_id,orcamento_id,titulo,descricao,status,valor_centavos,moeda,validade_em,inicio_em)
        VALUES (?,?,?,?,?,?,?,?,?)`, [quote.usuario_id, quote.id, titulo, descricao, "rascunho",
        proposal.valor_centavos, "brl", date(req.body?.validade_em), date(req.body?.inicio_em)]);
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT") throw fail(409, "Este orçamento já possui um contrato.");
      throw error;
    }
    const codigo = `CTR-${new Date().getFullYear()}-${String(result.lastID).padStart(6, "0")}`;
    await db.run("UPDATE contratos SET codigo=? WHERE id=?", [codigo, result.lastID]);
    await db.run(`INSERT INTO contrato_eventos (contrato_id,tipo,descricao,administrador_id)
      VALUES (?,?,?,?)`, [result.lastID, "criado", "Contrato criado a partir da proposta aceita.", req.session.usuario.id]);
    res.status(201).json({ mensagem: "Contrato criado como rascunho.", id: result.lastID, codigo });
  }));

  app.put("/api/admin/contratos/:id/status", exigirAdmin, changesLimit, wrap(async (req, res) => {
    const id = Number(req.params.id); const status = text(req.body?.status, 20);
    if (!Number.isSafeInteger(id) || id < 1 || !STATUS.has(status)) throw fail(400, "Situação do contrato inválida.");
    const contract = await db.get("SELECT * FROM contratos WHERE id=?", [id]);
    if (!contract) throw fail(404, "Contrato não encontrado.");
    if (["concluido", "cancelado"].includes(contract.status)) throw fail(409, "Este contrato já foi encerrado.");
    if (["enviado", "assinado"].includes(status) && !contract.documento_arquivo) throw fail(409, "Anexe o PDF do contrato antes de alterar esta situação.");
    await db.run(`UPDATE contratos SET status=?,assinado_em=CASE WHEN ?='assinado' THEN CURRENT_TIMESTAMP ELSE assinado_em END,
      conclusao_em=CASE WHEN ?='concluido' THEN CURRENT_TIMESTAMP ELSE conclusao_em END,atualizado_em=CURRENT_TIMESTAMP WHERE id=?`, [status, status, status, id]);
    await db.run(`INSERT INTO contrato_eventos (contrato_id,tipo,descricao,administrador_id) VALUES (?,?,?,?)`,
      [id, status, `Situação alterada para ${status}.`, req.session.usuario.id]);
    res.json({ mensagem: "Situação do contrato atualizada." });
  }));

  app.post("/api/admin/contratos/:id/documento", exigirAdmin, changesLimit, upload.single("documento"), wrap(async (req, res) => {
    const id = Number(req.params.id);
    const contract = Number.isSafeInteger(id) ? await db.get("SELECT id FROM contratos WHERE id=?", [id]) : null;
    if (!contract) throw fail(404, "Contrato não encontrado.");
    if (!req.file || req.file.mimetype !== "application/pdf" || req.file.buffer.subarray(0, 5).toString() !== "%PDF-") {
      throw fail(400, "Envie um arquivo PDF válido de até 5 MB.");
    }
    const filename = `${randomUUID()}.pdf`;
    await fs.writeFile(path.join(dataDir, "contratos", filename), req.file.buffer, { flag: "wx" });
    await db.run(`INSERT INTO contrato_documentos (contrato_id,arquivo,nome_original,administrador_id) VALUES (?,?,?,?)`,
      [id, filename, text(req.file.originalname, 160) || "contrato.pdf", req.session.usuario.id]);
    await db.run("UPDATE contratos SET documento_arquivo=?,atualizado_em=CURRENT_TIMESTAMP WHERE id=?", [filename, id]);
    await db.run(`INSERT INTO contrato_eventos (contrato_id,tipo,descricao,administrador_id) VALUES (?,?,?,?)`,
      [id, "documento", "Nova versão do documento foi anexada.", req.session.usuario.id]);
    res.status(201).json({ mensagem: "PDF anexado ao contrato com segurança." });
  }));

  app.get("/api/admin/contratos/:id/documento", exigirAdmin, wrap(async (req, res) => {
    const contract = await db.get("SELECT codigo,documento_arquivo FROM contratos WHERE id=?", [req.params.id]);
    if (!contract?.documento_arquivo) throw fail(404, "Documento não encontrado.");
    const directory = await fs.realpath(path.join(dataDir, "contratos"));
    const file = await fs.realpath(path.join(directory, contract.documento_arquivo));
    if (path.relative(directory, file).startsWith("..")) throw fail(404, "Documento não encontrado.");
    res.set("Cache-Control", "no-store"); res.type("application/pdf");
    res.attachment(`${contract.codigo || "contrato"}.pdf`); res.sendFile(file);
  }));
}

module.exports = { initContratos };
