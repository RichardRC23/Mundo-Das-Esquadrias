// script.js
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("menu-btn");
  const menu = document.getElementById("menu");

  // Proteção caso o ID não exista
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
