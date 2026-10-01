const path = require("node:path");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");

const LIMITE = 100;
const METODOS = new Set(["pix", "boleto", "cartao", null]);
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const isoDate = (seconds) => Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
const stripeId = (value) => typeof value === "string" ? value : value?.id;
const localDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
  ? `${value.replace(" ", "T")}Z` : value;

function stripeLink(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["invoice.stripe.com", "billing.stripe.com"].includes(url.hostname)
      && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function checkoutLink(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com" && !url.username && !url.password
      ? url.href : null;
  } catch {
    return null;
  }
}

function subscriptionView(subscription) {
  const items = subscription.items?.data || [];
  const price = items[0]?.price;
  // Mixed intervals, usage/tier pricing and multiple items have no single reliable renewal amount.
  const simple = items.length === 1 && !subscription.items.has_more &&
    Number.isSafeInteger(price?.unit_amount) && price?.recurring?.usage_type !== "metered";
  const interval = price?.recurring?.interval;
  const count = price?.recurring?.interval_count || 1;
  const periods = { day: ["dia", "dias"], week: ["semana", "semanas"], month: ["mês", "meses"], year: ["ano", "anos"] };
  const period = periods[interval];
  const product = price?.product;
  const dates = items.map((item) => item.current_period_end).filter(Number.isFinite);
  return {
    id: subscription.id,
    titulo: (product && typeof product === "object" && !product.deleted && product.name) || price?.nickname || "Assinatura de serviço",
    descricao: subscription.description || "",
    status: subscription.status,
    valor_centavos: simple ? price.unit_amount * (items[0].quantity ?? 1) : null,
    moeda: subscription.currency || price?.currency || "brl",
    periodicidade: items.length === 1 && period ? `${count} ${period[count === 1 ? 0 : 1]}` : null,
    criado_em: isoDate(subscription.created),
    proxima_cobranca: ["active", "trialing"].includes(subscription.status) && !subscription.cancel_at_period_end && !subscription.cancel_at
      ? isoDate(dates.length ? Math.min(...dates) : subscription.current_period_end) : null,
    cancelamento_agendado: Boolean(subscription.cancel_at_period_end || subscription.cancel_at),
  };
}

/**
 * Registers authenticated account/payment routes. `db` methods return Promises.
 * No Stripe customer, payment or subscription is created by a GET request.
 * Mutations must pass the app's same-origin/CSRF middleware before these routes.
 */
