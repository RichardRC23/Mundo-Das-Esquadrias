(() => {
  "use strict";

  const storageKey = "mde-acessibilidade-v2";
  const defaults = Object.freeze({
    font: 0, contrast: false, grayscale: false, readable: false, links: false,
    spacing: false, motion: false, focus: true, headings: false, cursor: false,
    guide: false, speechRate: .92,
  });
  let settings = { ...defaults };
  let lastFocus = null;
  let voices = [];
  const reader = { active: false, paused: false, blocks: [], block: 0, parts: [], part: 0, timer: null, highlighted: null };

  try {
    const previous = JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem("mde-acessibilidade-v1") || "{}");
    settings = { ...defaults, ...previous };
  } catch { settings = { ...defaults }; }

  function apply() {
    const html = document.documentElement;
    settings.font = Math.min(3, Math.max(0, Number(settings.font) || 0));
    html.dataset.a11yFont = String(settings.font);
    for (const key of ["contrast", "grayscale", "readable", "links", "spacing", "motion", "focus", "headings", "cursor", "guide"]) {
      if (settings[key]) html.setAttribute(`data-a11y-${key}`, "");
      else html.removeAttribute(`data-a11y-${key}`);
    }
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Keep preferences for this page. */ }
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

    const guide = document.createElement("div");
    guide.className = "a11y-reading-guide";
    guide.setAttribute("aria-hidden", "true");
    document.body.append(guide);

    const root = document.createElement("div");
    root.className = "a11y-root";
    root.innerHTML = `
      <section class="a11y-panel" id="a11y-panel" role="dialog" aria-modal="false" aria-labelledby="a11y-title" hidden>
        <header class="a11y-heading">
          <span class="a11y-heading-icon" aria-hidden="true">A+</span>
          <div><h2 id="a11y-title" tabindex="-1">Acessibilidade</h2><p>Personalize o site do seu jeito.</p></div>
          <button class="a11y-close" type="button" aria-label="Fechar painel">×</button>
        </header>
        <section class="a11y-section" aria-labelledby="a11y-visual-title">
          <h3 id="a11y-visual-title">Visualização</h3>
          <div class="a11y-font-controls" aria-label="Tamanho do texto">
            <button type="button" data-font="down" aria-label="Diminuir texto">A−</button>
            <span class="a11y-font-value" aria-live="polite">Texto padrão</span>
            <button type="button" data-font="up" aria-label="Aumentar texto">A+</button>
          </div>
          <div class="a11y-options">
            <button class="a11y-option" type="button" data-setting="contrast"><span aria-hidden="true">◐</span><strong>Alto contraste</strong></button>
            <button class="a11y-option" type="button" data-setting="grayscale"><span aria-hidden="true">◑</span><strong>Tons de cinza</strong></button>
            <button class="a11y-option" type="button" data-setting="readable"><span aria-hidden="true">Aa</span><strong>Fonte legível</strong></button>
            <button class="a11y-option" type="button" data-setting="spacing"><span aria-hidden="true">↕</span><strong>Mais espaçamento</strong></button>
            <button class="a11y-option" type="button" data-setting="links"><span aria-hidden="true">↗</span><strong>Destacar links</strong></button>
            <button class="a11y-option" type="button" data-setting="headings"><span aria-hidden="true">H</span><strong>Destacar títulos</strong></button>
          </div>
        </section>
        <section class="a11y-section" aria-labelledby="a11y-navigation-title">
          <h3 id="a11y-navigation-title">Navegação e conforto</h3>
          <div class="a11y-options">
            <button class="a11y-option" type="button" data-setting="motion"><span aria-hidden="true">Ⅱ</span><strong>Reduzir movimentos</strong></button>
            <button class="a11y-option" type="button" data-setting="focus"><span aria-hidden="true">◎</span><strong>Foco reforçado</strong></button>
            <button class="a11y-option" type="button" data-setting="cursor"><span aria-hidden="true">➤</span><strong>Cursor ampliado</strong></button>
            <button class="a11y-option" type="button" data-setting="guide"><span aria-hidden="true">▬</span><strong>Guia de leitura</strong></button>
          </div>
        </section>
        <section class="a11y-section a11y-reader" aria-labelledby="a11y-reader-title">
          <div class="a11y-reader-heading"><div><h3 id="a11y-reader-title">Leitura em voz alta</h3><p>Leitura por trechos, com pausas naturais e destaque do texto.</p></div><span aria-hidden="true">🔊</span></div>
          <label class="a11y-rate-label" for="a11y-rate">Ritmo da voz
            <select id="a11y-rate"><option value="0.82">Calmo</option><option value="0.92">Natural</option><option value="1.04">Mais rápido</option></select>
          </label>
          <p class="a11y-reader-progress" aria-live="polite">Selecione um texto para ouvir só aquele trecho, ou inicie a leitura da página.</p>
          <div class="a11y-reader-controls">
            <button type="button" id="a11y-speech">▶ Ouvir</button>
            <button type="button" id="a11y-previous" aria-label="Trecho anterior" disabled>‹</button>
            <button type="button" id="a11y-next" aria-label="Próximo trecho" disabled>›</button>
            <button type="button" id="a11y-stop" disabled>■ Parar</button>
          </div>
        </section>
        <div class="a11y-actions"><button class="a11y-reset" type="button">Restaurar padrão</button><button class="a11y-done" type="button" id="a11y-close-bottom">Concluir</button></div>
        <p class="a11y-help">Atalho: Alt+A para abrir · Esc para fechar</p>
        <p class="a11y-status" aria-live="polite"></p>
      </section>
      <span class="a11y-trigger-label" id="a11y-trigger-label" role="tooltip">Acessibilidade</span>
      <button class="a11y-trigger" type="button" aria-label="Abrir acessibilidade" aria-describedby="a11y-trigger-label" aria-controls="a11y-panel" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="4" r="2.2"/><path d="M5 8.5c4.7-2.2 9.3-2.2 14 0M12 7v6m0 0-4.3 7m4.3-7 4.3 7"/></svg>
      </button>`;
    document.body.append(root);

    const panel = root.querySelector(".a11y-panel");
    const trigger = root.querySelector(".a11y-trigger");
    const status = root.querySelector(".a11y-status");
    const fontValue = root.querySelector(".a11y-font-value");
    const speech = root.querySelector("#a11y-speech");
    const previous = root.querySelector("#a11y-previous");
    const next = root.querySelector("#a11y-next");
    const stop = root.querySelector("#a11y-stop");
    const progress = root.querySelector(".a11y-reader-progress");
    const rate = root.querySelector("#a11y-rate");

    function announce(message) { status.textContent = ""; requestAnimationFrame(() => { status.textContent = message; }); }
    function refresh() {
      fontValue.textContent = ["Texto padrão", "Texto 112%", "Texto 125%", "Texto 137%"][settings.font];
      root.querySelectorAll("[data-setting]").forEach((button) => button.setAttribute("aria-pressed", String(Boolean(settings[button.dataset.setting]))));
      root.querySelector('[data-font="down"]').disabled = settings.font === 0;
      root.querySelector('[data-font="up"]').disabled = settings.font === 3;
      rate.value = String(settings.speechRate);
    }
    function closePanel() {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-label", "Abrir acessibilidade");
      (lastFocus?.isConnected ? lastFocus : trigger).focus();
    }
    function openPanel() {
      lastFocus = document.activeElement;
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      trigger.setAttribute("aria-label", "Fechar acessibilidade");
      root.querySelector("#a11y-title").focus();
    }
    function togglePanel() { panel.hidden ? openPanel() : closePanel(); }

    function loadVoices() { voices = window.speechSynthesis?.getVoices?.() || []; }
    function naturalVoice() {
      const portuguese = voices.filter((voice) => /^pt(?:-|_)/i.test(voice.lang));
      const score = (voice) => {
        const name = voice.name.toLowerCase();
        return (/natural|neural|premium/.test(name) ? 50 : 0) + (/francisca|antonio|google/.test(name) ? 25 : 0) + (/pt-br/i.test(voice.lang) ? 15 : 0) + (voice.localService ? 2 : 0);
      };
      return portuguese.sort((a, b) => score(b) - score(a))[0] || voices.find((voice) => voice.default) || voices[0];
    }
    function clearHighlight() {
      reader.highlighted?.classList.remove("a11y-reading-active");
      reader.highlighted = null;
    }
    function updateReader() {
      const total = reader.blocks.length;
      progress.textContent = reader.active ? `Trecho ${Math.min(reader.block + 1, total)} de ${total}${reader.paused ? " · pausado" : " · lendo"}` : "Selecione um texto para ouvir só aquele trecho, ou inicie a leitura da página.";
      speech.textContent = reader.active && !reader.paused ? "Ⅱ Pausar" : reader.active ? "▶ Continuar" : "▶ Ouvir";
      speech.setAttribute("aria-pressed", String(reader.active && !reader.paused));
      previous.disabled = !reader.active || reader.block === 0;
      next.disabled = !reader.active || reader.block >= total - 1;
      stop.disabled = !reader.active;
    }
    function stopReader(announceStop = false) {
      clearTimeout(reader.timer);
      window.speechSynthesis?.cancel();
      clearHighlight();
      Object.assign(reader, { active: false, paused: false, blocks: [], block: 0, parts: [], part: 0, timer: null });
      updateReader();
      if (announceStop) announce("Leitura encerrada.");
    }
    function visible(element) {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && !element.closest("[hidden], .a11y-root");
    }
    function readingBlocks() {
      const selection = window.getSelection()?.toString().replace(/\s+/g, " ").trim();
      if (selection?.length > 2) return [{ element: null, text: selection.slice(0, 5000) }];
      const scope = main || document.body;
      const elements = [...scope.querySelectorAll("h1,h2,h3,p,li,summary,legend")];
      const seen = new Set();
      return elements.filter(visible).map((element) => ({ element, text: element.innerText.replace(/\s+/g, " ").trim() }))
        .filter(({ text }) => text.length > 1 && text.length < 1800 && !seen.has(text) && seen.add(text)).slice(0, 120);
    }
    function speechParts(text) {
      return (text.match(/[^,;:.!?…]+(?:[,;:.!?…]+|$)/g) || [text]).map((part) => part.trim()).filter(Boolean);
    }
    function pauseAfter(part, endOfBlock) {
      if (endOfBlock) return 620;
      if (/[.!?…]$/.test(part)) return 430;
      if (/[;:]$/.test(part)) return 280;
      if (/,$/.test(part)) return 170;
      return 90;
    }
    function speakPart() {
      if (!reader.active || reader.paused) return;
      const block = reader.blocks[reader.block];
      if (!block) { stopReader(); announce("Leitura concluída."); return; }
      if (!reader.parts.length) {
        reader.parts = speechParts(block.text); reader.part = 0; clearHighlight();
        if (block.element) {
          reader.highlighted = block.element;
          block.element.classList.add("a11y-reading-active");
          block.element.scrollIntoView({ block: "center", behavior: settings.motion ? "auto" : "smooth" });
        }
        updateReader();
      }
      const text = reader.parts[reader.part];
      if (!text) { reader.block += 1; reader.parts = []; reader.part = 0; reader.timer = setTimeout(speakPart, 620); return; }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "pt-BR";
      utterance.rate = Number(settings.speechRate) || .92;
      utterance.pitch = 1.02;
      utterance.volume = 1;
      const selectedVoice = naturalVoice();
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.onend = () => {
        if (!reader.active || reader.paused) return;
        reader.part += 1;
        const finishedBlock = reader.part >= reader.parts.length;
        if (finishedBlock) { reader.block += 1; reader.parts = []; reader.part = 0; }
        reader.timer = setTimeout(speakPart, pauseAfter(text, finishedBlock));
      };
      utterance.onerror = (event) => {
        if (event.error !== "canceled" && event.error !== "interrupted") { stopReader(); announce("A leitura em voz alta não está disponível agora."); }
      };
      window.speechSynthesis.speak(utterance);
    }
    function startReader() {
      const blocks = readingBlocks();
      if (!blocks.length) { announce("Não há conteúdo disponível para leitura."); return; }
      stopReader(); reader.blocks = blocks; reader.active = true;
      updateReader(); speakPart(); announce("Leitura iniciada por trechos.");
    }
    function moveReader(offset) {
      if (!reader.active) return;
      clearTimeout(reader.timer); window.speechSynthesis.cancel(); clearHighlight();
      reader.block = Math.min(reader.blocks.length - 1, Math.max(0, reader.block + offset));
      reader.parts = []; reader.part = 0; reader.paused = false;
      updateReader(); speakPart();
    }

    trigger.addEventListener("click", togglePanel);
    root.querySelector(".a11y-close").addEventListener("click", closePanel);
    root.querySelector("#a11y-close-bottom").addEventListener("click", closePanel);
    root.querySelectorAll("[data-setting]").forEach((button) => button.addEventListener("click", () => {
      const key = button.dataset.setting;
      settings[key] = !settings[key];
      apply(); refresh(); announce(`${button.querySelector("strong").textContent}: ${settings[key] ? "ativado" : "desativado"}.`);
    }));
    root.querySelectorAll("[data-font]").forEach((button) => button.addEventListener("click", () => {
      settings.font = Math.min(3, Math.max(0, settings.font + (button.dataset.font === "up" ? 1 : -1)));
      apply(); refresh(); announce(fontValue.textContent);
    }));
    root.querySelector(".a11y-reset").addEventListener("click", () => {
      settings = { ...defaults }; stopReader(); apply(); refresh(); announce("Preferências restauradas.");
    });
    rate.addEventListener("change", () => {
      settings.speechRate = Number(rate.value); apply();
      if (reader.active) moveReader(0);
      announce(`Ritmo ${rate.selectedOptions[0].textContent.toLowerCase()}.`);
    });

    if (!("speechSynthesis" in window)) {
      speech.disabled = true;
      speech.title = "Leitura em voz alta indisponível neste navegador";
    } else {
      loadVoices();
      window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
      speech.addEventListener("click", () => {
        if (!reader.active) { startReader(); return; }
        if (reader.paused) {
          reader.paused = false;
          if (window.speechSynthesis.paused) window.speechSynthesis.resume(); else speakPart();
          updateReader(); announce("Leitura retomada.");
        } else {
          reader.paused = true; clearTimeout(reader.timer); window.speechSynthesis.pause();
          updateReader(); announce("Leitura pausada.");
        }
      });
      previous.addEventListener("click", () => moveReader(-1));
      next.addEventListener("click", () => moveReader(1));
      stop.addEventListener("click", () => stopReader(true));
    }

    const moveGuide = (y) => document.documentElement.style.setProperty("--a11y-guide-y", `${Math.max(24, Math.min(innerHeight - 24, y))}px`);
    document.addEventListener("pointermove", (event) => { if (settings.guide) moveGuide(event.clientY); }, { passive: true });
    document.addEventListener("touchmove", (event) => { if (settings.guide && event.touches[0]) moveGuide(event.touches[0].clientY); }, { passive: true });
    document.addEventListener("keydown", (event) => {
      if (event.altKey && event.key.toLowerCase() === "a") { event.preventDefault(); togglePanel(); return; }
      if (!panel.hidden && event.key === "Escape") { event.preventDefault(); closePanel(); return; }
      if (!panel.hidden && event.key === "Tab") {
        const focusable = [...panel.querySelectorAll("button:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex='-1'])")];
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement.id === "a11y-title")) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    window.addEventListener("pagehide", () => stopReader());

    try {
      if (matchMedia("(hover: none)").matches && !sessionStorage.getItem("mde-a11y-tip")) {
        root.classList.add("a11y-show-tip");
        sessionStorage.setItem("mde-a11y-tip", "1");
        setTimeout(() => root.classList.remove("a11y-show-tip"), 4500);
      }
    } catch { /* Tooltip remains available by focus. */ }
    refresh(); updateReader();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
