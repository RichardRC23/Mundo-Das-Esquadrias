(() => {
  "use strict";

  const storageKey = "mde-acessibilidade-v1";
  const defaults = Object.freeze({
    font: 0, contrast: false, grayscale: false, readable: false,
    links: false, spacing: false, motion: false, focus: true,
  });
  let settings = { ...defaults };
  let speaking = false;
  let lastFocus = null;

  try {
    settings = { ...defaults, ...JSON.parse(localStorage.getItem(storageKey) || "{}") };
  } catch { settings = { ...defaults }; }

  function apply() {
    const root = document.documentElement;
    root.dataset.a11yFont = String(Math.min(3, Math.max(0, Number(settings.font) || 0)));
    for (const key of ["contrast", "grayscale", "readable", "links", "spacing", "motion", "focus"]) {
      if (settings[key]) root.setAttribute(`data-a11y-${key}`, "");
      else root.removeAttribute(`data-a11y-${key}`);
    }
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Preferences remain active for this page. */ }
  }

  apply();

  function init() {
    const main = document.querySelector("main");
    if (main) {
      main.id ||= "conteudo-principal";
      if (!main.hasAttribute("tabindex")) main.tabIndex = -1;
      const skip = document.createElement("a");
      skip.className = "a11y-skip-link";
      skip.href = `#${main.id}`;
      skip.textContent = "Pular para o conteúdo principal";
      document.body.prepend(skip);
    }

    const root = document.createElement("div");
    root.className = "a11y-root";
    root.innerHTML = `
      <section class="a11y-panel" id="a11y-panel" role="dialog" aria-modal="false" aria-labelledby="a11y-title" hidden>
        <div class="a11y-heading">
          <div><h2 id="a11y-title" tabindex="-1">Acessibilidade</h2><p>Ajuste a visualização conforme sua necessidade.</p></div>
          <button class="a11y-close" type="button" aria-label="Fechar painel">×</button>
        </div>
        <div class="a11y-font-controls" aria-label="Tamanho do texto">
          <button type="button" data-font="down" aria-label="Diminuir texto">A−</button>
          <span class="a11y-font-value" aria-live="polite">Texto padrão</span>
          <button type="button" data-font="up" aria-label="Aumentar texto">A+</button>
        </div>
        <div class="a11y-options">
          <button class="a11y-option" type="button" data-setting="contrast">Alto contraste</button>
          <button class="a11y-option" type="button" data-setting="grayscale">Tons de cinza</button>
          <button class="a11y-option" type="button" data-setting="readable">Fonte legível</button>
          <button class="a11y-option" type="button" data-setting="links">Destacar links</button>
          <button class="a11y-option" type="button" data-setting="spacing">Mais espaçamento</button>
          <button class="a11y-option" type="button" data-setting="motion">Reduzir movimentos</button>
          <button class="a11y-option" type="button" data-setting="focus">Foco reforçado</button>
          <button class="a11y-option" type="button" id="a11y-speech">Ouvir conteúdo</button>
        </div>
        <div class="a11y-actions"><button class="a11y-reset" type="button">Restaurar padrão</button><button class="a11y-reset" type="button" id="a11y-close-bottom">Concluir</button></div>
        <p class="a11y-help">Atalho: pressione Alt+A para abrir ou fechar. Use Tab para navegar e Esc para fechar.</p>
        <p class="a11y-status" aria-live="polite"></p>
      </section>
      <button class="a11y-trigger" type="button" aria-controls="a11y-panel" aria-expanded="false">
        <span class="a11y-trigger-icon" aria-hidden="true">♿</span><span>Acessibilidade</span>
      </button>`;
    document.body.append(root);

    const panel = root.querySelector(".a11y-panel");
    const trigger = root.querySelector(".a11y-trigger");
    const status = root.querySelector(".a11y-status");
    const fontValue = root.querySelector(".a11y-font-value");
    const speech = root.querySelector("#a11y-speech");

    function announce(message) { status.textContent = ""; requestAnimationFrame(() => { status.textContent = message; }); }
    function refresh() {
      fontValue.textContent = ["Texto padrão", "Texto 112%", "Texto 125%", "Texto 137%"][settings.font];
      root.querySelectorAll("[data-setting]").forEach((button) => {
        button.setAttribute("aria-pressed", String(Boolean(settings[button.dataset.setting])));
      });
      root.querySelector('[data-font="down"]').disabled = settings.font === 0;
      root.querySelector('[data-font="up"]').disabled = settings.font === 3;
    }
    function closePanel() {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      (lastFocus?.isConnected ? lastFocus : trigger).focus();
    }
    function openPanel() {
      lastFocus = document.activeElement;
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      root.querySelector("#a11y-title").focus();
    }
    function togglePanel() { panel.hidden ? openPanel() : closePanel(); }
    function stopSpeech() {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      speaking = false;
      speech.textContent = "Ouvir conteúdo";
      speech.setAttribute("aria-pressed", "false");
    }

    trigger.addEventListener("click", togglePanel);
    root.querySelector(".a11y-close").addEventListener("click", closePanel);
    root.querySelector("#a11y-close-bottom").addEventListener("click", closePanel);
    root.querySelectorAll("[data-setting]").forEach((button) => button.addEventListener("click", () => {
      const key = button.dataset.setting;
      settings[key] = !settings[key];
      apply(); refresh(); announce(`${button.textContent}: ${settings[key] ? "ativado" : "desativado"}.`);
    }));
    root.querySelectorAll("[data-font]").forEach((button) => button.addEventListener("click", () => {
      settings.font = Math.min(3, Math.max(0, settings.font + (button.dataset.font === "up" ? 1 : -1)));
      apply(); refresh(); announce(fontValue.textContent);
    }));
    root.querySelector(".a11y-reset").addEventListener("click", () => {
      settings = { ...defaults }; stopSpeech(); apply(); refresh(); announce("Preferências restauradas.");
    });

    if (!("speechSynthesis" in window)) {
      speech.disabled = true;
      speech.title = "Leitura em voz alta indisponível neste navegador";
    } else {
      speech.setAttribute("aria-pressed", "false");
      speech.addEventListener("click", () => {
        if (speaking) { stopSpeech(); announce("Leitura interrompida."); return; }
        const text = (main || document.body).innerText.replace(/\s+/g, " ").trim().slice(0, 14000);
        if (!text) { announce("Não há conteúdo disponível para leitura."); return; }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "pt-BR";
        utterance.rate = .95;
        utterance.onend = stopSpeech;
        utterance.onerror = stopSpeech;
        speaking = true;
        speech.textContent = "Parar leitura";
        speech.setAttribute("aria-pressed", "true");
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        announce("Leitura iniciada.");
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.altKey && event.key.toLowerCase() === "a") { event.preventDefault(); togglePanel(); return; }
      if (!panel.hidden && event.key === "Escape") { event.preventDefault(); closePanel(); return; }
      if (!panel.hidden && event.key === "Tab") {
        const focusable = [...panel.querySelectorAll("button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])")];
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement.id === "a11y-title")) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    window.addEventListener("pagehide", stopSpeech);
    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
