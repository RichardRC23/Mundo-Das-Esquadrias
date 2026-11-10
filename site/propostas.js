(() => {
  const states = { pendente: "Aguardando resposta", aceita: "Aceita pelo cliente", ajustes: "Ajustes solicitados", substituida: "Substituída por nova versão" };
  const el = (tag, content, className) => {
    const node = document.createElement(tag);
    if (content != null) node.textContent = content;
    if (className) node.className = className;
    return node;
  };
  const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
  const categories = { materiais: "Materiais", mao_obra: "Mão de obra de fabricação", instalacao: "Instalação" };
  const cents = (input) => Math.round(Number(input.value) * 100);
  function detail(p) {
    const box = el("div", null, "proposal-detail");
    box.append(el("strong", `${p.codigo || `Proposta ${p.numero}`} · ${money(p.valor_centavos)}`),
      el("p", states[p.situacao]), el("p", `Prazo: ${p.prazo}`));
    if (p.valida_ate) box.append(el("p", `Válida até ${new Date(p.valida_ate).toLocaleDateString("pt-BR")}`));
    if (p.partes_valor_centavos) {
      const list = el("dl", null, "proposal-parts");
      Object.entries(categories).forEach(([key, label]) => {
        const value = key === "materiais" ? (p.partes_valor_centavos[key] || 0) + (p.partes_valor_centavos.frete || 0)
          : key === "mao_obra" ? (p.partes_valor_centavos[key] || 0) + (p.partes_valor_centavos.outros || 0)
            : p.partes_valor_centavos[key];
        if (Number.isSafeInteger(value) && value > 0) list.append(el("dt", label), el("dd", money(value)));
      });
      box.append(list);
    }
    const commercial = [
      ["Escopo", p.escopo], ["Inclui", p.inclusos], ["Não inclui", p.excluidos],
      ["Pagamento", p.condicoes_pagamento], ["Garantia", p.garantia],
      ["Medição e visita técnica", p.visita_tecnica], ["Observações", p.observacoes],
    ].filter(([, value]) => value);
    if (commercial.length) {
      const terms = el("div", null, "proposal-terms");
      commercial.forEach(([label, value]) => { const item = el("p"); item.append(el("b", `${label}: `), document.createTextNode(value)); terms.append(item); });
      box.append(terms);
    }
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
    let amount, deadline, notes, agree, partInputs, validity, scope, included, excluded, payment, warranty, visit;
    if (admin) {
      amount = field(form, "Valor final total (R$)", "input", { type: "number", min: "0.01", max: "10000000", step: "0.01", required: true, value: current ? (current.valor_centavos / 100).toFixed(2) : "" });
      const partsTitle = el("p", "Separe o valor final em materiais, mão de obra e instalação. A soma deve ser igual ao total acima.");
      form.append(partsTitle);
      const partsBox = el("div", null, "proposal-parts-inputs");
      partInputs = Object.fromEntries(Object.entries(categories).map(([key, label]) => {
        const input = field(partsBox, `${label} (R$)`, "input", { type: "number", min: "0", max: "10000000", step: "0.01", required: true,
          value: current?.partes_valor_centavos ? (((current.partes_valor_centavos[key] || 0)
            + (key === "materiais" ? current.partes_valor_centavos.frete || 0 : 0)
            + (key === "mao_obra" ? current.partes_valor_centavos.outros || 0 : 0)) / 100).toFixed(2) : "0.00" });
        return [key, input];
      }));
      form.append(partsBox);
      deadline = field(form, "Prazo e a partir de quando começa a contar", "input", { maxLength: 300, required: true, placeholder: "Ex.: 15 dias úteis após a medição técnica", value: current?.prazo || "" });
      validity = field(form, "Validade da proposta (dias)", "input", { type: "number", min: "1", max: "180", required: true, value: current?.validade_dias || "15" });
      scope = field(form, "Escopo do serviço", "textarea", { maxLength: 3000, rows: 4, required: true, value: current?.escopo || "", placeholder: "Descreva exatamente o que será fabricado, fornecido e instalado." });
      const termsGrid = el("div", null, "proposal-commercial-grid");
      included = field(termsGrid, "O que está incluído", "textarea", { maxLength: 2000, rows: 3, value: current?.inclusos || "", placeholder: "Materiais, acessórios, transporte interno, instalação…" });
      excluded = field(termsGrid, "O que não está incluído", "textarea", { maxLength: 2000, rows: 3, value: current?.excluidos || "", placeholder: "Alvenaria, pintura, elétrica ou outros serviços não contratados." });
      payment = field(termsGrid, "Condições de pagamento", "textarea", { maxLength: 1200, rows: 3, required: true, value: current?.condicoes_pagamento || "", placeholder: "Ex.: entrada na aprovação e saldo conforme as etapas do serviço." });
      warranty = field(termsGrid, "Garantia", "textarea", { maxLength: 800, rows: 3, required: true, value: current?.garantia || "", placeholder: "Informe prazo, cobertura e condições, preservando a garantia legal." });
      visit = field(termsGrid, "Visita técnica e medição", "textarea", { maxLength: 800, rows: 3, required: true, value: current?.visita_tecnica || "", placeholder: "Explique quando haverá conferência de medidas e condições do local." });
      form.append(termsGrid);
      notes = field(form, "Observações adicionais", "textarea", { maxLength: 2000, rows: 4, value: current?.observacoes || "", placeholder: "Registre ressalvas e condições específicas deste projeto." });
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
      const parts = admin ? Object.fromEntries(Object.entries(partInputs).map(([key, input]) => [key, cents(input)])) : null;
      if (admin && Object.values(parts).reduce((sum, value) => sum + value, 0) !== cents(amount)) {
        status.textContent = "A soma dos valores separados precisa ser igual ao valor final total."; return;
      }
      busy = true;
      actions.querySelectorAll("button").forEach((b) => { b.disabled = true; });
      status.textContent = "Enviando…";
      try {
        const body = admin ? { versao: quote.proposta_versao, valor_centavos: cents(amount), partes_valor_centavos: parts,
          prazo: deadline.value, validade_dias: Number(validity.value), escopo: scope.value, inclusos: included.value,
          excluidos: excluded.value, condicoes_pagamento: payment.value, garantia: warranty.value,
          visita_tecnica: visit.value, observacoes: notes.value }
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
