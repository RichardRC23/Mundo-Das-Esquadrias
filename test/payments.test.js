const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const bcrypt = require("bcrypt");

// This file runs in its own node:test process. The Stripe SDK is replaced before
// app creation: no secret, real customer, payment or network call is used.
process.env.STRIPE_SECRET_KEY = "sk_test_offline_fixture_not_a_real_key";
const customers = new Map();
const keys = new Map();
const portals = [];
let createCalls = 0;
const fakeStripe = {
  accounts: { retrieve: async () => ({ id: "acct_fixture" }) },
  customers: {
    create: async (params, options) => {
      createCalls++;
      if (keys.has(options.idempotencyKey)) return customers.get(keys.get(options.idempotencyKey));
      const customer = { id: `cus_fixture${customers.size + 1}`, livemode: false,
        metadata: { ...params.metadata }, invoice_settings: { default_payment_method: "pm_fixture" } };
      assert.equal(params.email, undefined);
      keys.set(options.idempotencyKey, customer.id);
      customers.set(customer.id, customer);
      return customer;
    },
    retrieve: async (id) => {
      assert.ok(customers.has(id), "Only a locally linked customer may be requested");
      return customers.get(id);
    },
  },
  paymentMethods: { list: async ({ customer }) => {
    assert.ok(customers.has(customer));
    return { has_more: false, data: [{ id: "pm_fixture", card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 } }] };
  } },
  subscriptions: { list: async ({ customer }) => {
    assert.ok(customers.has(customer));
    return { has_more: false, data: [{ id: "sub_fixture", status: "active", created: 1800000000, currency: "brl",
      items: { has_more: false, data: [{ quantity: 1, current_period_end: 1802592000,
        price: { unit_amount: 15000, currency: "brl", nickname: "Manutenção mensal", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } } }] } }] };
  } },
  invoices: { list: async ({ customer }) => {
    assert.ok(customers.has(customer));
    return { has_more: false, data: [
      { id: "in_paid", number: "TESTE-1", status: "paid", total: 15000, currency: "brl", created: 1800000000, hosted_invoice_url: "https://invoice.stripe.com/i/test_fixture" },
      { id: "in_draft", status: "draft", total: 99999, currency: "brl", created: 1800000000 },
    ] };
  } },
  billingPortal: { sessions: { create: async (params) => {
    assert.ok(customers.has(params.customer));
    portals.push(params);
    return { url: "https://billing.stripe.com/p/session/test_fixture" };
  } } },
};
const sdkPath = require.resolve("stripe");
require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: () => fakeStripe };
const { createApp } = require("../server");
const PASSWORD = "Senha-de-teste-2026!";
const ORIGIN = "http://localhost:3000";

test("optional payment portal verifies ownership and reauthentication without making real payments", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mde-payments-test-"));
  const instance = await createApp({ dataDir: directory, origin: ORIGIN, sessionSecret: "isolated-payment-test-secret" });
  const server = instance.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await instance.close();
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith("mde-payments-test-"));
    await fs.rm(directory, { recursive: true, force: true });
  });
  function client() {
    let cookie = "";
    let csrf = "";
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
  const hash = await bcrypt.hash(PASSWORD, 12);
  const alice = await instance.db.run("INSERT INTO usuarios(nome,email,senha_hash) VALUES(?,?,?)", ["Alice", "alice@example.test", hash]);
  const bob = await instance.db.run("INSERT INTO usuarios(nome,email,senha_hash) VALUES(?,?,?)", ["Bob", "bob@example.test", hash]);
  const request = client();
  await request("/api/csrf");
  assert.equal((await request("/api/pagamentos/portal", { senha_atual: PASSWORD })).status, 401);
  assert.equal((await request("/api/login", { identificador: "alice@example.test", senha: PASSWORD })).status, 200);
  await request("/api/csrf");

  const empty = await request("/api/conta");
  assert.equal(empty.status, 200);
  assert.equal(empty.data.pagamentos.configurado, true);
  assert.equal(empty.data.pagamentos.modo, "teste");
  assert.deepEqual(empty.data.assinaturas, []);
  assert.equal(createCalls, 0, "GET must never create a billing customer");
  assert.equal((await request("/api/pagamentos/portal", {})).status, 400);
  assert.equal((await request("/api/pagamentos/portal", { senha_atual: "incorreta" })).status, 403);
  assert.equal(createCalls, 0);

  const opened = await request("/api/pagamentos/portal", { senha_atual: PASSWORD, customer_id: "cus_attacker", usuario_id: bob.lastID });
  assert.equal(opened.status, 200);
  assert.match(opened.data.url, /^https:\/\/billing\.stripe\.com\//);
  assert.equal(createCalls, 1);
  const saved = await instance.db.get("SELECT * FROM payment_customers WHERE usuario_id = ?", [alice.lastID]);
  assert.equal(saved.customer_id, portals[0].customer);
  assert.equal(customers.get(saved.customer_id).metadata.mundo_usuario_id, String(alice.lastID));
  assert.equal(portals[0].return_url, "http://localhost:3000/perfil.html#pagamentos");
  assert.equal(portals[0].locale, "pt-BR");
  assert.equal(await instance.db.get("SELECT * FROM payment_customers WHERE usuario_id = ?", [bob.lastID]), undefined);

  const overview = await request("/api/conta");
  assert.equal(overview.status, 200);
  assert.equal(overview.data.pagamentos.metodos[0].ultimos4, "4242");
  assert.equal(overview.data.pagamentos.metodos[0].padrao, true);
  assert.equal(overview.data.assinaturas[0].valor_centavos, 15000);
  assert.equal(overview.data.assinaturas[0].periodicidade, "1 mês");
  assert.equal(overview.data.compras.length, 1, "Draft invoices must not appear as purchases");
  assert.equal(overview.data.compras[0].id, "in_paid");
  assert.equal((await request("/api/pagamentos/portal", { senha_atual: PASSWORD })).status, 200);
  assert.equal(createCalls, 1, "Returning users reuse the stored billing customer");

  const bobRequest = client();
  await bobRequest("/api/csrf");
  await bobRequest("/api/login", { identificador: "bob@example.test", senha: PASSWORD });
  await bobRequest("/api/csrf");
  const other = await bobRequest(`/api/conta?usuario_id=${alice.lastID}&customer_id=${saved.customer_id}`);
  assert.equal(other.status, 200);
  assert.deepEqual(other.data.pagamentos.metodos, []);
  assert.deepEqual(other.data.assinaturas, []);

  customers.get(saved.customer_id).metadata.mundo_usuario_id = String(bob.lastID);
  assert.equal((await request("/api/conta")).status, 503, "A corrupted ownership link fails closed");
  const before = portals.length;
  assert.equal((await request("/api/pagamentos/portal", { senha_atual: PASSWORD })).status, 503);
  assert.equal(portals.length, before, "The portal must never open for a mismatched owner");
});
