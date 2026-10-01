// script.js
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("menu-btn");
  const menu = document.getElementById("menu");

  async function atualizarConta() {
    const link = document.getElementById("link-conta");
    if (!link) return;
    const linksOrcamento = document.querySelectorAll("[data-orcamento-link]");
    link.textContent = "Logar/Cadastrar";
    link.href = "login.html";
    link.removeAttribute("aria-label");
    link.removeAttribute("title");
    link.classList.remove("conta-logada");
    link.classList.remove("account-avatar", "avatar-cor-0", "avatar-cor-1", "avatar-cor-2", "avatar-cor-3");
    linksOrcamento.forEach((item) => { item.href = "login.html?next=orcamento"; });
    try {
      const { usuario } = await ContaAPI.request("/api/usuario");
      if (usuario) {
        link.href = "perfil.html";
        link.setAttribute("aria-label", "Abrir minha conta");
        link.title = usuario.nome ? `Conta de ${usuario.nome}` : "Conta do cliente";
        link.classList.add("conta-logada", "account-avatar", `avatar-cor-${Number(usuario.id) % 4}`);
        const bonequinho = () => {
          link.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="18" r="8"></circle>
            <path d="M10 40c1.5-8 6.3-12 14-12s12.5 4 14 12"></path>
          </svg>`;
        };
        if (usuario.foto_url?.startsWith("/api/perfil/foto")) {
          const foto = document.createElement("img");
          foto.src = ContaAPI.url(usuario.foto_url);
          foto.alt = "";
          foto.width = 44;
          foto.height = 44;
          foto.addEventListener("error", bonequinho, { once: true });
          link.replaceChildren(foto);
        } else bonequinho();
        linksOrcamento.forEach((item) => { item.href = "orcamento.html"; });
      }
    } catch { /* Logged-out visitors keep the public login link. */ }
  }
  atualizarConta();
  window.addEventListener("pageshow", atualizarConta);
  window.addEventListener("focus", atualizarConta);
  if (!btn || !menu) return;

  function fecharMenu() {
    menu.classList.remove("show");
    btn.classList.remove("active");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Abrir menu");
  }

  btn.addEventListener("click", () => {
    const aberto = menu.classList.toggle("show");
    btn.classList.toggle("active", aberto);
    btn.setAttribute("aria-expanded", String(aberto));
    btn.setAttribute("aria-label", aberto ? "Fechar menu" : "Abrir menu");
  });

  // Fecha o menu ao clicar em um link (útil em dispositivos móveis)
  menu.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      fecharMenu();
    });
  });

  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target) && !btn.contains(event.target)) fecharMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.classList.contains("show")) {
      fecharMenu();
      btn.focus();
    }
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 960) fecharMenu();
  });

  const carrossel = document.getElementById("carrossel-trabalhos");
  if (!carrossel) return;

  const slides = [...carrossel.querySelectorAll(".carrossel-slide")];
  const indicadores = [...carrossel.querySelectorAll(".carrossel-indicadores button")];
  const status = document.getElementById("carrossel-status");
  const reduzirMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let indiceAtual = 0;
  let temporizador;

  function mostrarSlide(novoIndice, anunciar = true) {
    indiceAtual = (novoIndice + slides.length) % slides.length;
    slides.forEach((slide, indice) => {
      const ativo = indice === indiceAtual;
      slide.classList.toggle("ativo", ativo);
      slide.setAttribute("aria-hidden", String(!ativo));
    });
    indicadores.forEach((indicador, indice) => {
      const ativo = indice === indiceAtual;
      indicador.classList.toggle("ativo", ativo);
      if (ativo) indicador.setAttribute("aria-current", "true");
      else indicador.removeAttribute("aria-current");
    });
    if (anunciar && status) {
      status.textContent = `${slides[indiceAtual].dataset.titulo}, imagem ${indiceAtual + 1} de ${slides.length}`;
    }
  }

  function pararRotacao() {
    window.clearInterval(temporizador);
  }

  function iniciarRotacao() {
    pararRotacao();
    if (!reduzirMovimento) {
      temporizador = window.setInterval(() => mostrarSlide(indiceAtual + 1, false), 6500);
    }
  }

  carrossel.querySelector(".anterior").addEventListener("click", () => {
    mostrarSlide(indiceAtual - 1);
    iniciarRotacao();
  });
  carrossel.querySelector(".proximo").addEventListener("click", () => {
    mostrarSlide(indiceAtual + 1);
    iniciarRotacao();
  });
  indicadores.forEach((indicador, indice) => {
    indicador.addEventListener("click", () => {
      mostrarSlide(indice);
      iniciarRotacao();
    });
  });
  carrossel.addEventListener("mouseenter", pararRotacao);
  carrossel.addEventListener("mouseleave", iniciarRotacao);
  carrossel.addEventListener("focusin", pararRotacao);
  carrossel.addEventListener("focusout", iniciarRotacao);
  carrossel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") mostrarSlide(indiceAtual - 1);
    if (event.key === "ArrowRight") mostrarSlide(indiceAtual + 1);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pararRotacao();
    else iniciarRotacao();
  });
  iniciarRotacao();
});
