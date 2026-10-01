(() => {
  const states = { pendente: "Aguardando resposta", aceita: "Aceita pelo cliente", ajustes: "Ajustes solicitados", substituida: "Substituída por nova versão" };
  const el = (tag, content, className) => {
    const node = document.createElement(tag);
    if (content != null) node.textContent = content;
    if (className) node.className = className;
    return node;
  };
  const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
  function detail(p) {
    const box = el("div", null, "proposal-detail");
    box.append(el("strong", `Proposta ${p.numero} · ${money(p.valor_centavos)}`),
      el("p", states[p.situacao]), el("p", `Prazo: ${p.prazo}`));
    if (p.observacoes) box.append(el("p", p.observacoes));
    box.append(el("small", `Enviada em ${new Date(p.enviada_em).toLocaleString("pt-BR")}`));
    if (p.respondida_em) box.append(el("p", `Resposta em ${new Date(p.respondida_em).toLocaleString("pt-BR")}${p.resposta ? `: ${p.resposta}` : ""}`));
    return box;
  }
  function field(form, title, tag, attrs) {
    const label = el("label", title);
    const input = el(tag);
    Object.assign(input, attrs);
    label.append(input); form.append(label);
    return input;
  }
  function render(quote, admin, refresh) {
    const panel = el("section", null, "proposal-panel");
    panel.setAttribute("aria-label", `Proposta do orçamento ${quote.codigo}`);
    const history = quote.propostas || [];
    const current = history.at(-1);
    panel.append(el("h3", "Proposta da empresa"));
    if (current) panel.append(detail(current));
    else panel.append(el("p", "Aguardando a empresa analisar o pedido e informar o valor final."));
    if (history.length > 1) {
      const older = el("details"); older.append(el("summary", "Ver versões anteriores"));
      history.slice(0, -1).reverse().forEach((p) => older.append(detail(p)));
      panel.append(older);
    }
    const editable = !["aprovado", "concluido", "cancelado"].includes(quote.status) && current?.situacao !== "aceita";
    if (admin && !quote.usuario_id) {
      panel.append(el("p", "Pedido sem conta vinculada: entre em contato pelo telefone ou e-mail informado. O cliente pode enviar um novo pedido após fazer login."));
      return panel;
    }
    if (!(admin ? editable : current?.situacao === "pendente" && quote.status === "aguardando_cliente")) return panel;
    const form = el("form", null, "proposal-form");
    let amount, deadline, notes, agree;
    if (admin) {
      amount = field(form, "Valor final total (R$)", "input", { type: "number", min: "0.01", max: "10000000", step: "0.01", required: true, value: current ? (current.valor_centavos / 100).toFixed(2) : "" });
      deadline = field(form, "Prazo e a partir de quando começa a contar", "input", { maxLength: 300, required: true, placeholder: "Ex.: 15 dias úteis após a medição técnica", value: current?.prazo || "" });
      notes = field(form, "Observações e condições da proposta", "textarea", { maxLength: 2000, rows: 4, value: current?.observacoes || "", placeholder: "Informe materiais, instalação e condições de pagamento incluídos no valor." });
      form.append(el("p", "A proposta ficará disponível em Minha Conta. O envio não dispara mensagem pelo WhatsApp."));
    } else {
      notes = field(form, "O que deseja ajustar?", "textarea", { maxLength: 2000, rows: 3, placeholder: "Descreva aqui as alterações desejadas." });
      agree = field(form, `Li o valor final de ${money(current.valor_centavos)}, o prazo e as condições acima e quero aceitar esta proposta.`, "input", { type: "checkbox" });
      agree.parentElement.className = "proposal-consent";
      form.append(el("p", "A aceitação registra sua resposta para a empresa; nenhum pagamento é realizado nesta etapa."));
    }
    const status = el("p", "", "proposal-message"); status.setAttribute("role", "status");
    const actions = el("div", null, "proposal-actions");
    const send = el("button", admin ? (current ? "Enviar nova versão" : "Enviar proposta ao cliente") : "Aceitar proposta", "button primary");
    send.type = "submit"; send.value = admin ? "enviar" : "aceitar"; actions.append(send);
    if (!admin) {
      const adjust = el("button", "Solicitar ajustes", "button secondary"); adjust.type = "submit"; adjust.value = "ajustes"; actions.append(adjust);
    }
    form.append(status, actions); panel.append(form);
    let busy = false;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      const action = event.submitter?.value || (admin ? "enviar" : "aceitar");
      if (!admin && action === "aceitar" && !agree.checked) { status.textContent = "Marque a confirmação de leitura para aceitar."; return; }
      if (!admin && action === "ajustes" && !notes.value.trim()) { status.textContent = "Descreva quais ajustes deseja solicitar."; notes.focus(); return; }
      busy = true;
      actions.querySelectorAll("button").forEach((b) => { b.disabled = true; });
      status.textContent = "Enviando…";
      try {
        const body = admin ? { versao: quote.proposta_versao, valor_centavos: Math.round(Number(amount.value) * 100), prazo: deadline.value, observacoes: notes.value }
          : { versao: quote.proposta_versao, acao: action, mensagem: action === "ajustes" ? notes.value : "" };
        const result = await ContaAPI.request(admin ? `/api/admin/orcamentos/${quote.id}/proposta` : `/api/orcamentos/${encodeURIComponent(quote.codigo)}/resposta`, { method: "POST", body });
        status.textContent = result.mensagem;
        await refresh(result.mensagem);
      } catch (error) {
        status.textContent = error.message;
      } finally { busy = false; actions.querySelectorAll("button").forEach((b) => { b.disabled = false; }); }
    });
    return panel;
  }
  window.PropostasUI = { render };
})();
