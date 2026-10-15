(() => {
  "use strict";

  const storageKey = "mde-acessibilidade-v4";
  const defaults = Object.freeze({
    font: 0, contrast: false, dark: false, grayscale: false, readable: false, links: false,
    spacing: false, motion: false, focus: true, headings: false, cursor: false,
    guide: false, imageDescriptions: false, speechRate: .98, voiceURI: "auto",
  });
  let settings = { ...defaults };
  let lastFocus = null;
  let voices = [];
  const reader = { active: false, paused: false, blocks: [], block: 0, parts: [], part: 0, timer: null, highlighted: null };

  try {
    const previous = JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem("mde-acessibilidade-v3") || localStorage.getItem("mde-acessibilidade-v2") || localStorage.getItem("mde-acessibilidade-v1") || "{}");
    if (previous.speechRate === .82) previous.speechRate = .9;
    if (previous.speechRate === .92) previous.speechRate = .98;
    if (previous.speechRate === 1.04) previous.speechRate = 1.08;
    settings = { ...defaults, ...previous };
  } catch { settings = { ...defaults }; }

  function apply() {
    const html = document.documentElement;
    settings.font = Math.min(3, Math.max(0, Number(settings.font) || 0));
    html.dataset.a11yFont = String(settings.font);
    for (const key of ["contrast", "dark", "grayscale", "readable", "links", "spacing", "motion", "focus", "headings", "cursor", "guide", "imageDescriptions"]) {
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
        <section class="a11y-section a11y-presets" aria-labelledby="a11y-presets-title">
          <div class="a11y-section-heading"><div><h3 id="a11y-presets-title">Atalhos para enxergar melhor</h3><p>Configure vários recursos com apenas um toque.</p></div><span aria-hidden="true">👁</span></div>
          <div class="a11y-preset-grid">
            <button type="button" data-preset="amplified"><span aria-hidden="true">A+</span><strong>Visão ampliada</strong><small>Texto, cursor e foco maiores</small></button>
            <button type="button" data-preset="contrast"><span aria-hidden="true">◐</span><strong>Contraste máximo</strong><small>Preto, branco e amarelo</small></button>
            <button type="button" data-preset="guided"><span aria-hidden="true">▬</span><strong>Leitura guiada</strong><small>Linha guia e texto espaçado</small></button>
          </div>
        </section>
        <section class="a11y-section" aria-labelledby="a11y-visual-title">
          <h3 id="a11y-visual-title">Visualização</h3>
          <div class="a11y-font-controls" aria-label="Tamanho do texto">
            <button type="button" data-font="down" aria-label="Diminuir texto">A−</button>
            <span class="a11y-font-value" aria-live="polite">Texto padrão</span>
            <button type="button" data-font="up" aria-label="Aumentar texto">A+</button>
          </div>
          <div class="a11y-options">
            <button class="a11y-option" type="button" data-setting="contrast"><span aria-hidden="true">◐</span><strong>Alto contraste</strong></button>
            <button class="a11y-option" type="button" data-setting="dark"><span aria-hidden="true">☾</span><strong>Modo escuro</strong></button>
            <button class="a11y-option" type="button" data-setting="grayscale"><span aria-hidden="true">◑</span><strong>Tons de cinza</strong></button>
            <button class="a11y-option" type="button" data-setting="readable"><span aria-hidden="true">Aa</span><strong>Fonte legível</strong></button>
            <button class="a11y-option" type="button" data-setting="spacing"><span aria-hidden="true">↕</span><strong>Mais espaçamento</strong></button>
            <button class="a11y-option" type="button" data-setting="links"><span aria-hidden="true">↗</span><strong>Destacar links</strong></button>
            <button class="a11y-option" type="button" data-setting="headings"><span aria-hidden="true">H</span><strong>Destacar títulos</strong></button>
            <button class="a11y-option" type="button" data-setting="imageDescriptions"><span aria-hidden="true">▧</span><strong>Descrever imagens</strong></button>
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
          <label class="a11y-rate-label" for="a11y-voice">Voz
            <select id="a11y-voice"><option value="auto">Melhor voz disponível</option></select>
          </label>
          <label class="a11y-rate-label" for="a11y-rate">Ritmo da voz
            <select id="a11y-rate"><option value="0.9">Calmo</option><option value="0.98">Natural</option><option value="1.08">Mais rápido</option></select>
          </label>
          <p class="a11y-reader-progress" aria-live="polite">Selecione um texto para ouvir só aquele trecho, ou inicie a leitura da página.</p>
          <div class="a11y-reader-controls">
            <button type="button" id="a11y-speech">▶ Ouvir</button>
            <button type="button" id="a11y-previous" aria-label="Trecho anterior" disabled>‹</button>
            <button type="button" id="a11y-next" aria-label="Próximo trecho" disabled>›</button>
            <button type="button" id="a11y-stop" disabled>■ Parar</button>
          </div>
        </section>
        <section class="a11y-section a11y-libras" aria-labelledby="a11y-libras-title">
          <div class="a11y-libras-icon" aria-hidden="true">🤟</div>
          <div class="a11y-libras-copy"><span>Recurso oficial</span><h3 id="a11y-libras-title">Conteúdo em Libras</h3><p>Traduza textos do site com o intérprete virtual VLibras.</p></div>
          <button type="button" id="a11y-libras"><span>Ativar VLibras</span><b aria-hidden="true">→</b></button>
          <p class="a11y-libras-note" id="a11y-libras-status">O tradutor será carregado somente quando você ativar.</p>
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
    const voiceSelect = root.querySelector("#a11y-voice");
    const libras = root.querySelector("#a11y-libras");
    const librasStatus = root.querySelector("#a11y-libras-status");

    function syncImageDescriptions() {
      document.querySelectorAll(".a11y-image-description").forEach((caption) => caption.remove());
      if (!settings.imageDescriptions) return;
      document.querySelectorAll("body img[alt]").forEach((image) => {
        const description = image.alt.trim();
        if (!description || image.closest(".a11y-root")) return;
        const caption = document.createElement("span");
        caption.className = "a11y-image-description";
        caption.textContent = `Imagem: ${description}`;
        image.insertAdjacentElement("afterend", caption);
      });
    }

    function announce(message) { status.textContent = ""; requestAnimationFrame(() => { status.textContent = message; }); }
    function refresh() {
      fontValue.textContent = ["Texto padrão", "Texto 112%", "Texto 125%", "Texto 137%"][settings.font];
      root.querySelectorAll("[data-setting]").forEach((button) => button.setAttribute("aria-pressed", String(Boolean(settings[button.dataset.setting]))));
      root.querySelector('[data-font="down"]').disabled = settings.font === 0;
      root.querySelector('[data-font="up"]').disabled = settings.font === 3;
      rate.value = String(settings.speechRate);
      voiceSelect.value = voices.some((voice) => voice.voiceURI === settings.voiceURI) ? settings.voiceURI : "auto";
      const activePresets = {
        amplified: settings.font >= 2 && settings.readable && settings.spacing && settings.focus && settings.cursor,
        contrast: settings.contrast && settings.links && settings.headings && settings.focus,
        guided: settings.guide && settings.readable && settings.spacing && settings.links,
      };
      root.querySelectorAll("[data-preset]").forEach((button) => button.setAttribute("aria-pressed", String(activePresets[button.dataset.preset])));
      syncImageDescriptions();
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

    function loadVoices() {
      voices = window.speechSynthesis?.getVoices?.() || [];
      const portuguese = voices.filter((voice) => /^pt(?:-|_)/i.test(voice.lang));
      voiceSelect.replaceChildren(new Option("Melhor voz disponível", "auto"));
      portuguese.forEach((voice) => voiceSelect.add(new Option(`${voice.name} (${voice.lang})`, voice.voiceURI)));
      voiceSelect.value = portuguese.some((voice) => voice.voiceURI === settings.voiceURI) ? settings.voiceURI : "auto";
    }
    function naturalVoice() {
      const portuguese = voices.filter((voice) => /^pt(?:-|_)/i.test(voice.lang));
      const chosen = portuguese.find((voice) => voice.voiceURI === settings.voiceURI);
      if (chosen) return chosen;
      const score = (voice) => {
        const name = voice.name.toLowerCase();
        return (/natural|neural|premium/.test(name) ? 80 : 0) + (/google/.test(name) ? 45 : 0) + (/maria|francisca/.test(name) ? 40 : 0) + (/antonio/.test(name) ? 35 : 0) + (/microsoft/.test(name) ? 20 : 0) + (/pt-br/i.test(voice.lang) ? 15 : 0);
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
      const sentences = (text.match(/[^.!?…]+(?:[.!?…]+|$)/g) || [text]).map((part) => part.trim()).filter(Boolean);
      const parts = [];
      let current = "";
      const push = () => { if (current) parts.push(current); current = ""; };
      for (const sentence of sentences) {
        if (sentence.length > 480) {
          push();
          const words = sentence.split(/\s+/);
          for (const word of words) {
            if (`${current} ${word}`.trim().length > 360) push();
            current = `${current} ${word}`.trim();
          }
          push();
        } else if (`${current} ${sentence}`.trim().length <= 420) {
          current = `${current} ${sentence}`.trim();
        } else {
          push(); current = sentence;
        }
      }
      push();
      return parts;
    }
    function pauseAfter(_part, endOfBlock) {
      return endOfBlock ? 180 : 70;
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
      utterance.rate = Number(settings.speechRate) || .98;
      utterance.pitch = 1;
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
    root.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => {
      const preset = button.dataset.preset;
      if (preset === "amplified") Object.assign(settings, { font: 2, readable: true, spacing: true, focus: true, cursor: true });
      if (preset === "contrast") Object.assign(settings, { contrast: true, dark: false, links: true, headings: true, focus: true });
      if (preset === "guided") Object.assign(settings, { guide: true, readable: true, spacing: true, links: true });
      apply(); refresh(); announce(`${button.querySelector("strong").textContent} ativada.`);
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
    voiceSelect.addEventListener("change", () => {
      settings.voiceURI = voiceSelect.value; apply();
      if (reader.active) moveReader(0);
      announce(`Voz ${voiceSelect.selectedOptions[0].textContent}.`);
    });

    function openLibrasButton() {
      const button = window.VLibrasWidget?.initBtn;
      if (!button) return false;
      button.style.setProperty("bottom", "86px", "important");
      button.setAttribute("aria-label", "Abrir tradutor de Libras");
      button.click();
      libras.disabled = false;
      libras.innerHTML = "<span>Abrir VLibras</span><b aria-hidden=\"true\">→</b>";
      librasStatus.textContent = "VLibras está pronto. Selecione um texto para traduzir.";
      announce("Tradutor VLibras ativado.");
      return true;
    }
    function waitForLibras(attempt = 0) {
      if (openLibrasButton()) return;
      if (attempt < 40) { setTimeout(() => waitForLibras(attempt + 1), 150); return; }
      libras.disabled = false;
      libras.innerHTML = "<span>Tentar novamente</span><b aria-hidden=\"true\">↻</b>";
      librasStatus.textContent = "Não foi possível carregar agora. Verifique sua conexão.";
      announce("Não foi possível carregar o VLibras agora.");
    }
    libras.addEventListener("click", () => {
      if (openLibrasButton()) return;
      libras.disabled = true;
      libras.textContent = "Carregando intérprete…";
      librasStatus.textContent = "Preparando o tradutor de Libras…";
      let script = document.querySelector('script[data-mde-vlibras]');
      if (!script) {
        script = document.createElement("script");
        script.src = "https://vlibras.gov.br/app/vlibras-plugin.js";
        script.dataset.mdeVlibras = "";
        script.async = true;
        script.onerror = () => waitForLibras(40);
        document.body.append(script);
      }
      waitForLibras();
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
