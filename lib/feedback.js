const fail = (status, message) => Object.assign(new Error(message), { status });

const tipos = new Set(["servico", "site", "atendimento", "outro"]);

function validarFeedback(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw fail(400, "Preencha a avaliação antes de enviar.");
  }
  const tipo = typeof body.tipo === "string" ? body.tipo.trim() : "";
  const nota = Number(body.nota);
  const mensagem = typeof body.mensagem === "string" ? body.mensagem.trim() : "";
  if (!tipos.has(tipo)) throw fail(400, "Escolha sobre o que deseja comentar.");
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) throw fail(400, "Escolha uma nota de 1 a 5 estrelas.");
  if (mensagem.length < 20 || mensagem.length > 1000) {
    throw fail(400, "Escreva um comentário entre 20 e 1.000 caracteres.");
  }
  return { tipo, nota, mensagem };
}

async function initFeedback({ app, db, exigirLogin, exigirAdmin, changesLimit }) {
  await db.run(`CREATE TABLE IF NOT EXISTS feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('servico','site','atendimento','outro')),
    nota INTEGER NOT NULL CHECK(nota BETWEEN 1 AND 5),
    mensagem TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
  )`);
  await db.run("CREATE INDEX IF NOT EXISTS idx_feedbacks_usuario_data ON feedbacks(usuario_id, criado_em DESC)");

  app.get("/api/feedbacks", exigirLogin, async (req, res) => {
    const feedbacks = await db.all(`SELECT id,tipo,nota,mensagem,criado_em FROM feedbacks
      WHERE usuario_id=? ORDER BY criado_em DESC,id DESC LIMIT 20`, [req.session.usuario.id]);
    res.json({ feedbacks });
  });

  app.post("/api/feedbacks", exigirLogin, changesLimit, async (req, res) => {
    const feedback = validarFeedback(req.body);
    const result = await db.run("INSERT INTO feedbacks (usuario_id,tipo,nota,mensagem) VALUES (?,?,?,?)",
      [req.session.usuario.id, feedback.tipo, feedback.nota, feedback.mensagem]);
    const criado = await db.get("SELECT id,tipo,nota,mensagem,criado_em FROM feedbacks WHERE id=? AND usuario_id=?",
      [result.lastID, req.session.usuario.id]);
    res.status(201).json({ mensagem: "Obrigado! Sua opinião foi recebida com carinho.", feedback: criado });
  });

  app.get("/api/admin/feedbacks", exigirAdmin, async (_req, res) => {
    const feedbacks = await db.all(`SELECT f.id,f.tipo,f.nota,f.mensagem,f.criado_em,
      u.id AS usuario_id,u.nome,u.email,u.telefone FROM feedbacks f
      JOIN usuarios u ON u.id=f.usuario_id ORDER BY f.criado_em DESC,f.id DESC LIMIT 200`);
    res.json({ feedbacks });
  });
}

module.exports = { initFeedback, validarFeedback };
