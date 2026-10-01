const mensagem = document.getElementById('mensagem');
const tabs = {
  login: document.getElementById("tab-login"),
  cadastro: document.getElementById("tab-cadastro"),
};
const forms = {
  login: document.getElementById("form-login"),
  cadastro: document.getElementById("form-cadastro"),
};

function abrirAba(nome, focar = true) {
  Object.entries(tabs).forEach(([key, tab]) => {
    const active = key === nome;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    forms[key].classList.toggle("active", active);
    forms[key].hidden = !active;
  });
  mensagem.textContent = "";
  mensagem.className = "mensagem";
  document.querySelector(".auth-content-header h2").textContent = nome === "cadastro" ? "Crie sua conta" : "Acesse sua conta";
  document.querySelector(".auth-content-header p").textContent = nome === "cadastro"
    ? "Cadastre-se gratuitamente para organizar seus projetos."
    : "Entre com seus dados ou crie uma conta gratuitamente.";
  document.title = `${nome === "cadastro" ? "Criar conta" : "Entrar"} | Mundo das Esquadrias`;
  if (focar) forms[nome].querySelector("input")?.focus();
}

Object.entries(tabs).forEach(([name, tab]) => {
  tab.addEventListener("click", () => abrirAba(name));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    abrirAba(name === "login" ? "cadastro" : "login");
    tabs[name === "login" ? "cadastro" : "login"].focus();
  });
});
document.querySelectorAll("[data-open-tab]").forEach((button) => {
  button.addEventListener("click", () => abrirAba(button.dataset.openTab));
});
document.querySelectorAll("[data-password]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.password);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.textContent = show ? "Ocultar" : "Ver";
    button.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
  });
});

document.getElementById("telefone").addEventListener("input", (event) => {
  const digits = event.target.value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) event.target.value = digits ? `(${digits}` : "";
  else if (digits.length <= 6) event.target.value = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  else if (digits.length <= 10) event.target.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  else event.target.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
});

function mostrarMensagem(texto, tipo = "erro") {
  mensagem.textContent = texto;
  mensagem.className = `mensagem ${tipo}`;
}

async function enviar(url, dados) {
  return ContaAPI.request(url, { method: "POST", body: dados });
}

const nextPage = new URLSearchParams(location.search).get("next");
const destino = ({ perfil: "perfil.html", admin: "admin.html", orcamento: "orcamento.html" })[nextPage] || "index.html";
let enviando = false;
function ocupado(value) {
  enviando = value;
  document.querySelectorAll('button[type="submit"]').forEach((button) => { button.disabled = value; });
}

abrirAba(new URLSearchParams(location.search).get("modo") === "cadastro" ? "cadastro" : "login", false);

document.getElementById("form-login").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (enviando) return;
  ocupado(true);

  try {
    await enviar("/api/login", {
      identificador: document.getElementById("identificador").value,
      senha: document.getElementById("senha-login").value,
    });

    mostrarMensagem("Login realizado com sucesso!", "sucesso");
    setTimeout(() => window.location.replace(destino), 500);
  } catch (erro) {
    mostrarMensagem(erro.message);
    ocupado(false);
  }
});

document.getElementById("form-cadastro").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (enviando) return;
  ocupado(true);

  try {
    await enviar("/api/cadastro", {
      nome: document.getElementById("nome").value,
      email: document.getElementById("email").value,
      telefone: document.getElementById("telefone").value,
      senha: document.getElementById("senha-cadastro").value,
    });

    mostrarMensagem("Cadastro realizado com sucesso!", "sucesso");
    setTimeout(() => window.location.replace(destino), 500);
  } catch (erro) {
    mostrarMensagem(erro.message);
    ocupado(false);
  }
});
