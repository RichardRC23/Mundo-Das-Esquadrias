const fail = (status, message) => Object.assign(new Error(message), { status });
const conflict = () => fail(409, "O orçamento mudou. Atualize a página para conferir a proposta atual.");
function texto(value, max, required = false) {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) {
    throw fail(400, "Informe prazo e observações válidos, dentro do limite indicado.");
  }
  return value.trim();
}
function propostas(row) { return JSON.parse(row.propostas_json || "[]"); }

async function initPropostas({ app, db, exigirLogin, exigirAdmin, changesLimit }) {
  const columns = await db.all("PRAGMA table_info(orcamentos)");
  for (const [name, type] of [["propostas_json", "TEXT NOT NULL DEFAULT '[]'"], ["proposta_versao", "INTEGER NOT NULL DEFAULT 0"]]) {
    if (!columns.some((column) => column.name === name)) await db.run(`ALTER TABLE orcamentos ADD COLUMN ${name} ${type}`);
  }

  // Compare-and-swap keeps an acceptance bound to exactly the version displayed.
  async function persist(row, history, status) {
    const result = await db.run(`UPDATE orcamentos SET propostas_json=?, proposta_versao=proposta_versao+1,
      status=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=? AND proposta_versao=? AND status=?`,
    [JSON.stringify(history), status, row.id, row.proposta_versao, row.status]);
    if (!result.changes) throw conflict();
  }

  app.post("/api/admin/orcamentos/:id/proposta", exigirAdmin, changesLimit, async (req, res) => {
    const body = req.body || {};
    if (!Number.isSafeInteger(body.valor_centavos) || body.valor_centavos < 1 || body.valor_centavos > 1000000000) {
      throw fail(400, "Informe um valor final positivo de até R$ 10 milhões.");
    }
    const prazo = texto(body.prazo, 300, true);
    const observacoes = texto(body.observacoes ?? "", 2000);
    const row = await db.get("SELECT * FROM orcamentos WHERE id=?", [req.params.id]);
    if (!row) throw fail(404, "Orçamento não encontrado.");
    if (!row.usuario_id) throw fail(409, "Pedido feito sem login. O atendimento deve continuar pelo contato informado; não há conta vinculada para responder.");
    const history = propostas(row);
    if (!Number.isSafeInteger(body.versao) || body.versao !== row.proposta_versao) throw conflict();
    if (["aprovado", "concluido", "cancelado"].includes(row.status) || history.at(-1)?.situacao === "aceita") {
      throw fail(409, "Este orçamento está encerrado ou já foi aprovado. A proposta aceita não pode ser alterada.");
    }
    if (history.length >= 50) throw fail(409, "Limite de revisões atingido. Abra um novo orçamento.");
    if (history.at(-1)?.situacao === "pendente") history.at(-1).situacao = "substituida";
    history.push({ numero: history.length + 1, valor_centavos: body.valor_centavos, prazo, observacoes,
      situacao: "pendente", enviada_em: new Date().toISOString(), resposta: null, respondida_em: null });
    await persist(row, history, "aguardando_cliente");
    res.status(201).json({ mensagem: "Proposta disponível na conta do cliente." });
  });

  app.post("/api/orcamentos/:codigo/resposta", exigirLogin, changesLimit, async (req, res) => {
    const body = req.body || {};
    if (!["aceitar", "ajustes"].includes(body.acao)) throw fail(400, "Escolha aceitar ou solicitar ajustes.");
    const resposta = texto(body.mensagem ?? "", 2000, body.acao === "ajustes");
    const row = await db.get("SELECT * FROM orcamentos WHERE codigo=? AND usuario_id=? AND removido_em IS NULL",
      [req.params.codigo, req.session.usuario.id]);
    if (!row) throw fail(404, "Orçamento não encontrado.");
    const history = propostas(row);
    const current = history.at(-1);
    if (!Number.isSafeInteger(body.versao) || body.versao !== row.proposta_versao ||
        row.status !== "aguardando_cliente" || current?.situacao !== "pendente") throw conflict();
    current.situacao = body.acao === "aceitar" ? "aceita" : "ajustes";
    current.resposta = resposta;
    current.respondida_em = new Date().toISOString();
    await persist(row, history, body.acao === "aceitar" ? "aprovado" : "em_analise");
    res.json({ mensagem: body.acao === "aceitar" ? "Proposta aceita. A empresa dará continuidade ao atendimento." : "Seu pedido de ajustes foi enviado à empresa." });
  });
}
module.exports = { initPropostas, propostas };
