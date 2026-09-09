const mensagem = document.getElementById('mensagem');

function mostrarMensagem(texto, tipo = "error") {
  mensagem.textContent = texto;
  mensagem.className = `mensagem ${tipo}`;
}

async function enviar(url, dados) {
  const resposta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });

  const resultado = await resposta.json();

  if (!resposta.ok) {
    throw new Error(resultado.erro || "Ocorreu um erro.");
  }

  return resultado;
}

document.getElementById("form-login").addEventListener("submit", async (evento) => {
  evento.preventDefault();

  try {
    await enviar("/api/login", {
      identificador: document.getElementById("identificador").value,
      senha: document.getElementById("senha-login").value,
    });

    mostrarMensagem("Login realizado com sucesso!", "sucesso");
    setTimeout(() => (window.location.href = "index.html"), 800);
  } catch (erro) {
    mostrarMensagem(erro.message);
  }
});

document.getElementById("form-cadastro").addEventListener("submit", async (evento) => {
  evento.preventDefault();

  try {
    await enviar("/api/cadastro", {
      nome: document.getElementById("nome").value,
      email: document.getElementById("email").value,
      telefone: document.getElementById("telefone").value,
      senha: document.getElementById("senha-cadastro").value,
    });

    mostrarMensagem("Cadastro realizado com sucesso!", "sucesso");
    setTimeout(() => (window.location.href = "index.html"), 800);
  } catch (erro) {
    mostrarMensagem(erro.message);
  }
});