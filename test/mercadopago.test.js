const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { createHmac } = require("node:crypto");
const bcrypt = require("bcrypt");
process.env.STRIPE_SECRET_KEY = "";
process.env.APPLE_PAY_DOMAIN_VERIFICATION = "1";
const { createApp } = require("../app");
const { checkoutLink, cents } = require("../lib/mercadopago");
const ORIGIN = "https://loja.example.test";
const CONFIG = { PAYMENT_PROVIDER: "mercadopago", MP_ENVIRONMENT: "test", MP_ACCESS_TOKEN: "offline-fixture",
  MP_COLLECTOR_ID: "123456", MP_WEBHOOK_SECRET: "offline-webhook-fixture" };

test("Mercado Pago: validation helpers reject unsafe links and imprecise prices", () => {
  assert.equal(cents("5.99"), 599);
  assert.equal(cents(9.9), 990);
  assert.ok(Number.isNaN(cents("5.999")));
  for (const url of ["http://www.mercadopago.com.br/checkout/v1", "https://www.mercadopago.com.br.evil.test/checkout/v1",
    "https://evil@www.mercadopago.com.br/checkout/v1", "https://www.mercadopago.com.br:444/checkout/v1", "https://www.mercadopago.com.br/other"]) {
    assert.equal(checkoutLink(url), null);
  }
  assert.ok(checkoutLink("https://sandbox.mercadopago.com.br/checkout/v1?pref_id=fixture"));
});

test("without credentials the free quote works, real checkout stays disabled and test credits cannot be spent", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mde-mp-disabled-"));
  const instance = await createApp({ dataDir: directory, origin: "http://localhost:3000", sessionSecret: "offline-disabled-fixture",
    paymentConfig: { PAYMENT_PROVIDER: "mercadopago" },
    mercadoPagoTransport: async () => { assert.fail("No provider calls without configuration"); } });
  const server = instance.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await instance.close();
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith("mde-mp-disabled-"));
    await fs.rm(directory, { recursive: true, force: true });
  });
  let cookie = "", csrf = "";
  async function request(route, body) {
    const response = await fetch(base + route, { method: body ? "POST" : "GET", headers: {
      Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": csrf,
    }, body: body ? JSON.stringify(body) : undefined });
    for (const value of response.headers.getSetCookie()) cookie = value.split(";")[0];
    const data = await response.json();
    if (data.token) csrf = data.token;
    return { status: response.status, data };
  }
  const user = await instance.db.run("INSERT INTO usuarios(nome,email,senha_hash) VALUES(?,?,?)",
    ["Teste", "disabled@example.test", await bcrypt.hash("Offline-test-123!", 4)]);
  await request("/api/csrf");
  await request("/api/login", { identificador: "disabled@example.test", senha: "Offline-test-123!" });
  await request("/api/csrf");
  assert.equal((await request("/api/orcamentos/acesso")).data.acesso.restantes, 1);
  assert.equal((await request("/api/pagamentos/orcamentos/checkout", { plano: "individual" })).status, 503);
  await instance.db.run("INSERT INTO usos_orcamento(usuario_id,periodo_chave,slot) VALUES(?,'gratuito',1)", [user.lastID]);
  await instance.db.run(`INSERT INTO creditos_orcamento(usuario_id,stripe_session_id,tipo,quantidade,valor_centavos)
    VALUES(?,'mp:test:123456:100','pacote10',10,990)`, [user.lastID]);
  const access = (await request("/api/orcamentos/acesso")).data.acesso;
  assert.equal(access.restantes, 0);
  assert.equal(access.compra_disponivel, false);
  assert.equal((await fetch(base + "/.well-known/apple-developer-merchantid-domain-association")).status, 404);
});

