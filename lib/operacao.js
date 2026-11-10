const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const fail = (status, message) => Object.assign(new Error(message), { status });
const PRIVACY_STATUS = new Set(["recebida", "em_analise", "concluida", "cancelada"]);
const REVIEW_TYPES = new Set(["precos", "conteudo"]);
const clean = (value, max) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
const integer = (value, min, max, label) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw fail(400, `${label} é inválido.`);
  return number;
};
const localDate = (value) => value ? `${String(value).replace(" ", "T")}Z` : null;

async function initOperacao({ app, db, exigirAdmin, changesLimit, dataDir }) {
  const backupDir = path.join(dataDir, "backups");
  await fsp.mkdir(backupDir, { recursive: true });
  await db.run(`CREATE TABLE IF NOT EXISTS configuracao_operacao (
    id INTEGER PRIMARY KEY CHECK(id=1),
    responsavel_orcamentos TEXT NOT NULL DEFAULT 'Administrador',
    contato_responsavel TEXT NOT NULL DEFAULT '',
    prazo_resposta_horas INTEGER NOT NULL DEFAULT 24,
    frequencia_precos_dias INTEGER NOT NULL DEFAULT 30,
    frequencia_conteudo_dias INTEGER NOT NULL DEFAULT 60,
    atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.run(`INSERT OR IGNORE INTO configuracao_operacao
    (id,responsavel_orcamentos,contato_responsavel,prazo_resposta_horas,frequencia_precos_dias,frequencia_conteudo_dias)
    VALUES (1,'Administrador','',24,30,60)`);
  await db.run(`CREATE TABLE IF NOT EXISTS historico_operacao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    detalhe TEXT,
    administrador_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    administrador_nome TEXT,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.run("CREATE INDEX IF NOT EXISTS historico_operacao_tipo_idx ON historico_operacao(tipo,criado_em)");

  const backupName = () => `mundo-esquadrias-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
  async function rotateBackups() {
    const entries = (await fsp.readdir(backupDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^mundo-esquadrias-[\w-]+\.db$/.test(entry.name))
      .map((entry) => entry.name).sort().reverse();
    await Promise.all(entries.slice(7).map((name) => fsp.unlink(path.join(backupDir, name)).catch(() => {})));
  }
  async function createBackup(tipo, administrator) {
    const name = backupName();
    const destination = path.join(backupDir, name);
    await db.backup(destination);
    await db.run(`INSERT INTO historico_operacao (tipo,detalhe,administrador_id,administrador_nome)
      VALUES ('backup',?,?,?)`, [tipo, administrator?.id || null, administrator?.nome || null]);
    await rotateBackups();
    return name;
  }

  async function ensureDailyBackup() {
    const lastBackup = await db.get("SELECT criado_em FROM historico_operacao WHERE tipo='backup' ORDER BY id DESC LIMIT 1");
    if (!lastBackup || Date.now() - Date.parse(localDate(lastBackup.criado_em)) >= 86400000) {
      await createBackup("automatico", null);
    }
  }
  await ensureDailyBackup();
  const backupTimer = setInterval(() => ensureDailyBackup().catch((error) => console.error("Falha no backup automático:", error.code || error.name)), 60 * 60 * 1000);
  backupTimer.unref();

  async function operationSummary() {
    const settings = await db.get("SELECT * FROM configuracao_operacao WHERE id=1");
    const [quotes, payments, privacy, histories, recentPayments, quoteRows] = await Promise.all([
      db.get(`SELECT COUNT(*) total,
        SUM(CASE WHEN status IN ('recebido','em_analise','aguardando_cliente') THEN 1 ELSE 0 END) pendentes,
        SUM(CASE WHEN status IN ('recebido','em_analise') AND criado_em < datetime('now', '-' || ? || ' hours') THEN 1 ELSE 0 END) atrasados
        FROM orcamentos WHERE removido_em IS NULL`, [settings.prazo_resposta_horas]),
      db.get(`SELECT COUNT(*) total,
        SUM(CASE WHEN status='pago' THEN 1 ELSE 0 END) pagos,
        SUM(CASE WHEN status IN ('pendente','recusado','contestado') THEN 1 ELSE 0 END) atencao,
        SUM(CASE WHEN status='pago' THEN valor_centavos ELSE 0 END) recebido_centavos FROM compras`),
      db.all(`SELECT s.id,s.tipo,s.status,s.solicitado_em,s.atualizado_em,u.nome,u.email,u.telefone
        FROM solicitacoes_privacidade s JOIN usuarios u ON u.id=s.usuario_id ORDER BY s.id DESC LIMIT 100`),
      db.all(`SELECT tipo,MAX(criado_em) ultima_em FROM historico_operacao
        WHERE tipo IN ('precos','conteudo','backup') GROUP BY tipo`),
      db.all(`SELECT id,titulo,status,valor_centavos,criado_em FROM compras ORDER BY id DESC LIMIT 8`),
      db.all(`SELECT id,codigo,nome,status,propostas_json,criado_em FROM orcamentos
        WHERE proposta_versao>0 ORDER BY id DESC LIMIT 100`),
    ]);
    const history = Object.fromEntries(histories.map((item) => [item.tipo, item.ultima_em]));
    const proposals = { pendentes: 0, aceitas: 0, ajustes: 0, total: 0 };
    for (const row of quoteRows) {
      let current;
      try { current = JSON.parse(row.propostas_json || "[]").at(-1); } catch { current = null; }
      if (!current) continue;
      proposals.total += 1;
      if (current.situacao === "pendente") proposals.pendentes += 1;
      if (current.situacao === "aceita") proposals.aceitas += 1;
      if (current.situacao === "ajustes") proposals.ajustes += 1;
    }
    const due = (last, days) => !last || Date.now() - Date.parse(localDate(last)) >= days * 86400000;
    return {
      configuracao: settings,
      orcamentos: { total: quotes.total || 0, pendentes: quotes.pendentes || 0, atrasados: quotes.atrasados || 0 },
      pagamentos: { total: payments.total || 0, pagos: payments.pagos || 0, atencao: payments.atencao || 0,
        recebido_centavos: payments.recebido_centavos || 0, recentes: recentPayments },
      propostas: proposals,
      privacidade: privacy,
      rotina: {
        precos: { ultima_em: history.precos || null, pendente: due(history.precos, settings.frequencia_precos_dias) },
        conteudo: { ultima_em: history.conteudo || null, pendente: due(history.conteudo, settings.frequencia_conteudo_dias) },
        backup: { ultima_em: history.backup || null, pendente: due(history.backup, 1) },
      },
    };
  }

  app.get("/api/admin/operacao", async (_req, res) => res.json(await operationSummary()));
  app.put("/api/admin/operacao/configuracao", async (req, res) => {
    const responsible = clean(req.body?.responsavel_orcamentos, 120);
    const contact = clean(req.body?.contato_responsavel, 160);
    if (!responsible) throw fail(400, "Informe quem responde pelos orçamentos.");
    const values = [
      responsible, contact,
      integer(req.body?.prazo_resposta_horas, 1, 720, "O prazo de resposta"),
      integer(req.body?.frequencia_precos_dias, 1, 365, "A frequência de preços"),
      integer(req.body?.frequencia_conteudo_dias, 1, 365, "A frequência de conteúdo"),
    ];
    await db.run(`UPDATE configuracao_operacao SET responsavel_orcamentos=?,contato_responsavel=?,prazo_resposta_horas=?,
      frequencia_precos_dias=?,frequencia_conteudo_dias=?,atualizado_em=CURRENT_TIMESTAMP WHERE id=1`, values);
    res.json({ mensagem: "Rotina operacional atualizada." });
  });
  app.post("/api/admin/operacao/revisoes/:tipo", async (req, res) => {
    const tipo = clean(req.params.tipo, 20);
    if (!REVIEW_TYPES.has(tipo)) throw fail(400, "Rotina inválida.");
    await db.run(`INSERT INTO historico_operacao (tipo,detalhe,administrador_id,administrador_nome) VALUES (?,?,?,?)`,
      [tipo, clean(req.body?.detalhe, 300) || "Revisão concluída", req.session.usuario.id, req.session.usuario.nome]);
    res.json({ mensagem: tipo === "precos" ? "Revisão de preços registrada." : "Revisão de conteúdo registrada." });
  });
  app.put("/api/admin/operacao/privacidade/:id", async (req, res) => {
    const id = integer(req.params.id, 1, 1000000000, "A solicitação");
    const status = clean(req.body?.status, 30);
    if (!PRIVACY_STATUS.has(status)) throw fail(400, "Situação de privacidade inválida.");
    const result = await db.run("UPDATE solicitacoes_privacidade SET status=?,atualizado_em=CURRENT_TIMESTAMP WHERE id=?", [status, id]);
    if (!result.changes) throw fail(404, "Solicitação não encontrada.");
    res.json({ mensagem: "Solicitação de privacidade atualizada." });
  });
  app.post("/api/admin/operacao/backup", async (req, res) => {
    const arquivo = await createBackup("manual", req.session.usuario);
    res.status(201).json({ mensagem: "Backup criado com sucesso.", arquivo, download_url: `/api/admin/operacao/backup/${encodeURIComponent(arquivo)}` });
  });
  app.get("/api/admin/operacao/backup/:arquivo", async (req, res) => {
    const file = clean(req.params.arquivo, 120);
    if (!/^mundo-esquadrias-[\w-]+\.db$/.test(file)) throw fail(400, "Arquivo de backup inválido.");
    const target = path.join(backupDir, file);
    if (!fs.existsSync(target)) throw fail(404, "Backup não encontrado.");
    res.download(target, file);
  });
  return { close: () => clearInterval(backupTimer) };
}

module.exports = { initOperacao };
