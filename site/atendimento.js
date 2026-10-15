(() => {
  "use strict";
  let csrf = "";
  let busy = false;
  const history = [];

  function init() {
    const root = document.createElement("div");
    root.className = "support-root";
    root.innerHTML = `
      <section class="support-panel" id="support-panel" role="dialog" aria-modal="false" aria-labelledby="support-title" hidden>
        <header class="support-header">
          <span class="support-avatar" aria-hidden="true">✦</span>
          <div><h2 id="support-title" tabindex="-1">Lia · Atendimento</h2><p>Assistente virtual da Mundo das Esquadrias</p></div>
          <button class="support-close" type="button" aria-label="Fechar atendimento">×</button>
        </header>
        <div class="support-intro">
          <strong>Olá! Como podemos ajudar?</strong>
          <div class="support-chips" aria-label="Dúvidas frequentes">
            <button class="support-chip" type="button" data-question="Quais serviços vocês fazem?">Serviços</button>
            <button class="support-chip" type="button" data-question="Como funciona o orçamento?">Orçamento</button>
            <button class="support-chip" type="button" data-question="Como tirar as medidas?">Medidas</button>
            <button class="support-chip" type="button" data-question="Quais são as formas de pagamento?">Pagamento</button>
            <button class="support-chip" type="button" data-question="Vocês atendem minha região?">Região</button>
          </div>
        </div>
        <div class="support-messages" aria-live="polite" aria-label="Conversa com a assistente"></div>
        <div class="support-suggestions" aria-label="Sugestões de perguntas"></div>
        <nav class="support-links" aria-label="Canais de atendimento">
          <a href="https://wa.me/5521964070134" target="_blank" rel="noopener"><span aria-hidden="true">◉</span>WhatsApp</a>
          <a href="tel:+5521964070134"><span aria-hidden="true">☎</span>Telefone</a>
          <a href="orcamento.html"><span aria-hidden="true">▤</span>Orçamento</a>
        </nav>
        <form class="support-form">
          <label class="support-status" for="support-input">Digite sua dúvida</label>
          <textarea id="support-input" maxlength="500" rows="1" placeholder="Digite sua dúvida…" required></textarea>
          <button class="support-send" type="submit" aria-label="Enviar pergunta"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14"/></svg></button>
        </form>
        <p class="support-note">Assistente virtual pode cometer erros. Não envie senhas, documentos ou dados de cartão. Para fechar negócio, confirme com a equipe.</p>
        <p class="support-status" aria-live="assertive"></p>
      </section>
      <button class="support-trigger" type="button" aria-label="Abrir atendimento ao cliente" aria-controls="support-panel" aria-expanded="false">
        <span class="support-trigger-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-8 8H6l-4 2 1.5-4A9 9 0 1 1 21 12Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></svg></span>
        <span class="support-trigger-copy"><strong>Atendimento</strong><small>Assistente online</small></span>
      </button>`;
    document.body.append(root);

    const panel = root.querySelector(".support-panel");
    const trigger = root.querySelector(".support-trigger");
    const input = root.querySelector("#support-input");
    const form = root.querySelector(".support-form");
    const messages = root.querySelector(".support-messages");
    const suggestions = root.querySelector(".support-suggestions");
    const send = root.querySelector(".support-send");
    const status = root.querySelectorAll(".support-status")[1];
    let lastFocus = null;

    function announce(text) { status.textContent = ""; requestAnimationFrame(() => { status.textContent = text; }); }
    function addMessage(role, text, temporary = false) {
      const item = document.createElement("div");
      item.className = `support-message${temporary ? " support-typing" : ""}`;
      item.dataset.role = role;
      const avatar = document.createElement("span");
      avatar.className = "support-message-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = role === "assistant" ? "L" : "V";
      const bubble = document.createElement("div");
      bubble.className = "support-bubble";
      if (temporary) bubble.innerHTML = "<i></i><i></i><i></i>";
      else bubble.textContent = text;
      item.append(avatar, bubble);
      messages.append(item);
      messages.scrollTop = messages.scrollHeight;
      return item;
    }
    function setSuggestions(items = []) {
      suggestions.replaceChildren();
      items.slice(0, 3).forEach((text) => {
        const button = document.createElement("button");
        button.type = "button"; button.textContent = text;
        button.addEventListener("click", () => ask(text));
        suggestions.append(button);
      });
    }
    async function token() {
      if (csrf) return csrf;
      const response = await fetch("/api/csrf", { credentials: "same-origin" });
      if (!response.ok) throw new Error("CSRF");
      csrf = (await response.json()).token;
      return csrf;
    }
    async function ask(question) {
      const clean = String(question || "").trim();
      if (!clean || busy) return;
      busy = true; send.disabled = true; input.disabled = true; suggestions.replaceChildren();
      addMessage("user", clean);
      const past = history.slice(-6);
      history.push({ role: "user", content: clean });
      const typing = addMessage("assistant", "", true);
      try {
        const response = await fetch("/api/atendimento", {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": await token() },
          body: JSON.stringify({ mensagem: clean, historico: past }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.erro || "Atendimento indisponível.");
        typing.remove(); addMessage("assistant", data.resposta);
        history.push({ role: "assistant", content: data.resposta });
        setSuggestions(data.sugestoes);
        announce("Resposta recebida.");
      } catch (error) {
        typing.remove(); addMessage("assistant", error.message || "Não consegui responder agora. Fale com a equipe pelo WhatsApp.");
        setSuggestions(["Falar com atendente"]); announce("Não foi possível consultar a assistente agora.");
      } finally {
        busy = false; send.disabled = false; input.disabled = false; input.value = ""; input.focus();
      }
    }
    function open() {
      lastFocus = document.activeElement; panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true"); trigger.setAttribute("aria-label", "Fechar atendimento ao cliente");
      root.querySelector("#support-title").focus();
      if (!messages.children.length) {
        addMessage("assistant", "Olá! Eu sou a Lia. Posso tirar dúvidas sobre serviços, medidas, orçamento, pagamento e atendimento. O que você gostaria de saber?");
        setSuggestions(["Quais serviços vocês fazem?", "Como pedir orçamento?", "Falar com atendente"]);
      }
    }
    function close() {
      panel.hidden = true; trigger.setAttribute("aria-expanded", "false"); trigger.setAttribute("aria-label", "Abrir atendimento ao cliente");
      (lastFocus?.isConnected ? lastFocus : trigger).focus();
    }
    trigger.addEventListener("click", () => panel.hidden ? open() : close());
    root.querySelector(".support-close").addEventListener("click", close);
    root.querySelectorAll("[data-question]").forEach((button) => button.addEventListener("click", () => ask(button.dataset.question)));
    form.addEventListener("submit", (event) => { event.preventDefault(); ask(input.value); });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
    });
    document.addEventListener("keydown", (event) => {
      if (!panel.hidden && event.key === "Escape") { event.preventDefault(); close(); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