test("Mercado Pago: checkout, signed webhooks and reconciliation use isolated data and no real network", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mde-mp-test-"));
  const payments = new Map();
  const preferences = [];
  let providerDown = false;
  let reads = 0;
  const transport = async (route, options = {}) => {
    if (providerDown) throw new Error("offline fixture outage");
    if (route === "/users/me") return { id: 123456, tags: ["test_user"] };
    if (route === "/checkout/preferences") {
      preferences.push(options.body);
      return { id: `pref-${preferences.length}`, sandbox_init_point: `https://sandbox.mercadopago.com.br/checkout/v1?pref_id=${preferences.length}` };
    }
    if (route.startsWith("/v1/payments/search?")) {
      const reference = new URL(route, "https://example.test").searchParams.get("external_reference");
      return { results: [...payments.values()].filter((p) => p.external_reference === reference) };
    }
    const id = route.split("/").pop();
    assert.ok(payments.has(id), "Only fixture payment IDs can be requested");
    reads++;
    return { ...payments.get(id) };
  };
  const instance = await createApp({ dataDir: directory, origin: ORIGIN, sessionSecret: "offline-mp-session-fixture",
    paymentConfig: CONFIG, mercadoPagoTransport: transport });
  const server = instance.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await instance.close();
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith("mde-mp-test-"));
    await fs.rm(directory, { recursive: true, force: true });
  });
  function client() {
    let cookie = "", csrf = "";
    return async (route, body) => {
      const response = await fetch(base + route, { method: body === undefined ? "GET" : "POST",
        headers: { Origin: ORIGIN, Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: body === undefined ? undefined : JSON.stringify(body) });
      for (const value of response.headers.getSetCookie()) cookie = value.split(";")[0];
      const data = await response.json();
      if (data.token) csrf = data.token;
      return { status: response.status, data };
    };
  }
  const request = client(), other = client();
  const hash = await bcrypt.hash("Offline-test-123!", 4);
  const alice = await instance.db.run("INSERT INTO usuarios(nome,email,senha_hash) VALUES(?,?,?)", ["Alice", "alice@example.test", hash]);
  await instance.db.run("INSERT INTO usuarios(nome,email,senha_hash) VALUES(?,?,?)", ["Bob", "bob@example.test", hash]);
  for (const [clientRequest, email] of [[request, "alice@example.test"], [other, "bob@example.test"]]) {
    await clientRequest("/api/csrf");
    assert.equal((await clientRequest("/api/login", { identificador: email, senha: "Offline-test-123!" })).status, 200);
    await clientRequest("/api/csrf");
  }
  let reference;
  const makePayment = (id, overrides = {}) => ({ id: Number(id), external_reference: reference, collector_id: 123456,
    live_mode: false, currency_id: "BRL", transaction_amount: 9.90, transaction_amount_refunded: 0,
    status: "approved", date_last_updated: "2026-09-30T12:00:00.000Z", ...overrides });
  async function webhook(id, { signature, query, body, requestId = "fixture-request" } = {}) {
    const ts = "1790769600";
    const v1 = createHmac("sha256", CONFIG.MP_WEBHOOK_SECRET).update(`id:${id};request-id:${requestId};ts:${ts};`).digest("hex");
    return fetch(`${base}/api/webhooks/mercadopago?${query || `data.id=${id}&type=payment`}`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Request-Id": requestId,
        "X-Signature": signature ?? `ts=${ts},v1=${v1}` }, body: JSON.stringify(body || { type: "payment", data: { id } }),
    });
  }
  const count = async (table) => (await instance.db.get(`SELECT COUNT(*) n FROM ${table}`)).n;

  await t.test("checkout fixes prices, requires login/CSRF and reuses the recent preference", async () => {
    assert.equal((await client()("/api/pagamentos/orcamentos/checkout", { plano: "pacote10" })).status, 403);
    const anonymous = client(); await anonymous("/api/csrf");
    assert.equal((await anonymous("/api/pagamentos/orcamentos/checkout", { plano: "pacote10" })).status, 401);
    const created = await request("/api/pagamentos/orcamentos/checkout", { plano: "pacote10", valor: 1, usuario_id: 999 });
    assert.equal(created.status, 200);
    reference = created.data.referencia;
    assert.equal(preferences[0].items[0].unit_price, 9.9);
    assert.equal(preferences[0].items[0].quantity, 1);
    assert.match(preferences[0].notification_url, /\/api\/webhooks\/mercadopago\?/);
    const repeat = await request("/api/pagamentos/orcamentos/checkout", { plano: "pacote10" });
    assert.equal(repeat.data.referencia, reference);
    assert.equal(preferences.length, 1);
    assert.equal((await request("/api/pagamentos/orcamentos/checkout", { plano: "__proto__" })).status, 400);
  });
  await t.test("invalid signatures, duplicate query IDs and body tampering cause no provider reads", async () => {
    for (const options of [{ signature: "" }, { signature: "ts=1790769600,v1=" + "0".repeat(64) },
      { query: "data.id=100&data.id=100" }, { body: { type: "payment", data: { id: "101" } } }]) {
      assert.equal((await webhook("100", options)).status, 401);
    }
    assert.equal(reads, 0);
    assert.equal(await count("creditos_orcamento"), 0);
  });
  await t.test("pending payments and other customers cannot unlock credits", async () => {
    payments.set("100", makePayment("100", { status: "pending" }));
    assert.equal((await webhook("100")).status, 200);
    assert.equal(await count("creditos_orcamento"), 0);
    assert.equal((await other("/api/pagamentos/mercadopago/confirmar", { referencia: reference })).status, 404);
    assert.equal((await other("/api/pagamentos/mercadopago/compras")).data.compras.length, 0);
    const result = await request("/api/pagamentos/mercadopago/confirmar", { referencia: reference, status: "approved" });
    assert.equal(result.data.status, "pendente");
    assert.equal(await count("creditos_orcamento"), 0);
  });
  await t.test("wrong amount, receiver, currency and environment cannot grant credits", async () => {
    for (const overrides of [{ transaction_amount: 0.01 }, { collector_id: 987 }, { currency_id: "USD" }, { live_mode: true }]) {
      payments.set("101", makePayment("101", overrides));
      assert.equal((await webhook("101")).status, 409);
    }
    payments.delete("101");
    assert.equal(await count("creditos_orcamento"), 0);
  });
  await t.test("parallel signed retries and return reconciliation credit a purchase exactly once", async () => {
    payments.set("100", makePayment("100", { date_last_updated: "2026-09-30T12:01:00Z" }));
    const responses = await Promise.all(Array.from({ length: 8 }, () => webhook("100")));
    assert.ok(responses.every((r) => r.status === 200));
    assert.equal((await request("/api/pagamentos/mercadopago/confirmar", { referencia: reference })).data.status, "pago");
    assert.equal(await count("creditos_orcamento"), 1);
    assert.equal(await count("compras"), 1);
    const credit = await instance.db.get("SELECT * FROM creditos_orcamento");
    assert.equal(credit.usuario_id, alice.lastID);
    assert.equal(credit.quantidade, 10);
  });
  await t.test("refund revokes unused credits and stale paid events cannot restore them", async () => {
    await instance.db.run("INSERT INTO usos_orcamento(usuario_id,periodo_chave,slot) VALUES(?,'gratuito',1)", [alice.lastID]);
    assert.equal((await request("/api/orcamentos/acesso")).data.acesso.restantes, 10);
    payments.set("100", makePayment("100", { status: "refunded", transaction_amount_refunded: 9.9, date_last_updated: "2026-09-30T12:02:00Z" }));
    assert.equal((await webhook("100")).status, 200);
    assert.equal((await request("/api/orcamentos/acesso")).data.acesso.restantes, 0);
    payments.set("100", makePayment("100"));
    assert.equal((await webhook("100")).status, 200);
    assert.equal((await request("/api/orcamentos/acesso")).data.acesso.restantes, 0);
    assert.equal((await instance.db.get("SELECT status FROM compras")).status, "reembolsado");
    assert.equal(await count("creditos_orcamento"), 1);
  });
  await t.test("provider/storage failures are retryable and cannot partially grant credits", async () => {
    payments.set("102", makePayment("102"));
    providerDown = true;
    assert.equal((await webhook("102")).status, 503);
    providerDown = false;
    await instance.db.run("CREATE TRIGGER fixture_failure BEFORE INSERT ON creditos_orcamento BEGIN SELECT RAISE(ABORT,'fixture'); END");
    assert.equal((await webhook("102")).status, 503);
    assert.equal(await count("mp_recebimentos"), 1);
    assert.equal(await count("compras"), 1);
    await instance.db.run("DROP TRIGGER fixture_failure");
    assert.equal((await webhook("102")).status, 200);
    assert.equal(await count("creditos_orcamento"), 2);
  });
  await t.test("Apple domain proof is opt-in, exact-file-only; payment button remains disabled", async () => {
    const route = "/.well-known/apple-developer-merchantid-domain-association";
    assert.equal((await fetch(base + route)).status, 404);
    await fs.mkdir(path.join(directory, "apple-pay"));
    await fs.writeFile(path.join(directory, "apple-pay", "domain-association.txt"), "offline-domain-proof-fixture");
    assert.equal(await (await fetch(base + route)).text(), "offline-domain-proof-fixture");
    assert.equal((await fetch(base + route + ".txt")).status, 200);
    for (const privateRoute of ["/data/apple-pay/domain-association.txt", "/.env", "/.well-known/merchant.cer"]) {
      assert.equal((await fetch(base + privateRoute)).status, 404);
    }
    const account = await request("/api/conta");
    assert.equal(account.data.pagamentos.provedor, "mercadopago");
    assert.equal(account.data.pagamentos.portal_disponivel, false);
    assert.equal(account.data.pagamentos.apple_pay_disponivel, false);
    await fs.writeFile(path.join(directory, "apple-pay", "domain-association.txt"), "-----BEGIN PRIVATE KEY-----");
    assert.equal((await fetch(base + route)).status, 404);
  });
});
