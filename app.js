require("dotenv").config();

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const session = require("express-session");
const SQLiteStore = require("./lib/sqlite-session-store")(session);
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const sharp = require("sharp");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { initPayments } = require("./lib/payments");
const { initOrcamentos } = require("./lib/orcamentos");
const { initAdmin } = require("./lib/admin");

const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value) => typeof value === "string" ? value.trim() : "";

function dadosPerfil(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    ["nome", "email", "telefone"].some((key) => body[key] != null && typeof body[key] !== "string")) {
    throw fail(400, "Preencha nome, e-mail e telefone com texto válido.");
  }
  const nome = text(body.nome);
  const email = text(body.email).toLowerCase() || null;
  const original = text(body.telefone);
  let telefone = original.replace(/\D/g, "") || null;
  if (telefone?.startsWith("55") && [12, 13].includes(telefone.length)) telefone = telefone.slice(2);
  if (!nome || nome.length > 120 || (!email && !telefone)) {
    throw fail(400, "Informe um nome de até 120 caracteres e pelo menos e-mail ou telefone.");
  }
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw fail(400, "E-mail inválido.");
  if (original && (!telefone || !/^\d{10,11}$/.test(telefone))) throw fail(400, "Informe um telefone brasileiro com DDD.");
  return { nome, email, telefone };
}

function validarSenha(senha) {
  if (typeof senha !== "string" || senha.length < 8 || Buffer.byteLength(senha, "utf8") > 72) {
    throw fail(400, "A senha deve ter pelo menos 8 caracteres e no máximo 72 bytes.");
  }
}