async function initPayments({ app, db, exigirLogin, origin, webhookRouter, mercadoPagoTransport,
  paymentConfig = process.env, dataDir = path.join(__dirname, "..", "data") }) {
  const { get, all, run } = db;
  const appOrigin = new URL(origin);
  if (!["http:", "https:"].includes(appOrigin.protocol) || appOrigin.username || appOrigin.password) {
    throw new Error("APP_ORIGIN deve ser uma origem HTTP/HTTPS válida.");
  }
  const returnUrl = new URL("/perfil.html#pagamentos", appOrigin.origin).href;

  await run(`CREATE TABLE IF NOT EXISTS compras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    titulo TEXT NOT NULL,
    descricao TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pendente',
    valor_centavos INTEGER CHECK (valor_centavos IS NULL OR valor_centavos >= 0),
    moeda TEXT NOT NULL DEFAULT 'brl',
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await run("CREATE INDEX IF NOT EXISTS compras_usuario_idx ON compras(usuario_id, criado_em)");
  await run(`CREATE TABLE IF NOT EXISTS contratos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    titulo TEXT NOT NULL,
    descricao TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pendente',
    valor_centavos INTEGER CHECK (valor_centavos IS NULL OR valor_centavos >= 0),
    moeda TEXT NOT NULL DEFAULT 'brl',
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assinado_em TEXT,
    documento_arquivo TEXT
  )`);
  await run("CREATE INDEX IF NOT EXISTS contratos_usuario_idx ON contratos(usuario_id, criado_em)");
  await run(`CREATE TABLE IF NOT EXISTS payment_settings (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  )`);
  await run("INSERT OR IGNORE INTO payment_settings (chave, valor) VALUES ('namespace', ?)", [randomUUID()]);
  const { valor: namespace } = await get("SELECT valor FROM payment_settings WHERE chave = 'namespace'");
  await run(`CREATE TABLE IF NOT EXISTS payment_customers (
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    stripe_account TEXT NOT NULL,
    modo TEXT NOT NULL CHECK (modo IN ('test', 'live')),
    customer_id TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, stripe_account, modo),
    UNIQUE (stripe_account, modo, customer_id)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS creditos_orcamento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    stripe_session_id TEXT NOT NULL UNIQUE,
    tipo TEXT NOT NULL CHECK (tipo IN ('individual', 'pacote10')),
    quantidade INTEGER NOT NULL CHECK (quantidade IN (1, 10)),
    valor_centavos INTEGER NOT NULL,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await run("CREATE INDEX IF NOT EXISTS creditos_orcamento_usuario_idx ON creditos_orcamento(usuario_id, id)");
  if (!(await all("PRAGMA table_info(creditos_orcamento)")).some((c) => c.name === "revogado")) {
    await run("ALTER TABLE creditos_orcamento ADD COLUMN revogado INTEGER NOT NULL DEFAULT 0");
  }
  if (!(await all("PRAGMA table_info(compras)")).some((c) => c.name === "pagamento_referencia")) {
    await run("ALTER TABLE compras ADD COLUMN pagamento_referencia TEXT");
  }
  await run("CREATE UNIQUE INDEX IF NOT EXISTS compras_pagamento_referencia ON compras(pagamento_referencia)");
  const mp = await require("./mercadopago").initMercadoPago({ app, webhookRouter, db, exigirLogin,
    origin: appOrigin.origin, transport: mercadoPagoTransport, config: paymentConfig });
  // Existing Stripe installations continue working until explicitly switched.
  const provider = paymentConfig.PAYMENT_PROVIDER || (process.env.STRIPE_SECRET_KEY ? "stripe" : "mercadopago");
  if (!["mercadopago", "stripe"].includes(provider)) throw new Error("PAYMENT_PROVIDER inválido.");

  const key = process.env.STRIPE_SECRET_KEY?.trim() || "";
  const keyMode = key.match(/^(?:sk|rk)_(test|live)_/);
  if (key && !keyMode) throw new Error("STRIPE_SECRET_KEY inválida. Use uma chave secreta de teste ou produção, nunca uma chave pública.");
  const stripe = key ? require("stripe")(key, { maxNetworkRetries: 1, timeout: 10000 }) : null;
  const mode = keyMode?.[1];
  const quotePrices = {
    individual: { id: process.env.STRIPE_QUOTE_SINGLE_PRICE_ID?.trim() || "", quantidade: 1, valor: 599, titulo: "1 orçamento adicional" },
    pacote10: { id: process.env.STRIPE_QUOTE_PACK_PRICE_ID?.trim() || "", quantidade: 10, valor: 990, titulo: "Pacote de até 10 orçamentos" },
  };
  for (const [type, product] of Object.entries(quotePrices)) {
    if (product.id && !/^price_[a-zA-Z0-9]+$/.test(product.id)) {
      throw new Error(`${type === "individual" ? "STRIPE_QUOTE_SINGLE_PRICE_ID" : "STRIPE_QUOTE_PACK_PRICE_ID"} inválido. Informe um identificador price_...`);
    }
  }
  const quoteCheckoutConfigured = Boolean(stripe && quotePrices.individual.id && quotePrices.pacote10.id);
  let accountPromise;
  async function accountId() {
    if (!accountPromise) {
      accountPromise = stripe.accounts.retrieve().then((account) => {
        if (!/^acct_[a-zA-Z0-9]+$/.test(account.id)) throw new Error("Conta de pagamento inválida.");
        return account.id;
      }).catch((error) => { accountPromise = null; throw error; });
    }
    return accountPromise;
  }

  async function existingCustomer(userId, account) {
    return get("SELECT customer_id FROM payment_customers WHERE usuario_id = ? AND stripe_account = ? AND modo = ?", [userId, account, mode]);
  }

  async function checkedCustomer(customerId, userId) {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted || customer.livemode !== (mode === "live") ||
      customer.metadata?.mundo_usuario_id !== String(userId) || customer.metadata?.mundo_instalacao !== namespace) {
      throw new Error("Vínculo de pagamento inválido.");
    }
    return customer;
  }

  async function customerForPortal(userId) {
    const account = await accountId();
    let saved = await existingCustomer(userId, account);
    if (!saved) {
      // Stable parameters/key prevent parallel requests creating separate customers.
      // No email lookup: a shared/changed email must never grant another customer's access.
      const customer = await stripe.customers.create({
        metadata: { mundo_usuario_id: String(userId), mundo_instalacao: namespace },
      }, { idempotencyKey: `mundo-${namespace}-${account}-${mode}-${userId}` });
      await run(`INSERT OR IGNORE INTO payment_customers (usuario_id, stripe_account, modo, customer_id)
        VALUES (?, ?, ?, ?)`, [userId, account, mode, customer.id]);
      saved = await existingCustomer(userId, account);
    }
    return checkedCustomer(saved.customer_id, userId);
  }

  function providerError(error, res) {
    // Never log credentials, provider payloads, billing data or the temporary portal URL.
    console.error("Falha no provedor de pagamentos:", error.type || "consulta indisponível");
    return res.status(503).json({ erro: "Não foi possível consultar os pagamentos agora. Tente novamente mais tarde ou fale com o atendimento." });
  }

  const limitePortal = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    keyGenerator: (req) => String(req.session.usuario.id),
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: "Muitas tentativas. Aguarde 15 minutos para tentar novamente." },
  });
  const limiteConsulta = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    keyGenerator: (req) => String(req.session.usuario.id),
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: "Aguarde um minuto antes de atualizar sua conta novamente." },
  });

  app.get("/api/conta", exigirLogin, limiteConsulta, wrap(async (req, res) => {
    res.set("Cache-Control", "no-store");
    const userId = req.session.usuario.id;
    const [usuario, localPurchases, localContracts] = await Promise.all([
      get("SELECT preferencia_pagamento FROM usuarios WHERE id = ?", [userId]),
      all(`SELECT id, titulo, descricao, status, valor_centavos, moeda, criado_em
        FROM compras WHERE usuario_id = ? ORDER BY criado_em DESC, id DESC LIMIT ?`, [userId, LIMITE + 1]),
      all(`SELECT id, titulo, descricao, status, valor_centavos, moeda, criado_em, assinado_em, documento_arquivo
        FROM contratos WHERE usuario_id = ? ORDER BY criado_em DESC, id DESC LIMIT ?`, [userId, LIMITE + 1]),
    ]);
    if (!usuario) return res.status(401).json({ erro: "Faça login para acessar sua conta." });
    const resultado = {
      compras: localPurchases.slice(0, LIMITE).map((item) => ({ ...item, criado_em: localDate(item.criado_em), origem: "local" })),
      contratos: localContracts.slice(0, LIMITE).map(({ documento_arquivo, ...item }) => ({
        ...item,
        criado_em: localDate(item.criado_em),
        assinado_em: localDate(item.assinado_em),
        documento_url: documento_arquivo ? `/api/contratos/${item.id}/documento` : null,
      })),
      assinaturas: [],
      pagamentos: {
        configurado: provider === "mercadopago" ? mp.configured : Boolean(stripe),
        portal_disponivel: Boolean(stripe),
        provedor: provider,
        apple_pay_disponivel: false,
        modo: provider === "mercadopago" ? (mp.configured ? (mp.mode === "production" ? "producao" : "teste") : null)
          : stripe ? (mode === "live" ? "producao" : "teste") : null,
        metodos: [],
        preferencia: usuario.preferencia_pagamento || null,
      },
      limites: { compras: LIMITE, contratos: LIMITE, assinaturas: LIMITE, metodos: LIMITE },
      tem_mais: { compras: localPurchases.length > LIMITE, contratos: localContracts.length > LIMITE, assinaturas: false, metodos: false },
    };
    if (stripe) {
      try {
        const saved = await existingCustomer(userId, await accountId());
        if (saved) {
          const customer = await checkedCustomer(saved.customer_id, userId);
          const [methods, subscriptions, invoices] = await Promise.all([
            stripe.paymentMethods.list({ customer: customer.id, type: "card", limit: LIMITE }),
            stripe.subscriptions.list({ customer: customer.id, status: "all", limit: LIMITE }),
            stripe.invoices.list({ customer: customer.id, limit: LIMITE }),
          ]);
          resultado.pagamentos.metodos = methods.data.map((method) => ({
            id: method.id,
            tipo: "cartao",
            bandeira: method.card.brand,
            ultimos4: method.card.last4,
            exp_mes: method.card.exp_month,
            exp_ano: method.card.exp_year,
            padrao: method.id === stripeId(customer.invoice_settings?.default_payment_method),
          }));
          resultado.assinaturas = subscriptions.data.map(subscriptionView);
          const providerPurchases = invoices.data.filter((invoice) => invoice.status !== "draft").map((invoice) => ({
            id: invoice.id,
            titulo: invoice.number ? `Fatura ${invoice.number}` : "Fatura de serviço",
            descricao: invoice.description || "",
            status: invoice.status,
            valor_centavos: invoice.total,
            moeda: invoice.currency,
            criado_em: isoDate(invoice.created),
            origem: "stripe",
            documento_url: stripeLink(invoice.hosted_invoice_url),
          }));
          const purchases = [...resultado.compras, ...providerPurchases].sort((a, b) => Date.parse(b.criado_em) - Date.parse(a.criado_em));
          resultado.compras = purchases.slice(0, LIMITE);
          resultado.tem_mais.compras ||= invoices.has_more || purchases.length > LIMITE;
          resultado.tem_mais.assinaturas = subscriptions.has_more;
          resultado.tem_mais.metodos = methods.has_more;
        }
      } catch (error) {
        return providerError(error, res);
      }
    }
    res.json(resultado);
  }));

  app.put("/api/pagamentos/preferencia", exigirLogin, wrap(async (req, res) => {
    const method = req.body?.metodo;
    if (!METODOS.has(method)) return res.status(400).json({ erro: "Escolha Pix, boleto ou cartão." });
    const result = await run("UPDATE usuarios SET preferencia_pagamento = ? WHERE id = ?", [method, req.session.usuario.id]);
    if (!result.changes) return res.status(404).json({ erro: "Conta não encontrada." });
    res.json({ mensagem: "Preferência salva. Isso não autoriza nem altera cobranças existentes.", preferencia: method });
  }));

  app.post("/api/pagamentos/orcamentos/checkout", exigirLogin, limitePortal, wrap(async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (provider === "mercadopago") return mp.checkout(req, res);
    if (!quoteCheckoutConfigured) {
      return res.status(503).json({ erro: "A compra de orçamentos ainda não foi ativada pela empresa." });
    }
    try {
      const product = quotePrices[req.body?.plano];
      if (!product) return res.status(400).json({ erro: "Escolha 1 orçamento ou o pacote de até 10 orçamentos." });
      const price = await stripe.prices.retrieve(product.id);
      if (!price.active || price.currency !== "brl" || price.unit_amount !== product.valor || price.type !== "one_time") {
        throw new Error("O preço configurado não corresponde ao produto escolhido.");
      }
      const customer = await customerForPortal(req.session.usuario.id);
      const successUrl = `${appOrigin.origin}/orcamento.html?compra=sucesso&session_id={CHECKOUT_SESSION_ID}`;
      const checkout = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customer.id,
        line_items: [{ price: product.id, quantity: 1 }],
        success_url: successUrl,
        cancel_url: new URL("/orcamento.html?compra=cancelada", appOrigin.origin).href,
        locale: "pt-BR",
        client_reference_id: String(req.session.usuario.id),
        metadata: {
          mundo_usuario_id: String(req.session.usuario.id), mundo_instalacao: namespace,
          mundo_produto: req.body.plano, mundo_quantidade: String(product.quantidade),
        },
      }, { idempotencyKey: `mundo-checkout-orcamentos-${namespace}-${mode}-${req.session.usuario.id}-${randomUUID()}` });
      const url = checkoutLink(checkout.url);
      if (!url) throw new Error("Endereço de pagamento inesperado.");
      res.json({ url });
    } catch (error) {
      providerError(error, res);
    }
  }));

  app.post("/api/pagamentos/orcamentos/confirmar", exigirLogin, limitePortal, wrap(async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!quoteCheckoutConfigured) return res.status(503).json({ erro: "A compra de orçamentos ainda não foi ativada pela empresa." });
    const sessionId = req.body?.session_id;
    if (typeof sessionId !== "string" || sessionId.length > 255 || !/^cs_(?:test_|live_)?[a-zA-Z0-9_]+$/.test(sessionId)) {
      return res.status(400).json({ erro: "Confirmação de pagamento inválida." });
    }
    try {
      const checkout = await stripe.checkout.sessions.retrieve(sessionId);
      const product = quotePrices[checkout.metadata?.mundo_produto];
      const saved = await existingCustomer(req.session.usuario.id, await accountId());
      const customerId = stripeId(checkout.customer);
      if (!product || !saved || saved.customer_id !== customerId || checkout.livemode !== (mode === "live") ||
        checkout.mode !== "payment" || checkout.payment_status !== "paid" || checkout.currency !== "brl" ||
        checkout.amount_total !== product.valor || checkout.metadata?.mundo_usuario_id !== String(req.session.usuario.id) ||
        checkout.metadata?.mundo_instalacao !== namespace || checkout.metadata?.mundo_quantidade !== String(product.quantidade)) {
        return res.status(403).json({ erro: "Não foi possível validar esta compra para sua conta." });
      }
      await checkedCustomer(customerId, req.session.usuario.id);
      const result = await run(`INSERT OR IGNORE INTO creditos_orcamento
        (usuario_id,stripe_session_id,tipo,quantidade,valor_centavos) VALUES (?,?,?,?,?)`,
      [req.session.usuario.id, checkout.id, checkout.metadata.mundo_produto, product.quantidade, product.valor]);
      if (result.changes) {
        await run(`INSERT INTO compras (usuario_id,titulo,descricao,status,valor_centavos,moeda)
          VALUES (?,?,?,?,?,'brl')`, [req.session.usuario.id, product.titulo, "Créditos de orçamento pagos", "pago", product.valor]);
      }
      res.json({ mensagem: result.changes ? "Pagamento confirmado. Seus orçamentos já estão disponíveis." : "Pagamento já confirmado.", creditos: product.quantidade });
    } catch (error) {
      providerError(error, res);
    }
  }));

  app.post("/api/pagamentos/portal", exigirLogin, limitePortal, wrap(async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!stripe) return res.status(503).json({ erro: "O gerenciamento de cartões e assinaturas ainda não foi ativado pela empresa." });
    const password = req.body?.senha_atual;
    if (typeof password !== "string" || password.length === 0 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ erro: "Confirme sua senha atual para gerenciar pagamentos." });
    }
    const usuario = await get("SELECT senha_hash FROM usuarios WHERE id = ?", [req.session.usuario.id]);
    if (!usuario) return res.status(401).json({ erro: "Faça login novamente." });
    if (!await bcrypt.compare(password, usuario.senha_hash)) return res.status(403).json({ erro: "Senha atual incorreta." });
    try {
      const customer = await customerForPortal(req.session.usuario.id);
      const config = process.env.STRIPE_PORTAL_CONFIGURATION?.trim();
      const portal = await stripe.billingPortal.sessions.create({
        customer: customer.id,
        return_url: returnUrl,
        locale: "pt-BR",
        ...(config ? { configuration: config } : {}),
      });
      const url = stripeLink(portal.url);
      if (!url) throw new Error("Endereço de pagamento inesperado.");
      res.json({ url });
    } catch (error) {
      providerError(error, res);
    }
  }));

  app.get("/api/contratos/:id/documento", exigirLogin, wrap(async (req, res, next) => {
    if (!/^[1-9]\d{0,14}$/.test(req.params.id)) return res.status(404).json({ erro: "Documento não encontrado." });
    const contract = await get("SELECT documento_arquivo FROM contratos WHERE id = ? AND usuario_id = ?", [req.params.id, req.session.usuario.id]);
    const filename = contract?.documento_arquivo;
    if (!filename || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,120}\.pdf$/i.test(filename)) {
      return res.status(404).json({ erro: "Documento não encontrado." });
    }
    let file;
    try {
      const directory = await fs.realpath(path.join(dataDir, "contratos"));
      file = await fs.realpath(path.join(directory, filename));
      const relative = path.relative(directory, file);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !(await fs.stat(file)).isFile()) {
        return res.status(404).json({ erro: "Documento não encontrado." });
      }
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes(error.code)) return res.status(404).json({ erro: "Documento não encontrado." });
      throw error;
    }
    res.set("Cache-Control", "no-store");
    res.type("application/pdf");
    res.attachment(`contrato-${req.params.id}.pdf`);
    res.sendFile(file, (error) => { if (error) next(error); });
  }));

  return { comprasOrcamentoConfiguradas: provider === "mercadopago" ? mp.configured : quoteCheckoutConfigured,
    aceitarCreditosMPTeste: provider === "mercadopago" && mp.configured && mp.mode === "test" };
}

module.exports = { initPayments };
