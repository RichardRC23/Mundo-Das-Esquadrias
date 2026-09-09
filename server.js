require("dotenv").config();

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, "data");

if (!process.env.SESSION_SECRET) {
  console.error("Crie o arquivo .env com a chave SESSION_SECRET.");
  process.exit(1);
}

fs.mkdirSync(dataDir, { recursive: true });

const db = new sqlite3.Database(path.join(dataDir, "usuarios.db"));

db.run(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE,
    telefone TEXT UNIQUE,
    senha_hash TEXT NOT NULL,
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(helmet());
app.use(express.json());
app.use(express.static(path.join(__dirname, "site")));

app.use(
  session({
    store: new SQLiteStore({
      db: "sessoes.db",
      dir: dataDir,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: "Muitas tentativas. Aguarde 15 minutos." },
});

function normalizarTelefone(telefone) {
  return telefone.replace(/\D/g, "");
}

app.post("/api/cadastro", limiteLogin, async (req, res) => {
  const nome = req.body.nome?.trim();
  const email = req.body.email?.trim().toLowerCase() || null;
  const telefone = req.body.telefone
    ? normalizarTelefone(req.body.telefone)
    : null;
  const senha = req.body.senha;

  if (!nome || !senha || (!email && !telefone)) {
    return res.status(400).json({
      erro: "Informe nome, senha e pelo menos e-mail ou telefone.",
    });
  }

  if (senha.length < 8) {
    return res.status(400).json({
      erro: "A senha deve ter pelo menos 8 caracteres.",
    });
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ erro: "E-mail inválido." });
  }

  if (telefone && telefone.length < 10) {
    return res.status(400).json({ erro: "Telefone inválido." });
  }

  try {
    const senhaHash = await bcrypt.hash(senha, 12);

    db.run(
      `INSERT INTO usuarios (nome, email, telefone, senha_hash)
       VALUES (?, ?, ?, ?)`,
      [nome, email, telefone, senhaHash],
      function (erro) {
        if (erro) {
          if (erro.code === "SQLITE_CONSTRAINT") {
            return res.status(409).json({
              erro: "Este e-mail ou telefone já está cadastrado.",
            });
          }

          return res.status(500).json({ erro: "Não foi possível cadastrar." });
        }

        req.session.usuario = {
          id: this.lastID,
          nome,
        };

        res.status(201).json({
          mensagem: "Cadastro realizado com sucesso.",
          usuario: req.session.usuario,
        });
      }
    );
  } catch {
    res.status(500).json({ erro: "Erro ao proteger a senha." });
  }
});

app.post("/api/login", limiteLogin, (req, res) => {
  const identificador = req.body.identificador?.trim();
  const senha = req.body.senha;

  if (!identificador || !senha) {
    return res.status(400).json({
      erro: "Informe e-mail ou telefone, além da senha.",
    });
  }

  const email = identificador.includes("@")
    ? identificador.toLowerCase()
    : null;

  const telefone = email ? null : normalizarTelefone(identificador);

  db.get(
    `SELECT * FROM usuarios WHERE email = ? OR telefone = ?`,
    [email, telefone],
    async (erro, usuario) => {
      if (erro) {
        return res.status(500).json({ erro: "Erro ao entrar." });
      }

      if (!usuario || !(await bcrypt.compare(senha, usuario.senha_hash))) {
        return res.status(401).json({
          erro: "E-mail/telefone ou senha incorretos.",
        });
      }

      req.session.usuario = {
        id: usuario.id,
        nome: usuario.nome,
      };

      res.json({
        mensagem: "Login realizado com sucesso.",
        usuario: req.session.usuario,
      });
    }
  );
});

app.get("/api/usuario", (req, res) => {
  if (!req.session.usuario) {
    return res.status(401).json({ erro: "Usuário não autenticado." });
  }

  res.json({ usuario: req.session.usuario });
});

app.post("/api/sair", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ mensagem: "Sessão encerrada." });
  });
});

app.listen(PORT, () => {
  console.log(`Site aberto em http://localhost:${PORT}`);
});