async function createApp(options = {}) {
  const dataDir = path.resolve(options.dataDir || process.env.DATA_DIR || path.join(__dirname, "data"));
  const sessionSecret = options.sessionSecret || process.env.SESSION_SECRET;
  if (!sessionSecret) throw new Error("Crie o arquivo .env com SESSION_SECRET. Consulte .env.example.");
  const production = process.env.NODE_ENV === "production";
  const origin = new URL(options.origin || process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 3000}`).origin;
  if (production && !origin.startsWith("https://")) throw new Error("APP_ORIGIN deve usar HTTPS em produção.");
  fs.mkdirSync(dataDir, { recursive: true });
  const raw = await new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(path.join(dataDir, "usuarios.db"), (error) => error ? reject(error) : resolve(connection));
  });
  raw.configure("busyTimeout", 5000);
  const db = {
    get: (sql, params = []) => new Promise((resolve, reject) => raw.get(sql, params, (error, row) => error ? reject(error) : resolve(row))),
    all: (sql, params = []) => new Promise((resolve, reject) => raw.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows))),
    run: (sql, params = []) => new Promise((resolve, reject) => raw.run(sql, params, function (error) {
      if (error) reject(error); else resolve({ lastID: this.lastID, changes: this.changes });
    })),
  };
  await db.run("PRAGMA foreign_keys = ON");
  await db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT UNIQUE,
    telefone TEXT UNIQUE, senha_hash TEXT NOT NULL, criado_em TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  const columns = await db.all("PRAGMA table_info(usuarios)");
  for (const [name, type] of [["foto_blob", "BLOB"], ["foto_versao", "TEXT"], ["preferencia_pagamento", "TEXT"], ["papel", "TEXT NOT NULL DEFAULT 'cliente'"]]) {
    if (!columns.some((column) => column.name === name)) await db.run(`ALTER TABLE usuarios ADD COLUMN ${name} ${type}`);
  }

  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: { directives: {
    "upgrade-insecure-requests": production ? [] : null,
  } } }));
  const allowedOrigins = new Set([origin]);
  if (!production) {
    allowedOrigins.add("http://localhost:5500");
    allowedOrigins.add("http://127.0.0.1:5500");
    const port = new URL(origin).port || "3000";
    allowedOrigins.add(`http://localhost:${port}`);
    allowedOrigins.add(`http://127.0.0.1:${port}`);
  }
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const requestOrigin = req.get("origin");
    if (requestOrigin && !allowedOrigins.has(requestOrigin)) return res.status(403).json({ erro: "Origem não permitida." });
    if (requestOrigin) {
      res.set("Access-Control-Allow-Origin", requestOrigin);
      res.set("Access-Control-Allow-Credentials", "true");
      res.vary("Origin");
    }
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
      return res.sendStatus(204);
    }
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  const store = new SQLiteStore({ db: "sessoes.db", dir: dataDir, concurrentDB: false });
  app.use(session({
    store, secret: sessionSecret, resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", secure: production, maxAge: 1000 * 60 * 60 * 24 * 7 },
  }));
  const saveSession = (req) => new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
  app.get("/api/csrf", async (req, res) => {
    req.session.csrf ||= crypto.randomBytes(32).toString("hex");
    await saveSession(req);
    res.json({ token: req.session.csrf });
  });
  app.use("/api", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const actual = Buffer.from(req.get("X-CSRF-Token") || "");
    const expected = Buffer.from(req.session.csrf || "");
    if (!expected.length || actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      return res.status(403).json({ erro: "Atualize a página e tente novamente.", codigo: "CSRF_INVALIDO" });
    }
    next();
  });
  const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false,
    message: { erro: "Muitas tentativas. Aguarde 15 minutos." } });
  const changesLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false,
    message: { erro: "Muitas alterações. Aguarde alguns minutos." } });
  const exigirLogin = async (req, res, next) => {
    if (!req.session.usuario || !await db.get("SELECT id FROM usuarios WHERE id = ?", [req.session.usuario.id])) {
      return res.status(401).json({ erro: "Faça login para acessar sua conta." });
    }
    next();
  };
  const exigirAdmin = async (req, res, next) => {
    if (!req.session.usuario) return res.status(401).json({ erro: "Faça login para acessar o painel administrativo." });
    const user = await db.get("SELECT papel FROM usuarios WHERE id = ?", [req.session.usuario.id]);
    if (user?.papel !== "admin") return res.status(403).json({ erro: "Esta área é exclusiva para administradores." });
    next();
  };
  const perfil = async (id) => {
    const user = await db.get("SELECT id,nome,email,telefone,criado_em,foto_versao,preferencia_pagamento,papel FROM usuarios WHERE id = ?", [id]);
    if (!user) throw fail(401, "Faça login para acessar sua conta.");
    user.foto_url = user.foto_versao ? `/api/perfil/foto?v=${encodeURIComponent(user.foto_versao)}` : null;
    delete user.foto_versao;
    return user;
  };
  async function iniciarSessao(req, usuario) {
    await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    req.session.usuario = { id: usuario.id, nome: usuario.nome };
    req.session.csrf = crypto.randomBytes(32).toString("hex");
    await saveSession(req);
  }
  app.post("/api/cadastro", authLimit, async (req, res) => {
    const { nome, email, telefone } = dadosPerfil(req.body);
    validarSenha(req.body.senha);
    const hash = await bcrypt.hash(req.body.senha, 12);
    const result = await db.run("INSERT INTO usuarios (nome,email,telefone,senha_hash) VALUES (?,?,?,?)", [nome, email, telefone, hash]);
    await iniciarSessao(req, { id: result.lastID, nome });
    res.status(201).json({ mensagem: "Conta criada com sucesso.", usuario: req.session.usuario });
  });
  app.post("/api/login", authLimit, async (req, res) => {
    const identifier = text(req.body?.identificador);
    const password = req.body?.senha;
    if (!identifier || identifier.length > 254 || typeof password !== "string" || !password || Buffer.byteLength(password) > 72) {
      throw fail(400, "Informe e-mail ou telefone e uma senha válida.");
    }
    const email = identifier.includes("@") ? identifier.toLowerCase() : null;
    let phone = email ? null : identifier.replace(/\D/g, "");
    if (phone?.startsWith("55") && [12, 13].includes(phone.length)) phone = phone.slice(2);
    const user = await db.get("SELECT id,nome,senha_hash FROM usuarios WHERE email = ? OR telefone = ?", [email, phone]);
    if (!user || !await bcrypt.compare(password, user.senha_hash)) throw fail(401, "E-mail/telefone ou senha incorretos.");
    await iniciarSessao(req, user);
    res.json({ mensagem: "Login realizado com sucesso.", usuario: req.session.usuario });
  });
  app.get("/api/usuario", exigirLogin, async (req, res) => {
    const user = await perfil(req.session.usuario.id);
    res.json({ usuario: { id: user.id, nome: user.nome, foto_url: user.foto_url, papel: user.papel } });
  });
  app.get("/api/perfil", exigirLogin, async (req, res) => res.json({ usuario: await perfil(req.session.usuario.id) }));
  app.put("/api/perfil", exigirLogin, changesLimit, async (req, res) => {
    const { nome, email, telefone } = dadosPerfil(req.body);
    const user = await db.get("SELECT email,telefone,senha_hash FROM usuarios WHERE id = ?", [req.session.usuario.id]);
    if (email !== user.email || telefone !== user.telefone) {
      const senha = req.body.senha_atual;
      if (typeof senha !== "string" || Buffer.byteLength(senha) > 72 || !await bcrypt.compare(senha, user.senha_hash)) {
        throw fail(400, "Confirme sua senha atual para alterar e-mail ou telefone.");
      }
    }
    await db.run("UPDATE usuarios SET nome = ?,email = ?,telefone = ? WHERE id = ?", [nome, email, telefone, req.session.usuario.id]);
    req.session.usuario.nome = nome;
    await saveSession(req);
    res.json({ mensagem: "Perfil atualizado com sucesso.", usuario: await perfil(req.session.usuario.id) });
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 2 } });
  app.get("/api/perfil/foto", exigirLogin, async (req, res) => {
    const user = await db.get("SELECT foto_blob FROM usuarios WHERE id = ?", [req.session.usuario.id]);
    if (!user?.foto_blob) return res.status(404).json({ erro: "Você ainda não tem uma foto de perfil." });
    res.set("Cross-Origin-Resource-Policy", "same-site").type("image/webp").send(user.foto_blob);
  });
  app.post("/api/perfil/foto", exigirLogin, changesLimit, upload.single("foto"), async (req, res) => {
    if (!req.file) throw fail(400, "Escolha uma foto JPG, PNG ou WebP de até 2 MB.");
    let image;
    try {
      const input = sharp(req.file.buffer, { limitInputPixels: 20000000, failOn: "warning" });
      const metadata = await input.metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error("format");
      image = await input.rotate().resize(512, 512, { fit: "cover", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    } catch {
      throw fail(400, "A imagem é inválida. Envie JPG, PNG ou WebP sem animação, com até 20 megapixels.");
    }
    const version = crypto.randomUUID();
    await db.run("UPDATE usuarios SET foto_blob = ?,foto_versao = ? WHERE id = ?", [image, version, req.session.usuario.id]);
    res.status(201).json({ mensagem: "Foto atualizada.", foto_url: `/api/perfil/foto?v=${version}` });
  });
  app.delete("/api/perfil/foto", exigirLogin, changesLimit, async (req, res) => {
    await db.run("UPDATE usuarios SET foto_blob = NULL,foto_versao = NULL WHERE id = ?", [req.session.usuario.id]);
    res.json({ mensagem: "Foto removida.", foto_url: null });
  });
  app.use("/api/pagamentos", changesLimit);
  await initPayments({ app, db, exigirLogin, origin, dataDir });
  await initOrcamentos({ app, db, exigirLogin, changesLimit });
  await initAdmin({ app, db, exigirAdmin, changesLimit });
  app.post("/api/sair", async (req, res) => {
    await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
    res.clearCookie("connect.sid", { httpOnly: true, sameSite: "lax", secure: production, path: "/" });
    res.json({ mensagem: "Sessão encerrada." });
  });
  app.use("/api", (_req, res) => res.status(404).json({ erro: "Recurso não encontrado." }));
  app.use(express.static(path.join(__dirname, "site"), { dotfiles: "deny" }));
  app.use("/img", express.static(path.join(__dirname, "img"), { dotfiles: "deny", index: false }));
  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) return res.status(400).json({ erro: "Envie apenas uma foto de até 2 MB." });
    if (error.code === "SQLITE_CONSTRAINT") return res.status(409).json({ erro: "Este e-mail ou telefone já está cadastrado." });
    const status = error.status >= 400 && error.status < 600 ? error.status : 500;
    const message = status === 500 ? "Não foi possível concluir. Tente novamente." : error.message;
    if (status === 500) console.error("Falha na solicitação:", error.code || error.name);
    res.status(status).json({ erro: message });
  });
  return { app, db, close: async () => {
    await new Promise((resolve, reject) => store.close((error) => error ? reject(error) : resolve()));
    await new Promise((resolve, reject) => raw.close((error) => error ? reject(error) : resolve()));
  } };
}

module.exports = { createApp };
