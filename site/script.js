// script.js
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("menu-btn");
  const menu = document.getElementById("menu");

  async function atualizarConta() {
    const link = document.getElementById("link-conta");
    if (!link) return;
    link.textContent = "Logar/Cadastrar";
    link.href = "login.html";
    link.classList.remove("conta-logada");
    try {
      const { usuario } = await ContaAPI.request("/api/usuario");
      if (usuario) {
        link.textContent = "Minha conta";
        link.href = "perfil.html";
        link.classList.add("conta-logada");
      }
    } catch { /* Logged-out visitors keep the public login link. */ }
  }
  atualizarConta();
  window.addEventListener("pageshow", atualizarConta);
  window.addEventListener("focus", atualizarConta);
  if (!btn || !menu) return;

  btn.addEventListener("click", () => {
    menu.classList.toggle("show");
    btn.classList.toggle("active");
  });

  // Fecha o menu ao clicar em um link (útil em dispositivos móveis)
  menu.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      menu.classList.remove("show");
      btn.classList.remove("active");
    });
  });
});
