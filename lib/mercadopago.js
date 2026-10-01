const { randomUUID, createHmac, timingSafeEqual } = require("node:crypto");

const PRODUCTS = Object.freeze({
  individual: { quantidade: 1, valor: 599, titulo: "1 orçamento adicional" },
  pacote10: { quantidade: 10, valor: 990, titulo: "Pacote de até 10 orçamentos" },
});
const uuid = (value) => typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
const paymentId = (value) => /^(?:[1-9]\d{0,19})$/.test(String(value));
const fail = (status, message) => Object.assign(new Error(message), { status });
const cents = (value) => {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(String(value));
  return match ? Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0")) : NaN;
};

function checkoutLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      ["www.mercadopago.com.br", "sandbox.mercadopago.com.br"].includes(url.hostname) &&
      url.pathname.startsWith("/checkout/") ? url.href : null;
  } catch { return null; }
}

function validSignature(req, secret) {
  if (!secret) return false;
  const query = new URL(req.originalUrl, "http://local.invalid").searchParams;
  const ids = query.getAll("data.id");
  const requestId = req.get("x-request-id") || "";
  const signature = req.get("x-signature") || "";
  if (ids.length !== 1 || !paymentId(ids[0]) || String(req.body?.data?.id) !== ids[0] ||
      !/^[a-zA-Z0-9-]{1,128}$/.test(requestId)) return false;
  const fields = signature.split(",").map((part) => part.trim().split("="));
  if (fields.length !== 2 || fields.some((part) => part.length !== 2) ||
      new Set(fields.map(([key]) => key)).size !== 2) return false;
  const { ts, v1 } = Object.fromEntries(fields);
  if (!/^\d{10,13}$/.test(ts || "") || !/^[a-f0-9]{64}$/i.test(v1 || "")) return false;
  const expected = createHmac("sha256", secret)
    .update(`id:${ids[0]};request-id:${requestId};ts:${ts};`).digest();
  return timingSafeEqual(expected, Buffer.from(v1, "hex"));
}

