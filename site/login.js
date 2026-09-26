const mensagem = document.getElementById('mensagem');

function mostrarMensagem(texto, tipo = "erro") {
  mensagem.textContent = texto;
  mensagem.className = `mensagem ${tipo}`;
}

async function enviar(url, dados) {
  return ContaAPI.request(url, { method: "POST", body: dados });
}

const nextPage = new URLSearchParams(location.search).get("next");
const destino = ({ perfil: "perfil.html", admin: "admin.html" })[nextPage] || "index.html";
let enviando = false;
function ocupado(value) {
  enviando = value;
  document.querySelectorAll('button[type="submit"]').forEach((button) => { button.disabled = value; });
}

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
