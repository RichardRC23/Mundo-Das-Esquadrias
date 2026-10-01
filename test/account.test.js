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
  for (const route of ["/api/usuario", "/api/perfil", "/api/conta", "/api/perfil/foto", "/api/orcamentos"]) {
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
  const previewForm = new FormData();
  previewForm.set("foto", new Blob([png], { type: "image/png" }), "foto.png");
  const prepared = await user.request("/api/perfil/foto/preparar", { method: "POST", form: previewForm });
  assert.equal(prepared.status, 200, prepared.body);
  assert.match(prepared.headers.get("content-type"), /^image\/webp/);
  assert.equal((await user.request("/api/perfil/foto")).status, 404, "Preparing a crop preview must not save the photo");
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

test("quote requests validate measurements, generate protocols, and stay isolated by account", async (t) => {
  const { db, client } = await fixture(t);
  const item = {
    categoria: "janela", material: "aluminio_vidro", modelo: "De correr",
    linha_aluminio: "Suprema", cor: "Preto", tipo_vidro: "Incolor",
    composicao_vidro: "Temperado", espessura_vidro: "8 mm",
    largura_cm: 120, altura_cm: 100, quantidade: 2, ambiente: "Sala", detalhes: "",
  };
  const contact = {
    nome: "Visitante", telefone: "21999990009", email: "visitante@example.test",
    cidade: "Rio de Janeiro", bairro: "Centro", instalacao: true, itens: [item],
  };

  const visitor = client();
  await visitor.csrf();
  assert.equal((await visitor.request("/api/orcamentos", { method: "POST", json: contact })).status, 401);
  assert.equal((await visitor.request("/api/orcamentos/acesso")).status, 401);

  const alice = client();
  const bob = client();
  const aliceUser = await alice.register();
  await bob.register({ email: "bob@example.test", telefone: "21999990002" });
  const initialAccess = await alice.request("/api/orcamentos/acesso");
  assert.equal(initialAccess.data.acesso.restantes, 1);
  const invalid = await alice.request("/api/orcamentos", {
    method: "POST", json: { ...contact, itens: [{ ...item, largura_cm: 0 }] },
  });
  assert.equal(invalid.status, 400, invalid.body);
  const ownQuote = await alice.request("/api/orcamentos", {
    method: "POST", json: { ...contact, nome: "Cliente de Teste" },
  });
  assert.equal(ownQuote.status, 201, ownQuote.body);
  assert.match(ownQuote.data.orcamento.codigo, /^MDE-\d{4}-\d{6}$/);
  const exhausted = await alice.request("/api/orcamentos/acesso");
  assert.equal(exhausted.data.acesso.restantes, 0);
  assert.equal(exhausted.data.acesso.opcoes.individual.preco_centavos, 599);
  assert.equal(exhausted.data.acesso.opcoes.pacote10.preco_centavos, 990);
  assert.equal((await alice.request("/api/orcamentos", { method: "POST", json: contact })).status, 402);
  const mine = await alice.request("/api/orcamentos");
  assert.equal(mine.status, 200, mine.body);
  assert.equal(mine.data.orcamentos.length, 1);
  assert.equal(mine.data.orcamentos[0].itens[0].modelo, "De correr");
  assert.deepEqual((await bob.request("/api/orcamentos")).data.orcamentos, []);
  const quoteRoute = `/api/orcamentos/${ownQuote.data.orcamento.codigo}`;
  assert.equal((await bob.request(quoteRoute, { method: "DELETE" })).status, 404);
  const removed = await alice.request(quoteRoute, { method: "DELETE" });
  assert.equal(removed.status, 200, removed.body);
  assert.deepEqual((await alice.request("/api/orcamentos")).data.orcamentos, []);
  assert.equal((await alice.request("/api/orcamentos/acesso")).data.acesso.restantes, 0,
    "Removing a quote must not restore a used credit");
  const stored = await db.get("SELECT usuario_id, itens_json FROM orcamentos WHERE codigo = ?", [ownQuote.data.orcamento.codigo]);
  assert.equal(stored.usuario_id, aliceUser.id);
  assert.equal(JSON.parse(stored.itens_json)[0].quantidade, 2);
});

test("proposal revisions and customer decisions are private, atomic and preserve accepted terms", async (t) => {
  const { db, client } = await fixture(t);
  const admin = client(), alice = client(), bob = client(), visitor = client();
  const adminUser = await admin.register({ email: "propostas-admin@example.test", telefone: "21999990010" });
  await db.run("UPDATE usuarios SET papel='admin' WHERE id=?", [adminUser.id]);
  await alice.register();
  await bob.register({ email: "bob@example.test", telefone: "21999990002" });
  const request = { nome: "Alice", telefone: "21999990001", cidade: "Rio", itens: [{ categoria: "janela", modelo: "De correr", material: "vidro", largura_cm: 120, altura_cm: 100, quantidade: 1 }] };
  const created = await alice.request("/api/orcamentos", { method: "POST", json: request });
  const code = created.data.orcamento.codigo;
  const row = await db.get("SELECT id FROM orcamentos WHERE codigo=?", [code]);
  const route = `/api/admin/orcamentos/${row.id}/proposta`;
  const responseRoute = `/api/orcamentos/${code}/resposta`;
  const proposal = { versao: 0, valor_centavos: 250000, prazo: "15 dias úteis após medição", observacoes: "Vidro e instalação incluídos" };
  assert.equal((await alice.request(route, { method: "POST", json: proposal })).status, 403);
  assert.equal((await admin.request(route, { method: "POST", json: proposal, csrf: false })).status, 403);
  for (const value of [0, -1, 1.5, "250000", null, true]) {
    assert.equal((await admin.request(route, { method: "POST", json: { ...proposal, valor_centavos: value } })).status, 400);
  }
  assert.equal((await admin.request(route, { method: "POST", json: { ...proposal, prazo: "" } })).status, 400);
  assert.equal((await admin.request(route, { method: "POST", json: proposal })).status, 201);
  let own = (await alice.request("/api/orcamentos")).data.orcamentos[0];
  assert.equal(own.propostas[0].valor_centavos, 250000);
  assert.equal(own.proposta_versao, 1);
  assert.deepEqual((await bob.request("/api/orcamentos")).data.orcamentos, []);
  assert.equal((await bob.request(responseRoute, { method: "POST", json: { acao: "aceitar", versao: 1 } })).status, 404);
  assert.equal((await alice.request(responseRoute, { method: "POST", json: { acao: "aceitar", versao: 1 }, csrf: false })).status, 403);
  assert.equal((await alice.request(responseRoute, { method: "POST", json: { acao: "ajustes", versao: 1, mensagem: "" } })).status, 400);
  assert.equal((await alice.request(responseRoute, { method: "POST", json: { acao: "ajustes", versao: 1, mensagem: "Preciso de prazo menor" } })).status, 200);
  assert.equal((await admin.request(route, { method: "POST", json: { ...proposal, versao: 1 } })).status, 409);
  assert.equal((await admin.request(route, { method: "POST", json: { ...proposal, versao: 2, prazo: "10 dias úteis após medição" } })).status, 201);
  assert.equal((await alice.request(responseRoute, { method: "POST", json: { acao: "aceitar", versao: 1 } })).status, 409);
  // Simultaneous decisions can never both win.
  const results = await Promise.all(["aceitar", "ajustes"].map((acao) => alice.request(responseRoute, {
    method: "POST", json: { acao, versao: 3, mensagem: "Outro prazo" },
  })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  own = (await alice.request("/api/orcamentos")).data.orcamentos[0];
  if (own.propostas.at(-1).situacao === "ajustes") {
    await admin.request(route, { method: "POST", json: { ...proposal, versao: 4 } });
    assert.equal((await alice.request(responseRoute, { method: "POST", json: { acao: "aceitar", versao: 5 } })).status, 200);
  }
  own = (await alice.request("/api/orcamentos")).data.orcamentos[0];
  assert.equal(own.status, "aprovado");
  assert.equal(own.propostas[0].resposta, "Preciso de prazo menor");
  assert.equal(own.propostas.at(-1).situacao, "aceita");
  assert.equal((await admin.request(route, { method: "POST", json: { ...proposal, versao: own.proposta_versao } })).status, 409);
  assert.equal((await admin.request(`/api/admin/orcamentos/${row.id}/status`, { method: "PUT", json: { status: "em_analise" } })).status, 409);
  await visitor.csrf();
  const anonymous = await visitor.request("/api/orcamentos", { method: "POST", json: request });
  assert.equal(anonymous.status, 401);
});

test("only administrators manage quotes and real price rules produce customer estimates", async (t) => {
  const { db, client } = await fixture(t);
  const admin = client();
  const customer = client();
  const adminUser = await admin.register({ email: "admin@example.test", telefone: "21999990005" });
  const denied = await admin.request("/api/admin/resumo");
  assert.equal(denied.status, 403, denied.body);
  await db.run("UPDATE usuarios SET papel = 'admin' WHERE id = ?", [adminUser.id]);
  assert.equal((await admin.request("/api/admin/resumo")).status, 200);

  const price = await admin.request("/api/admin/precos", {
    method: "POST",
    json: {
      categoria: "janela", modelo: "De correr", descricao: "Tabela real de teste",
      preco_m2_centavos: 100000, preco_minimo_centavos: 80000,
      instalacao_centavos: 20000, ativo: true,
    },
  });
  assert.equal(price.status, 201, price.body);
  assert.equal((await admin.request("/api/admin/precos", {
    method: "POST",
    json: { categoria: "janela", modelo: "De correr", preco_m2_centavos: 100000 },
  })).status, 409);
  const publicCatalog = await client().request("/api/catalogo/precos");
  assert.equal(publicCatalog.status, 200, publicCatalog.body);
  assert.equal(publicCatalog.data.precos.length, 1);

  await customer.register({ email: "orcamento@example.test", telefone: "21999990006" });
  const created = await customer.request("/api/orcamentos", {
    method: "POST",
    json: {
      nome: "Cliente Orçamento", telefone: "21999990006", cidade: "Rio de Janeiro", instalacao: true,
      itens: [{
        categoria: "janela", material: "aluminio_vidro", modelo: "De correr",
        largura_cm: 120, altura_cm: 100, quantidade: 2,
      }],
    },
  });
  assert.equal(created.status, 201, created.body);
  assert.equal(created.data.orcamento.estimativa_centavos, 280000);
  const own = await customer.request("/api/orcamentos");
  assert.equal(own.data.orcamentos[0].estimativa_centavos, 280000);

  const adminQuotes = await admin.request("/api/admin/orcamentos");
  assert.equal(adminQuotes.status, 200, adminQuotes.body);
  assert.equal(adminQuotes.data.orcamentos[0].telefone, "21999990006");
  const quoteId = adminQuotes.data.orcamentos[0].id;
  const updated = await admin.request(`/api/admin/orcamentos/${quoteId}/status`, {
    method: "PUT", json: { status: "aprovado" },
  });
  assert.equal(updated.status, 200, updated.body);
  assert.equal((await customer.request("/api/orcamentos")).data.orcamentos[0].status, "aprovado");
});