async function initMercadoPago({ app, webhookRouter, db, exigirLogin, origin, transport, config = process.env }) {
  const token = config.MP_ACCESS_TOKEN?.trim();
  const secret = config.MP_WEBHOOK_SECRET?.trim();
  const collector = config.MP_COLLECTOR_ID?.trim();
  const mode = config.MP_ENVIRONMENT || "test";
  const configured = Boolean(token && secret && /^\d+$/.test(collector || "") &&
    ["test", "production"].includes(mode) && origin.startsWith("https://"));
  const source = (id) => `mp:${mode}:${collector}:${id}`;
  const request = transport || (async (route, { method = "GET", body } = {}) => {
    // Fixed host, no redirects: credentials never follow a URL supplied by the browser/provider.
    const response = await fetch(`https://api.mercadopago.com${route}`, {
      method, redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw fail(503, "O Mercado Pago está indisponível. Tente novamente mais tarde.");
    return response.json();
  });
  const available = () => {
    if (!configured) throw fail(503, "O Mercado Pago ainda não foi ativado pela empresa.");
  };
  const wrap = (fn) => async (req, res) => {
    res.set("Cache-Control", "no-store");
    try { await fn(req, res); }
    catch (error) {
      const status = [400, 403, 404, 409].includes(error.status) ? error.status : 503;
      res.status(status).json({ erro: status === 503 ? "Não foi possível consultar o pagamento agora. Tente novamente. Não é necessário pagar outra vez." : error.message });
    }
  };

  await db.run(`CREATE TABLE IF NOT EXISTS mp_checkouts (
    referencia TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    tipo TEXT NOT NULL CHECK(tipo IN ('individual','pacote10')), modo TEXT NOT NULL, recebedor TEXT NOT NULL,
    preference_id TEXT, url TEXT, criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.run(`CREATE INDEX IF NOT EXISTS mp_checkouts_usuario ON mp_checkouts(usuario_id, criado_em)`);
  await db.run(`CREATE TABLE IF NOT EXISTS mp_recebimentos (
    chave TEXT PRIMARY KEY, referencia TEXT NOT NULL REFERENCES mp_checkouts(referencia),
    status TEXT NOT NULL, atualizado_ms INTEGER NOT NULL
  )`);
  // Each receipt write and all its financial effects share ONE SQLite transaction (a trigger).
  // This remains atomic across crashes, parallel webhooks and different Node processes.
  const effects = `
    INSERT OR IGNORE INTO compras (usuario_id,titulo,descricao,status,valor_centavos,moeda,pagamento_referencia)
      SELECT c.usuario_id,CASE c.tipo WHEN 'individual' THEN '1 orçamento adicional' ELSE 'Pacote de até 10 orçamentos' END,
        'Pagamento único via Mercado Pago',NEW.status,CASE c.tipo WHEN 'individual' THEN 599 ELSE 990 END,'brl',NEW.chave
      FROM mp_checkouts c WHERE c.referencia=NEW.referencia
        AND NOT EXISTS(SELECT 1 FROM compras WHERE pagamento_referencia=NEW.chave);
    UPDATE compras SET status=NEW.status WHERE pagamento_referencia=NEW.chave;
    INSERT OR IGNORE INTO creditos_orcamento (usuario_id,stripe_session_id,tipo,quantidade,valor_centavos)
      SELECT c.usuario_id,NEW.chave,c.tipo,CASE c.tipo WHEN 'individual' THEN 1 ELSE 10 END,
        CASE c.tipo WHEN 'individual' THEN 599 ELSE 990 END
      FROM mp_checkouts c WHERE c.referencia=NEW.referencia AND NEW.status='pago'
        AND NOT EXISTS(SELECT 1 FROM creditos_orcamento WHERE stripe_session_id=NEW.chave);
    UPDATE creditos_orcamento SET revogado=1 WHERE stripe_session_id=NEW.chave
      AND NEW.status IN ('reembolsado','contestado');`;
  for (const event of ["INSERT", "UPDATE"]) {
    await db.run(`CREATE TRIGGER IF NOT EXISTS mp_recebimentos_${event.toLowerCase()} AFTER ${event} ON mp_recebimentos
      BEGIN ${effects} END`);
  }

  async function reconcile(id, userId, expectedReference) {
    if (!paymentId(id)) throw fail(400, "Identificador de pagamento inválido.");
    const payment = await request(`/v1/payments/${id}`);
    if (String(payment.id) !== String(id)) throw fail(409, "Pagamento divergente.");
    const intent = uuid(payment.external_reference) ? await db.get("SELECT * FROM mp_checkouts WHERE referencia=?", [payment.external_reference]) : null;
    if (!intent) {
      if (userId) throw fail(404, "Compra não encontrada para sua conta.");
      return; // Other sales on the seller's account are not sales made by this application.
    }
    if (userId && intent.usuario_id !== userId) throw fail(404, "Compra não encontrada para sua conta.");
    if (expectedReference && intent.referencia !== expectedReference) throw fail(409, "Referência divergente.");
    const product = PRODUCTS[intent.tipo];
    const updated = Date.parse(payment.date_last_updated);
    if (intent.modo !== mode || intent.recebedor !== collector || String(payment.collector_id) !== collector ||
        payment.live_mode !== (mode === "production") || payment.currency_id !== "BRL" ||
        cents(payment.transaction_amount) !== product.valor || !Number.isFinite(updated)) {
      throw fail(409, "O pagamento não corresponde à compra registrada.");
    }
    const statuses = { approved: "pago", pending: "pendente", in_process: "pendente", authorized: "pendente",
      rejected: "recusado", cancelled: "cancelado", refunded: "reembolsado", charged_back: "contestado", in_mediation: "contestado" };
    let status = statuses[payment.status];
    if (!status) throw fail(409, "Situação de pagamento ainda não reconhecida.");
    if (payment.transaction_amount_refunded != null) {
      const refunded = cents(payment.transaction_amount_refunded);
      if (!Number.isFinite(refunded)) throw fail(409, "Reembolso inválido.");
      if (refunded > 0) status = "reembolsado";
    }
    await db.run(`INSERT INTO mp_recebimentos(chave,referencia,status,atualizado_ms) VALUES(?,?,?,?)
      ON CONFLICT(chave) DO UPDATE SET status=excluded.status,atualizado_ms=excluded.atualizado_ms
      WHERE excluded.atualizado_ms>=mp_recebimentos.atualizado_ms
        AND mp_recebimentos.status NOT IN ('reembolsado','contestado')`, [source(id), intent.referencia, status, updated]);
  }

  webhookRouter.post("/", wrap(async (req, res) => {
    available();
    if (!validSignature(req, secret)) return res.status(401).json({ erro: "Assinatura inválida." });
    if (req.body.type !== "payment") return res.status(400).json({ erro: "Tópico inválido." });
    // Timestamp isn't used as a freshness cutoff: delayed retries are legitimate.
    // Signed replays are harmless: fetch authoritative state, grant each payment only once.
    await reconcile(String(req.body.data.id));
    res.json({ recebido: true });
  }));
  webhookRouter.use((_req, res) => res.sendStatus(404));

  async function checkout(req, res) {
    return wrap(async () => {
      available();
      const type = req.body?.plano;
      if (!Object.hasOwn(PRODUCTS, type || "")) throw fail(400, "Escolha 1 orçamento ou o pacote de até 10 orçamentos.");
      const product = PRODUCTS[type];
      const seller = await request("/users/me");
      if (String(seller.id) !== collector || (Array.isArray(seller.tags) && seller.tags.includes("test_user")) !== (mode === "test")) {
        throw fail(409, "A conta recebedora ou o ambiente de testes não corresponde à configuração.");
      }
      // Reuse a recent completed preference when a customer retries opening checkout.
      const saved = await db.get(`SELECT url,referencia FROM mp_checkouts WHERE usuario_id=? AND tipo=? AND modo=? AND recebedor=?
        AND criado_em>datetime('now','-15 minutes') AND url IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM mp_recebimentos r WHERE r.referencia=mp_checkouts.referencia AND r.status='pago')
        ORDER BY criado_em DESC LIMIT 1`, [req.session.usuario.id, type, mode, collector]);
      if (saved && checkoutLink(saved.url)) return res.json({ url: saved.url, referencia: saved.referencia, provedor: "mercadopago" });
      const reference = randomUUID();
      await db.run("INSERT INTO mp_checkouts(referencia,usuario_id,tipo,modo,recebedor) VALUES(?,?,?,?,?)", [reference, req.session.usuario.id, type, mode, collector]);
      const returnUrl = `${origin}/orcamento.html?mp_ref=${reference}`;
      const user = await db.get("SELECT email FROM usuarios WHERE id=?", [req.session.usuario.id]);
      const preference = await request("/checkout/preferences", { method: "POST", body: {
        items: [{ id: type, title: product.titulo, quantity: 1, currency_id: "BRL", unit_price: product.valor / 100 }],
        external_reference: reference,
        ...(user.email ? { payer: { email: user.email } } : {}),
        back_urls: { success: returnUrl, pending: returnUrl, failure: returnUrl }, auto_return: "approved",
        notification_url: `${origin}/api/webhooks/mercadopago?source_news=webhooks`,
        expires: true, expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      } });
      const url = checkoutLink(mode === "test" ? preference.sandbox_init_point : preference.init_point);
      if (!url || typeof preference.id !== "string") throw fail(503, "Endereço de pagamento indisponível.");
      await db.run("UPDATE mp_checkouts SET preference_id=?,url=? WHERE referencia=?", [preference.id, url, reference]);
      res.json({ url, referencia: reference, provedor: "mercadopago" });
    })(req, res);
  }

  app.get("/api/pagamentos/mercadopago/compras", exigirLogin, wrap(async (req, res) => {
    const compras = await db.all(`SELECT c.referencia,c.tipo,c.criado_em,
      COALESCE((SELECT r.status FROM mp_recebimentos r WHERE r.referencia=c.referencia ORDER BY r.atualizado_ms DESC LIMIT 1),'aguardando') AS status
      FROM mp_checkouts c WHERE c.usuario_id=? AND c.modo=? AND c.recebedor=? ORDER BY c.criado_em DESC LIMIT 20`,
    [req.session.usuario.id, mode, collector || ""]);
    res.json({ compras });
  }));
  app.post("/api/pagamentos/mercadopago/confirmar", exigirLogin, wrap(async (req, res) => {
    available();
    const reference = req.body?.referencia;
    if (!uuid(reference)) throw fail(400, "Referência de compra inválida.");
    const intent = await db.get("SELECT * FROM mp_checkouts WHERE referencia=? AND usuario_id=? AND modo=? AND recebedor=?", [reference, req.session.usuario.id, mode, collector]);
    if (!intent) throw fail(404, "Compra não encontrada para sua conta.");
    const search = await request(`/v1/payments/search?external_reference=${encodeURIComponent(reference)}&sort=date_created&criteria=desc&limit=10`);
    if (!Array.isArray(search.results)) throw fail(503, "Consulta indisponível.");
    await Promise.all(search.results.slice(0, 10).map(async (item) => {
      if (item.external_reference !== reference) throw fail(409, "Referência divergente.");
      await reconcile(item.id, req.session.usuario.id, reference);
    }));
    const records = await db.all("SELECT status FROM mp_recebimentos WHERE referencia=? ORDER BY atualizado_ms DESC", [reference]);
    const paid = records.some((item) => item.status === "pago");
    const status = paid ? "pago" : records[0]?.status || "aguardando";
    const messages = {
      pago: "Pagamento confirmado. Seus orçamentos estão disponíveis.",
      reembolsado: "Este pagamento foi reembolsado. Os créditos restantes desta compra foram bloqueados.",
      contestado: "Este pagamento está em contestação. Fale com o atendimento para revisar esta compra.",
      recusado: "Pagamento recusado pelo Mercado Pago. Nenhum crédito foi liberado por esta tentativa.",
      cancelado: "Este pagamento foi cancelado.",
    };
    res.json({ status, mensagem: messages[status] || "Pagamento ainda não confirmado. Pix e boleto podem levar algum tempo. Não pague novamente se já concluiu o pagamento." });
  }));
  return { configured, mode, checkout };
}

module.exports = { initMercadoPago, validSignature, checkoutLink, cents };
