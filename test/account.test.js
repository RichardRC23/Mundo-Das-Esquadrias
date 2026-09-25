const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
// Every test uses local fixtures; provider credentials must never trigger requests.
process.env.STRIPE_SECRET_KEY = "";
const { createApp } = require("../server");

const PASSWORD = "Senha-de-teste-2026!";
const ORIGIN = "http://localhost:3000";

async function fixture(t) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "mde-account-test-"));
  const instance = await createApp({
    dataDir,
    sessionSecret: "segredo-exclusivo-dos-testes-sem-uso-em-producao",
    origin: ORIGIN,
  });
  const server = instance.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await instance.close();
    // Only the unique temporary folder created by this fixture is removed.
    assert.equal(path.dirname(dataDir), os.tmpdir());
    assert.ok(path.basename(dataDir).startsWith("mde-account-test-"));
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  return { ...instance, dataDir, client: () => new Client(baseUrl) };
}

class Client {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookie = "";
    this.token = "";
  }

  async request(route, options = {}) {
    const { method = "GET", json, form, csrf = true, origin = ORIGIN } = options;
    const headers = {};
    if (origin) headers.Origin = origin;
    if (this.cookie) headers.Cookie = this.cookie;
    if (csrf && this.token) headers["X-CSRF-Token"] = this.token;
    if (json !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${this.baseUrl}${route}`, {
      method,
      headers,
      body: form || (json === undefined ? undefined : JSON.stringify(json)),
      redirect: "manual",
    });
    for (const cookie of response.headers.getSetCookie()) {
      this.cookie = cookie.split(";")[0];
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const body = buffer.toString("utf8");
    let data;
    if (response.headers.get("content-type")?.includes("application/json")) {
      data = JSON.parse(body);
    }
    return { status: response.status, headers: response.headers, data, body, buffer };
  }

  async csrf() {
    const response = await this.request("/api/csrf");
    assert.equal(response.status, 200, response.body);
    assert.equal(typeof response.data.token, "string");
    assert.ok(response.data.token.length >= 20);
    this.token = response.data.token;
    return response;
  }

  async register(overrides = {}) {
    await this.csrf();
    const response = await this.request("/api/cadastro", {
      method: "POST",
      json: {
        nome: "Cliente de Teste",
        email: "cliente@example.test",
        telefone: "21999990001",
        senha: PASSWORD,
        ...overrides,
      },
    });
    assert.equal(response.status, 201, response.body);
    await this.csrf();
    return response.data.usuario;
  }

  async login(identificador = "cliente@example.test", senha = PASSWORD) {
    await this.csrf();
    const response = await this.request("/api/login", {
      method: "POST",
      json: { identificador, senha },
    });
    assert.equal(response.status, 200, response.body);
    await this.csrf();
    return response;
  }
}

function assertClientError(response) {
  assert.ok(response.status >= 400 && response.status < 500, response.body);
  assert.equal(typeof response.data?.erro, "string", response.body);
}

test("private account and photo routes require a real authenticated session", async (t) => {
  const { client } = await fixture(t);
  const anonymous = client();
  for (const route of ["/api/usuario", "/api/perfil", "/api/conta", "/api/perfil/foto"]) {
    const response = await anonymous.request(route);
    assert.equal(response.status, 401, `${route}: ${response.body}`);
  }
});

test("CSRF protection rejects missing tokens and foreign origins", async (t) => {
  const { client } = await fixture(t);
  const user = client();
  const cadastro = { nome: "Teste", email: "teste@example.test", senha: PASSWORD };
  const missing = await user.request("/api/cadastro", { method: "POST", json: cadastro });
  assert.equal(missing.status, 403, missing.body);
  await user.csrf();
  const foreign = await user.request("/api/cadastro", {
    method: "POST", json: cadastro, origin: "https://untrusted.example",
  });
  assert.equal(foreign.status, 403, foreign.body);
  await user.register();
  const update = await user.request("/api/perfil", {
    method: "PUT", csrf: false,
    json: { nome: "Outro nome", email: "cliente@example.test", telefone: "21999990001" },
  });
  assert.equal(update.status, 403, update.body);
});

test("registration and login rotate sessions, hash passwords, and logout revokes access", async (t) => {
  const { db, client } = await fixture(t);
  const user = client();
  await user.csrf();
  const anonymousCookie = user.cookie;
  await user.register();
  assert.notEqual(user.cookie, anonymousCookie);
  const staleAnonymous = client();
  staleAnonymous.cookie = anonymousCookie;
  assert.equal((await staleAnonymous.request("/api/perfil")).status, 401);
  const profile = await user.request("/api/perfil");
  assert.equal(profile.status, 200, profile.body);
  assert.equal(profile.data.usuario.email, "cliente@example.test");
  assert.ok(!profile.body.includes("senha"));
  assert.match(profile.headers.get("cache-control"), /no-store/);
  const stored = await db.get("SELECT senha_hash FROM usuarios WHERE email = ?", ["cliente@example.test"]);
  assert.notEqual(stored.senha_hash, PASSWORD);
  assert.match(stored.senha_hash, /^\$2[aby]\$/);

  const authenticatedCookie = user.cookie;
  const logout = await user.request("/api/sair", { method: "POST" });
  assert.equal(logout.status, 200, logout.body);
  const oldSession = client();
  oldSession.cookie = authenticatedCookie;
  assert.equal((await oldSession.request("/api/perfil")).status, 401);

  await user.csrf();
  const beforeLogin = user.cookie;
  const login = await user.login();
  assert.notEqual(user.cookie, beforeLogin);
  const setCookie = login.headers.getSetCookie().join(";");
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.equal((await user.request("/api/usuario")).status, 200);
});

test("malformed registration and login data return validation errors without crashing", async (t) => {
  const { client } = await fixture(t);
  const user = client();
  await user.csrf();
  const valid = { nome: "Teste", email: "teste@example.test", senha: PASSWORD };
  const invalid = [
    { ...valid, nome: {} },
    { ...valid, email: ["teste@example.test"] },
    { ...valid, senha: "curta" },
    { ...valid, senha: "á".repeat(37) },
    { ...valid, telefone: {} },
  ];
  for (const json of invalid) {
    const response = await user.request("/api/cadastro", { method: "POST", json });
    assert.equal(response.status, 400, response.body);
  }
  const malformedLogin = await user.request("/api/login", {
    method: "POST", json: { identificador: {}, senha: PASSWORD },
  });
  assert.equal(malformedLogin.status, 400, malformedLogin.body);
  const injection = await user.request("/api/login", {
    method: "POST", json: { identificador: "' OR 1=1 --@example.test", senha: PASSWORD },
  });
  assert.equal(injection.status, 401, injection.body);
});

test("contact changes require the current password and target only the signed-in user", async (t) => {
  const { client } = await fixture(t);
  const alice = client();
  const bob = client();
  await alice.register();
  const bobUser = await bob.register({ nome: "Bob", email: "bob@example.test", telefone: "21999990002" });
  const changes = { nome: "Cliente Atualizado", email: "novo@example.test", telefone: "21999990003" };
  assertClientError(await alice.request("/api/perfil", { method: "PUT", json: changes }));
  assertClientError(await alice.request("/api/perfil", {
    method: "PUT", json: { ...changes, senha_atual: "senha-incorreta" },
  }));
  assert.equal((await alice.request("/api/perfil")).data.usuario.email, "cliente@example.test");
  const saved = await alice.request("/api/perfil", {
    method: "PUT", json: { ...changes, senha_atual: PASSWORD, id: bobUser.id, usuario_id: bobUser.id },
  });
  assert.equal(saved.status, 200, saved.body);
  assert.equal(saved.data.usuario.email, changes.email);
  const other = await bob.request("/api/perfil");
  assert.equal(other.data.usuario.email, "bob@example.test");
  const mine = await alice.request(`/api/perfil?usuario_id=${bobUser.id}`);
  assert.equal(mine.data.usuario.email, changes.email);
  await alice.request("/api/sair", { method: "POST" });
  await alice.login(changes.email);
});

test("photo uploads validate content and size, persist privately, and can be removed", async (t) => {
  const sharp = require("sharp");
  const { client } = await fixture(t);
  const user = client();
  await user.register();
  async function upload(content, type, filename) {
    const form = new FormData();
    form.set("foto", new Blob([content], { type }), filename);
    return user.request("/api/perfil/foto", { method: "POST", form });
  }
  assertClientError(await upload("<svg xmlns='http://www.w3.org/2000/svg'></svg>", "image/svg+xml", "foto.svg"));
  assertClientError(await upload("conteudo que nao e uma imagem", "image/png", "foto.png"));
  const oversized = await upload(Buffer.alloc(2 * 1024 * 1024 + 1), "image/png", "grande.png");
  assertClientError(oversized);

  const png = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#003866" } }).png().toBuffer();
  const saved = await upload(png, "image/png", "foto.png");
  assert.ok([200, 201].includes(saved.status), saved.body);
  const photo = await user.request("/api/perfil/foto");
  assert.equal(photo.status, 200);
  assert.match(photo.headers.get("content-type"), /^image\/(jpeg|png|webp)/);
  const metadata = await sharp(photo.buffer).metadata();
  assert.ok(metadata.width > 0 && metadata.height > 0);
  assert.equal((await client().request("/api/perfil/foto")).status, 401);
  const other = client();
  await other.register({ email: "outro@example.test", telefone: "21999990002" });
  assert.equal((await other.request("/api/perfil/foto")).status, 404);
  const removed = await user.request("/api/perfil/foto", { method: "DELETE" });
  assert.equal(removed.status, 200, removed.body);
  assert.equal((await user.request("/api/perfil/foto")).status, 404);
});

test("account lists contain only the customer's actual purchases and contracts", async (t) => {
  const { db, client } = await fixture(t);
  const alice = client();
  const bob = client();
  const aliceUser = await alice.register();
  const bobUser = await bob.register({ email: "bob@example.test", telefone: "21999990002" });
  const empty = await alice.request("/api/conta");
  assert.equal(empty.status, 200, empty.body);
  assert.deepEqual(empty.data.compras, []);
  assert.deepEqual(empty.data.contratos, []);
  assert.deepEqual(empty.data.assinaturas, []);
  assert.deepEqual(empty.data.pagamentos.metodos, []);
  assert.equal(empty.data.pagamentos.configurado, false);

  await db.run("INSERT INTO compras (usuario_id, titulo, valor_centavos) VALUES (?, ?, ?)",
    [aliceUser.id, "Janela do cliente A", 150000]);
  await db.run("INSERT INTO compras (usuario_id, titulo, valor_centavos) VALUES (?, ?, ?)",
    [bobUser.id, "Pedido privado do cliente B", 500000]);
  await db.run("INSERT INTO contratos (usuario_id, titulo, status) VALUES (?, ?, ?)",
    [aliceUser.id, "Instalação do cliente A", "assinado"]);
  await db.run("INSERT INTO contratos (usuario_id, titulo, status) VALUES (?, ?, ?)",
    [bobUser.id, "Contrato privado do cliente B", "pendente"]);

  const account = await alice.request(`/api/conta?usuario_id=${bobUser.id}`);
  assert.equal(account.status, 200, account.body);
  assert.deepEqual(account.data.compras.map((item) => item.titulo), ["Janela do cliente A"]);
  assert.deepEqual(account.data.contratos.map((item) => item.titulo), ["Instalação do cliente A"]);
  assert.equal(account.data.compras[0].valor_centavos, 150000);
  assert.equal(account.data.contratos[0].status, "assinado");
  assert.deepEqual(account.data.assinaturas, []);
  assert.ok(!account.body.includes("privado do cliente B"));
  assert.ok(!account.body.includes("documento_arquivo"));
});

test("payment preferences persist independently and do not invent a card or payment", async (t) => {
  const { client } = await fixture(t);
  const alice = client();
  const bob = client();
  await alice.register();
  await bob.register({ email: "bob@example.test", telefone: "21999990002" });
  const invalid = await alice.request("/api/pagamentos/preferencia", {
    method: "PUT", json: { metodo: "desconhecido" },
  });
  assert.equal(invalid.status, 400, invalid.body);
  const preference = await alice.request("/api/pagamentos/preferencia", {
    method: "PUT", json: { metodo: "pix" },
  });
  assert.equal(preference.status, 200, preference.body);
  assert.equal(preference.data.preferencia, "pix");
  await alice.request("/api/sair", { method: "POST" });
  await alice.login();
  const account = await alice.request("/api/conta");
  assert.equal(account.data.pagamentos.preferencia, "pix");
  assert.deepEqual(account.data.pagamentos.metodos, []);
  assert.deepEqual(account.data.compras, []);
  assert.equal((await bob.request("/api/conta")).data.pagamentos.preferencia, null);
  const unavailable = await alice.request("/api/pagamentos/portal", {
    method: "POST", json: {},
  });
  assert.equal(unavailable.status, 503, unavailable.body);
  assert.equal(typeof unavailable.data.erro, "string");
  assert.equal(unavailable.data.url, undefined);
  const cleared = await alice.request("/api/pagamentos/preferencia", {
    method: "PUT", json: { metodo: null },
  });
  assert.equal(cleared.status, 200, cleared.body);
  assert.equal((await alice.request("/api/conta")).data.pagamentos.preferencia, null);
});

test("contract downloads enforce ownership and reject unsafe stored paths", async (t) => {
  const { dataDir, db, client } = await fixture(t);
  const alice = client();
  const bob = client();
  const aliceUser = await alice.register();
  await bob.register({ email: "bob@example.test", telefone: "21999990002" });
  const directory = path.join(dataDir, "contratos");
  await fs.mkdir(directory, { recursive: true });
  const pdf = Buffer.from("%PDF-1.4\n% isolated download fixture\n%%EOF\n");
  await fs.writeFile(path.join(directory, "contrato-teste.pdf"), pdf);
  const contract = await db.run(
    "INSERT INTO contratos (usuario_id, titulo, documento_arquivo) VALUES (?, ?, ?)",
    [aliceUser.id, "Contrato de teste", "contrato-teste.pdf"],
  );
  const route = `/api/contratos/${contract.lastID}/documento`;
  const own = await alice.request(route);
  assert.equal(own.status, 200, own.body);
  assert.match(own.headers.get("content-type"), /^application\/pdf/);
  assert.match(own.headers.get("content-disposition"), /^attachment;/);
  assert.deepEqual(own.buffer, pdf);
  assert.equal((await bob.request(route)).status, 404);
  assert.equal((await client().request(route)).status, 401);
  await db.run("UPDATE contratos SET documento_arquivo = ? WHERE id = ?", ["../usuarios.db", contract.lastID]);
  assert.equal((await alice.request(route)).status, 404);
});
