(() => {
  const $ = (id) => document.getElementById(id);
  const categories = { porta: "Porta", janela: "Janela", box: "Box", fachada: "Fachada", guarda_corpo: "Guarda-corpo", fechamento: "Fechamento", espelho: "Espelhos e vidros", cobertura: "Cobertura", manutencao: "Manutenção", outro: "Outro" };
  const doorSpecs = (item) => item.categoria === "porta" ? [
    item.numero_folhas && item.numero_folhas !== "A definir" ? `${item.numero_folhas} folha${item.numero_folhas === "1" ? "" : "s"}` : "",
    item.configuracao_folhas, item.sentido_abertura && `Abertura: ${item.sentido_abertura}`,
    item.trilhos, item.fechadura && `Fechadura: ${item.fechadura}`, item.puxador && `Puxador: ${item.puxador}`,
    item.soleira && `Soleira: ${item.soleira}`, item.tipo_instalacao && `Instalação: ${item.tipo_instalacao}`,
    item.retirada_existente && `Retirada existente: ${item.retirada_existente}`,
    item.tela_mosquiteira && `Tela: ${item.tela_mosquiteira}`, item.automatizacao && `Automatização: ${item.automatizacao}`,
  ].filter((value) => value && !value.endsWith("A definir") && value !== "A definir").join(" · ") : "";
  const statusLabels = { recebido: "Recebido", em_analise: "Em análise", aguardando_cliente: "Aguardando cliente", aprovado: "Aprovado", concluido: "Concluído", cancelado: "Cancelado" };
  const productModels = {
    porta: ["De correr", "De giro", "Pivotante", "Camarão / articulada", "Porta-balcão", "Outro modelo"],
    janela: ["De correr", "Maxim-ar", "Basculante", "Guilhotina", "Fixa", "Outro modelo"],
    box: ["Frontal de correr", "De canto", "Box Open", "Até o teto", "Banheira", "Outro modelo"],
    fachada: ["Pele de vidro", "Structural glazing", "Fachada comercial", "Vitrine", "Outro modelo"],
    guarda_corpo: ["Com vidro", "Com alumínio", "Vidro autoportante", "Corrimão", "Outro modelo"],
    fechamento: ["Fechamento de varanda", "Área gourmet", "Divisória", "Cortina de vidro", "Outro modelo"],
    espelho: ["Espelho lapidado", "Espelho bisotê", "Espelho orgânico", "Espelho redondo", "Espelho para banheiro", "Espelho de camarim / LED", "Espelho de parede inteira", "Espelho bronze ou fumê", "Espelho com moldura", "Espelho decorativo", "Espelho sob medida", "Tampo de mesa", "Prateleira", "Painel de vidro", "Vidro sob medida", "Outro modelo"],
    cobertura: ["Cobertura de vidro", "Policarbonato", "Claraboia", "Toldo / estrutura", "Outro modelo"],
    manutencao: ["Troca de roldanas", "Troca de vidro", "Ajuste de esquadria", "Vedação", "Fechadura / puxador", "Outro reparo"],
    outro: ["Projeto sob medida", "Ainda não sei definir"],
  };
  const standardPriceColors = ["Branco", "Preto", "Bronze", "Natural fosco", "Amadeirado"];
  const ceilingBoxPriceColors = ["Branco", "Preto", "Bronze", "Cromada", "Dourado"];
  let quotes = [];
  let prices = [];
  let draftColorPrices = {};
  let draftDefaultPrice = { preco_m2_centavos: 0, preco_minimo_centavos: 0, instalacao_centavos: 0 };
  let activePriceColor = "";
  let feedbacks = [];
  let costData = { configuracao: {}, materiais: [], fichas: [], opcoes: { bases_calculo: {} } };
  let feedbackSummary = { total: 0, media: 0, cinco_estrelas: 0, recentes: 0 };
  const feedbackTypeLabels = { servico: "Serviço realizado", site: "Experiência no site", atendimento: "Atendimento", outro: "Outro assunto" };

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = content;
    return node;
  }
  function date(value) {
    if (!value) return "";
    const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  }
  function money(cents) {
    return Number.isSafeInteger(cents) ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100) : "A analisar";
  }
  function badge(status) {
    const positive = ["aprovado", "concluido"].includes(status);
    const neutral = ["cancelado"].includes(status);
    return element("span", `badge${positive ? " good" : neutral ? " muted" : ""}`, statusLabels[status] || status);
  }
  function message(text, success = false) {
    const target = $("admin-message");
    target.textContent = text;
    target.className = success ? "admin-message success" : "admin-message";
    target.hidden = !text;
    if (text) target.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function handleError(error) {
    if (error.status === 401) return location.replace("login.html?next=admin");
    if (error.status === 403) {
      $("admin-loading").hidden = true;
      $("admin-content").hidden = true;
      $("admin-denied").hidden = false;
      return;
    }
    message(error.message || "Não foi possível concluir.");
  }
  function showView(view) {
    document.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== view; });
    document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    document.querySelector(".admin-sidebar").classList.remove("open");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function compactQuote(quote) {
    const row = element("div", "compact-row");
    const info = element("div");
    info.append(element("strong", "", `${quote.codigo} · ${quote.nome}`));
    info.append(element("small", "", `${quote.itens.length} ${quote.itens.length === 1 ? "item" : "itens"} · ${date(quote.criado_em)}`));
    row.append(info, badge(quote.status));
    return row;
  }
  function renderRecent() {
    const target = $("recent-quotes"); target.replaceChildren();
    if (!quotes.length) return target.append(element("p", "empty", "Nenhuma solicitação recebida até agora."));
    quotes.slice(0, 5).forEach((quote) => target.append(compactQuote(quote)));
  }
  function renderQuotes() {
    const filter = $("quote-filter").value;
    const selected = filter ? quotes.filter((quote) => quote.status === filter) : quotes;
    const target = $("admin-quotes"); target.replaceChildren();
    if (!selected.length) return target.append(element("div", "empty", "Nenhum orçamento encontrado nesta situação."));
    selected.forEach((quote) => {
      const card = element("article", "quote-card");
      const head = element("div", "quote-head");
      const title = element("div"); title.append(element("h2", "", quote.codigo), element("p", "", `Recebido em ${date(quote.criado_em)}`));
      head.append(title, badge(quote.status));
      const body = element("div", "quote-body");
      const contact = element("div"); contact.append(element("h3", "", "Cliente"));
      contact.append(element("p", "", quote.nome), element("p", "", quote.telefone));
      if (quote.email) contact.append(element("p", "", quote.email));
      contact.append(element("p", "", [quote.bairro, quote.cidade].filter(Boolean).join(", ")));
      if (quote.observacoes) contact.append(element("p", "", `Observações: ${quote.observacoes}`));
      const itemColumn = element("div"); itemColumn.append(element("h3", "", "Itens solicitados"));
      const itemList = element("div", "quote-items");
      quote.itens.forEach((item, index) => {
        const box = element("div", "quote-item");
        box.append(element("strong", "", `${categories[item.categoria] || item.categoria} · ${item.modelo}`));
        box.append(element("small", "", `${item.largura_cm} × ${item.altura_cm} cm · ${item.quantidade} un. · ${item.material.replaceAll("_", " ")}${item.ambiente ? ` · ${item.ambiente}` : ""}`));
        const technical = [item.linha_aluminio, item.cor, item.tipo_vidro, item.composicao_vidro, item.espessura_vidro]
          .filter((value) => value && value !== "A definir").join(" · ");
        if (technical) box.append(element("small", "item-specifications", technical));
        if (doorSpecs(item)) box.append(element("small", "item-specifications", doorSpecs(item)));
        if (Array.isArray(item.acessorios) && item.acessorios.length) box.append(element("small", "item-specifications", `Acessórios: ${item.acessorios.join(" · ")}`));
        const detail = quote.estimativa_detalhes?.[index];
        if (detail) box.append(element("small", "item-estimate", `${detail.metodo === "composicao" ? "Valor por composição" : "Estimativa do item"}: ${money(detail.subtotal_centavos)}`));
        itemList.append(box);
      });
      itemColumn.append(itemList);
      const actions = element("div", "quote-actions");
      actions.append(element("h3", "", quote.tipo_calculo === "composicao" ? "Valor calculado" : "Atendimento"), element("p", "estimate", money(quote.estimativa_centavos)));
      if (quote.tipo_calculo === "composicao") actions.append(element("p", "", "Calculado pela ficha técnica e pelos custos vigentes no envio."));
      const label = element("label", "", "Alterar situação");
      const select = element("select");
      Object.entries(statusLabels).forEach(([value, text]) => {
        const option = element("option", "", text); option.value = value; option.selected = value === quote.status; select.append(option);
      });
      const save = element("button", "button primary", "Salvar situação");
      save.type = "button";
      save.addEventListener("click", async () => {
        save.disabled = true;
        try {
          await ContaAPI.request(`/api/admin/orcamentos/${quote.id}/status`, { method: "PUT", body: { status: select.value } });
          quote.status = select.value; message(`O orçamento ${quote.codigo} foi atualizado.`, true); renderQuotes(); renderRecent(); await loadSummary();
        } catch (error) { handleError(error); }
        finally { save.disabled = false; }
      });
      label.append(select); actions.append(label, save);
      if (quote.proposta_versao > 0) {
        label.hidden = true; save.hidden = true;
        actions.append(element("p", "", "Acompanhe a resposta do cliente na proposta abaixo."));
      }
      body.append(contact, itemColumn, actions); card.append(head, body); target.append(card);
      card.append(PropostasUI.render(quote, true, async (notice) => {
        quotes = (await ContaAPI.request("/api/admin/orcamentos")).orcamentos;
        renderQuotes(); renderRecent(); await loadSummary(); message(notice, true);
      }));
    });
  }
  function renderPrices() {
    const target = $("prices-list"); target.replaceChildren();
    $("prices-count").textContent = `${prices.length} ${prices.length === 1 ? "regra cadastrada" : "regras cadastradas"}.`;
    if (!prices.length) return target.append(element("div", "empty", "Cadastre o primeiro preço para ativar estimativas no formulário."));
    prices.forEach((price) => {
      const row = element("article", "price-row");
      const info = element("div"); info.append(element("h3", "", `${categories[price.categoria]} · ${price.modelo}`));
      info.append(element("p", "", `${price.ativo ? "Ativo" : "Inativo"} · Mínimo ${money(price.preco_minimo_centavos)} · Instalação ${money(price.instalacao_centavos)}`));
      const colorPrices = Object.entries(price.precos_cores || {});
      if (colorPrices.length) info.append(element("p", "price-colors", colorPrices.map(([color, value]) => {
        const values = typeof value === "number" ? { preco_m2_centavos: value } : value;
        return `${color}: ${money(values.preco_m2_centavos)}/m²`;
      }).join(" · ")));
      const edit = element("button", "", "Editar"); edit.type = "button";
      edit.addEventListener("click", () => editPrice(price));
      row.append(info, element("strong", "", `${money(price.preco_m2_centavos)}/m²`), edit); target.append(row);
    });
  }
  function stars(note) {
    const value = element("span", "admin-feedback-stars", "★".repeat(note) + "☆".repeat(5 - note));
    value.setAttribute("aria-label", `${note} de 5 estrelas`);
    return value;
  }
  function contactLink(value, type) {
    const digits = type === "phone" ? String(value).replace(/\D/g, "") : "";
    const shown = type === "phone" && /^\d{10,11}$/.test(digits)
      ? `(${digits.slice(0, 2)}) ${digits.length === 11 ? `${digits.slice(2, 7)}-${digits.slice(7)}` : `${digits.slice(2, 6)}-${digits.slice(6)}`}`
      : value;
    const link = element("a", "", shown);
    link.href = type === "email" ? `mailto:${value}` : `tel:+55${digits}`;
    return link;
  }
  function renderFeedbackSummary() {
    $("feedback-total").textContent = feedbackSummary.total.toLocaleString("pt-BR");
    $("feedback-average").textContent = Number(feedbackSummary.media).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    $("feedback-five").textContent = feedbackSummary.cinco_estrelas.toLocaleString("pt-BR");
    $("feedback-recent").textContent = feedbackSummary.recentes.toLocaleString("pt-BR");
  }
  function renderFeedbacks() {
    const query = $("feedback-search").value.trim().toLocaleLowerCase("pt-BR");
    const type = $("feedback-type-filter").value;
    const rating = Number($("feedback-rating-filter").value || 0);
    const selected = feedbacks.filter((item) => {
      const searchable = [item.nome, item.email, item.telefone, item.mensagem, feedbackTypeLabels[item.tipo]].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
      return (!query || searchable.includes(query)) && (!type || item.tipo === type) && (!rating || item.nota === rating);
    });
    const target = $("admin-feedbacks"); target.replaceChildren();
    $("feedback-results-count").textContent = `${selected.length} ${selected.length === 1 ? "feedback encontrado" : "feedbacks encontrados"}${selected.length !== feedbacks.length ? ` de ${feedbacks.length}` : ""}.`;
    $("feedback-clear-filters").hidden = !query && !type && !rating;
    if (!selected.length) return target.append(element("div", "empty feedback-empty", feedbacks.length ? "Nenhum feedback corresponde aos filtros escolhidos." : "Nenhum cliente enviou feedback até agora."));
    selected.forEach((item) => {
      const card = element("article", "admin-feedback-card");
      const head = element("div", "admin-feedback-head");
      const identity = element("div", "feedback-client");
      const initial = element("span", "feedback-client-avatar", (item.nome || "C").trim().charAt(0).toUpperCase());
      const name = element("div"); name.append(element("h2", "", item.nome), element("p", "", feedbackTypeLabels[item.tipo] || "Feedback"));
      identity.append(initial, name);
      const ratingBlock = element("div", "feedback-rating-block");
      ratingBlock.append(stars(item.nota), element("small", "", `${item.nota} de 5`));
      head.append(identity, ratingBlock);
      const comment = element("p", "admin-feedback-comment", item.mensagem);
      const footer = element("div", "admin-feedback-footer");
      const contacts = element("div", "feedback-contacts");
      if (item.email) contacts.append(contactLink(item.email, "email"));
      if (item.telefone) contacts.append(contactLink(item.telefone, "phone"));
      if (!item.email && !item.telefone) contacts.append(element("span", "", "Contato não informado"));
      footer.append(contacts, element("time", "", `Recebido em ${date(item.criado_em)}`));
      card.append(head, comment, footer); target.append(card);
    });
  }
  function modelSuggestions() {
    $("model-suggestions").replaceChildren(...(productModels[$("price-category").value] || []).map((value) => {
      const option = document.createElement("option"); option.value = value; return option;
    }));
  }
  function readVisiblePrice() {
    return {
      preco_m2_centavos: Math.round(Number($("price-square").value || 0) * 100),
      preco_minimo_centavos: Math.round(Number($("price-minimum").value || 0) * 100),
      instalacao_centavos: Math.round(Number($("price-installation").value || 0) * 100),
    };
  }
  function showPriceValues(values = {}) {
    $("price-square").value = values.preco_m2_centavos ? (values.preco_m2_centavos / 100).toFixed(2) : "";
    $("price-minimum").value = (Number(values.preco_minimo_centavos || 0) / 100).toFixed(2);
    $("price-installation").value = (Number(values.instalacao_centavos || 0) / 100).toFixed(2);
  }
  function storeVisiblePrice() {
    const values = readVisiblePrice();
    if (activePriceColor) draftColorPrices[activePriceColor] = values;
    else draftDefaultPrice = values;
  }
  function refreshPriceColorOptions(preserveCurrent = true) {
    if (preserveCurrent) storeVisiblePrice();
    const isCeilingBox = $("price-category").value === "box" && $("price-model").value.trim() === "Até o teto";
    const allowedColors = isCeilingBox ? ceilingBoxPriceColors : standardPriceColors;
    if (isCeilingBox) {
      delete draftColorPrices["Natural fosco"];
      delete draftColorPrices.Amadeirado;
    } else {
      delete draftColorPrices.Cromada;
      delete draftColorPrices.Dourado;
    }
    const requestedColor = allowedColors.includes(activePriceColor) ? activePriceColor : "";
    const options = [{ value: "", label: "Preço padrão / outras cores" }, ...allowedColors.map((color) => ({ value: color, label: color }))];
    $("price-color-select").replaceChildren(...options.map(({ value, label }) => {
      const option = document.createElement("option"); option.value = value; option.textContent = label; return option;
    }));
    activePriceColor = requestedColor;
    $("price-color-select").value = requestedColor;
    showPriceValues(requestedColor ? draftColorPrices[requestedColor] : draftDefaultPrice);
  }
  function normalizeColorPrice(value, fallback) {
    return typeof value === "number"
      ? { preco_m2_centavos: value, preco_minimo_centavos: fallback.preco_minimo_centavos, instalacao_centavos: fallback.instalacao_centavos }
      : { ...fallback, ...(value || {}) };
  }
  function editPrice(price) {
    $("price-id").value = price.id;
    $("price-category").value = price.categoria;
    modelSuggestions();
    $("price-model").value = price.modelo;
    $("price-description").value = price.descricao || "";
    draftDefaultPrice = { preco_m2_centavos: price.preco_m2_centavos, preco_minimo_centavos: price.preco_minimo_centavos, instalacao_centavos: price.instalacao_centavos };
    draftColorPrices = Object.fromEntries(Object.entries(price.precos_cores || {}).map(([color, value]) => [color, normalizeColorPrice(value, draftDefaultPrice)]));
    activePriceColor = ""; refreshPriceColorOptions(false);
    $("price-active").checked = price.ativo;
    $("price-form-title").textContent = "Editar preço";
    $("price-cancel").hidden = false;
    $("price-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function clearPriceForm() {
    $("price-form").reset(); $("price-id").value = ""; $("price-minimum").value = "0"; $("price-installation").value = "0"; $("price-active").checked = true;
    draftDefaultPrice = { preco_m2_centavos: 0, preco_minimo_centavos: 0, instalacao_centavos: 0 }; draftColorPrices = {}; activePriceColor = ""; refreshPriceColorOptions(false);
    $("price-form-title").textContent = "Novo preço"; $("price-cancel").hidden = true; modelSuggestions();
  }
  function percentFromBp(value) { return (Number(value || 0) / 100).toFixed(2); }
  function centsFromInput(id) { return Math.round(Number($(id).value || 0) * 100); }
  function bpFromInput(id) { return Math.round(Number($(id).value || 0) * 100); }
  function units(value) { return costData.opcoes.unidades?.[value] || value; }

  function fillCostSettings() {
    const item = costData.configuracao;
    $("cost-margin").value = percentFromBp(item.margem_bp);
    $("cost-taxes").value = percentFromBp(item.impostos_bp);
    $("cost-payment-fee").value = percentFromBp(item.taxa_pagamento_bp);
    $("cost-overhead").value = (Number(item.despesa_fixa_centavos || 0) / 100).toFixed(2);
    $("cost-freight").value = (Number(item.frete_base_centavos || 0) / 100).toFixed(2);
  }

  function renderMaterials() {
    const target = $("materials-list"); target.replaceChildren();
    $("materials-count").textContent = `${costData.materiais.length} ${costData.materiais.length === 1 ? "item cadastrado" : "itens cadastrados"}.`;
    if (!costData.materiais.length) return target.append(element("div", "empty", "Cadastre os materiais, serviços e horas de mão de obra usados na fabricação."));
    costData.materiais.forEach((item) => {
      const row = element("article", "cost-row");
      const info = element("div"); info.append(element("h3", "", `${item.codigo} · ${item.nome}`));
      info.append(element("p", item.custo_confirmado ? "" : "unconfirmed", `${costData.opcoes.tipos_custo?.[item.tipo_custo] || "Materiais"} · ${item.grupo} · ${item.fornecedor || "Sem fornecedor"} · ${item.custo_confirmado ? "custo confirmado" : "aguardando conferência"}${item.ativo ? "" : " · inativo"}`));
      const edit = element("button", "", "Editar"); edit.type = "button"; edit.addEventListener("click", () => editMaterial(item));
      row.append(info, element("strong", "", `${money(item.custo_unitario_centavos)}/${units(item.unidade)}`), edit); target.append(row);
    });
  }

  function editMaterial(item) {
    $("material-id").value = item.id; $("material-code").value = item.codigo; $("material-name").value = item.nome;
    $("material-group").value = item.grupo; $("material-type").value = item.tipo_custo || "materiais"; $("material-unit").value = item.unidade;
    $("material-cost").value = (item.custo_unitario_centavos / 100).toFixed(2); $("material-waste").value = percentFromBp(item.perda_padrao_bp);
    $("material-date").value = item.referencia_em || ""; $("material-supplier").value = item.fornecedor || "";
    $("material-confirmed").checked = item.custo_confirmado; $("material-active").checked = item.ativo;
    $("material-form-title").textContent = "Editar material ou serviço"; $("material-cancel").hidden = false;
    $("material-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function clearMaterialForm() {
    $("material-form").reset(); $("material-id").value = ""; $("material-waste").value = "0"; $("material-active").checked = true;
    $("material-form-title").textContent = "Novo material ou serviço"; $("material-cancel").hidden = true;
  }

  function populateCostSelects() {
    $("component-material").replaceChildren(...costData.materiais.filter((item) => item.ativo).map((item) => {
      const option = element("option", "", `${item.codigo} · ${item.nome}`); option.value = item.id; return option;
    }));
    $("component-recipe").replaceChildren(...costData.fichas.filter((item) => item.ativo).map((item) => {
      const option = element("option", "", `${categories[item.categoria]} · ${item.modelo}`); option.value = item.id; return option;
    }));
    $("component-base").replaceChildren(...Object.entries(costData.opcoes.bases_calculo || {}).map(([value, label]) => {
      const option = element("option", "", label); option.value = value; return option;
    }));
    const ready = costData.fichas.filter((ficha) => ficha.ativo && ficha.validada && ficha.componentes.length && ficha.componentes.every((component) => {
      const material = costData.materiais.find((item) => item.id === component.material_id);
      return material?.ativo && material?.custo_confirmado;
    })).length;
    $("cost-status").textContent = `${ready} ${ready === 1 ? "ficha pronta" : "fichas prontas"} para cálculo real`;
  }

  function renderRecipes() {
    const target = $("recipes-list"); target.replaceChildren();
    $("recipes-count").textContent = `${costData.fichas.length} ${costData.fichas.length === 1 ? "ficha cadastrada" : "fichas cadastradas"}.`;
    if (!costData.fichas.length) return target.append(element("div", "empty", "Crie uma ficha para cada modelo que será calculado pelos custos reais."));
    costData.fichas.forEach((ficha) => {
      const card = element("article", "recipe-card"); const head = element("div", "recipe-head"); const title = element("div");
      title.append(element("h3", "", `${categories[ficha.categoria]} · ${ficha.modelo}`), element("p", ficha.validada ? "" : "unconfirmed", `Versão ${ficha.versao} · mínimo ${money(ficha.preco_minimo_centavos)} · ${ficha.validada ? "revisada" : "aguardando revisão"}${ficha.ativo ? "" : " · inativa"}`));
      const edit = element("button", "", "Editar ficha"); edit.type = "button"; edit.addEventListener("click", () => editRecipe(ficha)); head.append(title, edit); card.append(head);
      const list = element("ul", "component-list");
      if (!ficha.componentes.length) list.append(element("li", "", "Nenhum componente. Esta ficha ainda não calcula preços."));
      ficha.componentes.forEach((component) => {
        const li = element("li"); const info = element("span", "", `${component.codigo} · ${component.nome}`);
        const factor = component.fator_milesimos / 1000; const fixed = component.adicional_milesimos / 1000;
        info.append(element("small", "", `${costData.opcoes.bases_calculo[component.base_calculo]} × ${factor}${fixed ? ` + ${fixed}` : ""}${component.condicao_campo ? ` · somente ${component.condicao_campo}: ${component.condicao_valor}` : ""}${component.somente_instalacao ? " · instalação" : ""}`));
        const remove = element("button", "component-remove", "Remover"); remove.type = "button";
        remove.addEventListener("click", async () => {
          remove.disabled = true;
          try { await ContaAPI.request(`/api/admin/custos/componentes/${component.id}`, { method: "DELETE" }); await reloadCosts(); message("Componente removido da ficha.", true); }
          catch (error) { handleError(error); remove.disabled = false; }
        });
        li.append(info, remove); list.append(li);
      });
      card.append(list); target.append(card);
    });
  }

  function editRecipe(ficha) {
    $("recipe-id").value = ficha.id; $("recipe-category").value = ficha.categoria; recipeSuggestions();
    $("recipe-model").value = ficha.modelo; $("recipe-minimum").value = (ficha.preco_minimo_centavos / 100).toFixed(2); $("recipe-validated").checked = ficha.validada; $("recipe-active").checked = ficha.ativo;
    $("recipe-form-title").textContent = "Editar ficha técnica"; $("recipe-cancel").hidden = false; $("recipe-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function clearRecipeForm() {
    $("recipe-form").reset(); $("recipe-id").value = ""; $("recipe-minimum").value = "0"; $("recipe-validated").checked = false; $("recipe-active").checked = true;
    $("recipe-form-title").textContent = "Nova ficha técnica"; $("recipe-cancel").hidden = true; recipeSuggestions();
  }

  function recipeSuggestions() {
    $("recipe-model-suggestions").replaceChildren(...(productModels[$("recipe-category").value] || []).map((value) => {
      const option = document.createElement("option"); option.value = value; return option;
    }));
  }

  async function reloadCosts() {
    costData = await ContaAPI.request("/api/admin/custos");
    fillCostSettings(); renderMaterials(); renderRecipes(); populateCostSelects();
  }
  async function loadSummary() {
    const summary = await ContaAPI.request("/api/admin/resumo");
    $("metric-pending").textContent = summary.orcamentos.pendentes;
    $("metric-quotes").textContent = summary.orcamentos.total;
    $("metric-approved").textContent = summary.orcamentos.aprovados;
    $("metric-prices").textContent = summary.precos_ativos;
  }
  async function load() {
    try {
      const [profile, summary, quoteData, priceData, feedbackData, loadedCosts] = await Promise.all([
        ContaAPI.request("/api/perfil"), ContaAPI.request("/api/admin/resumo"),
        ContaAPI.request("/api/admin/orcamentos"), ContaAPI.request("/api/admin/precos"), ContaAPI.request("/api/admin/feedbacks"), ContaAPI.request("/api/admin/custos"),
      ]);
      $("admin-name").textContent = profile.usuario.nome;
      quotes = quoteData.orcamentos; prices = priceData.precos;
      feedbacks = feedbackData.feedbacks; feedbackSummary = feedbackData.resumo;
      costData = loadedCosts;
      $("metric-pending").textContent = summary.orcamentos.pendentes;
      $("metric-quotes").textContent = summary.orcamentos.total;
      $("metric-approved").textContent = summary.orcamentos.aprovados;
      $("metric-prices").textContent = summary.precos_ativos;
      renderRecent(); renderQuotes(); renderPrices(); renderFeedbackSummary(); renderFeedbacks(); modelSuggestions();
      fillCostSettings(); renderMaterials(); renderRecipes(); populateCostSelects(); recipeSuggestions();
      $("admin-loading").hidden = true; $("admin-content").hidden = false;
    } catch (error) { handleError(error); $("admin-loading").hidden = true; }
  }

  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.go)));
  $("quote-filter").addEventListener("change", renderQuotes);
  $("feedback-search").addEventListener("input", renderFeedbacks);
  $("feedback-type-filter").addEventListener("change", renderFeedbacks);
  $("feedback-rating-filter").addEventListener("change", renderFeedbacks);
  $("feedback-clear-filters").addEventListener("click", () => {
    $("feedback-search").value = ""; $("feedback-type-filter").value = ""; $("feedback-rating-filter").value = ""; renderFeedbacks();
  });
  $("price-category").addEventListener("change", () => { modelSuggestions(); refreshPriceColorOptions(); });
  $("price-model").addEventListener("input", () => refreshPriceColorOptions());
  $("price-color-select").addEventListener("change", () => {
    storeVisiblePrice();
    activePriceColor = $("price-color-select").value;
    showPriceValues(activePriceColor ? draftColorPrices[activePriceColor] : draftDefaultPrice);
  });
  refreshPriceColorOptions(false);
  $("price-cancel").addEventListener("click", clearPriceForm);
  $("price-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    storeVisiblePrice();
    if (!draftDefaultPrice.preco_m2_centavos && activePriceColor) draftDefaultPrice = { ...draftColorPrices[activePriceColor] };
    const id = $("price-id").value;
    const body = {
      categoria: $("price-category").value, modelo: $("price-model").value,
      descricao: $("price-description").value,
      precos_cores: { ...draftColorPrices },
      ...draftDefaultPrice,
      ativo: $("price-active").checked,
    };
    const submit = event.currentTarget.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      await ContaAPI.request(id ? `/api/admin/precos/${id}` : "/api/admin/precos", { method: id ? "PUT" : "POST", body });
      prices = (await ContaAPI.request("/api/admin/precos")).precos;
      renderPrices(); clearPriceForm(); await loadSummary(); message(id ? "Preço atualizado com sucesso." : "Preço cadastrado com sucesso.", true);
    } catch (error) { handleError(error); }
    finally { submit.disabled = false; }
  });
  $("cost-settings-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const submit = event.currentTarget.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      await ContaAPI.request("/api/admin/custos/configuracao", { method: "PUT", body: {
        margem_bp: bpFromInput("cost-margin"), impostos_bp: bpFromInput("cost-taxes"), taxa_pagamento_bp: bpFromInput("cost-payment-fee"),
        despesa_fixa_centavos: centsFromInput("cost-overhead"), frete_base_centavos: centsFromInput("cost-freight"),
      } });
      await reloadCosts(); message("Configuração comercial atualizada.", true);
    } catch (error) { handleError(error); }
    finally { submit.disabled = false; }
  });
  $("material-cancel").addEventListener("click", clearMaterialForm);
  $("material-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const id = $("material-id").value; const submit = event.currentTarget.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      await ContaAPI.request(id ? `/api/admin/custos/materiais/${id}` : "/api/admin/custos/materiais", { method: id ? "PUT" : "POST", body: {
        codigo: $("material-code").value, nome: $("material-name").value, grupo: $("material-group").value, tipo_custo: $("material-type").value, unidade: $("material-unit").value,
        custo_unitario_centavos: centsFromInput("material-cost"), perda_padrao_bp: bpFromInput("material-waste"), fornecedor: $("material-supplier").value,
        referencia_em: $("material-date").value, custo_confirmado: $("material-confirmed").checked, ativo: $("material-active").checked,
      } });
      clearMaterialForm(); await reloadCosts(); message(id ? "Material atualizado." : "Material cadastrado.", true);
    } catch (error) { handleError(error); }
    finally { submit.disabled = false; }
  });
  $("recipe-category").addEventListener("change", recipeSuggestions);
  $("recipe-cancel").addEventListener("click", clearRecipeForm);
  $("recipe-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const id = $("recipe-id").value; const submit = event.currentTarget.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      await ContaAPI.request(id ? `/api/admin/custos/fichas/${id}` : "/api/admin/custos/fichas", { method: id ? "PUT" : "POST", body: {
        categoria: $("recipe-category").value, modelo: $("recipe-model").value,
        preco_minimo_centavos: centsFromInput("recipe-minimum"), validada: $("recipe-validated").checked, ativo: $("recipe-active").checked,
      } });
      clearRecipeForm(); await reloadCosts(); message(id ? "Ficha técnica atualizada." : "Ficha técnica cadastrada.", true);
    } catch (error) { handleError(error); }
    finally { submit.disabled = false; }
  });
  $("component-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const submit = event.currentTarget.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      const conditionField = $("component-condition-field").value;
      await ContaAPI.request("/api/admin/custos/componentes", { method: "POST", body: {
        ficha_id: Number($("component-recipe").value), material_id: Number($("component-material").value), base_calculo: $("component-base").value,
        fator_milesimos: Math.round(Number($("component-factor").value) * 1000), adicional_milesimos: Math.round(Number($("component-fixed").value) * 1000),
        perda_bp: $("component-waste").value === "" ? null : bpFromInput("component-waste"),
        condicao_campo: conditionField, condicao_valor: conditionField ? $("component-condition-value").value : "",
        somente_instalacao: $("component-installation").checked,
      } });
      const selectedRecipe = $("component-recipe").value; event.currentTarget.reset(); $("component-factor").value = "1"; $("component-fixed").value = "0";
      await reloadCosts(); $("component-recipe").value = selectedRecipe; message("Componente adicionado à ficha.", true);
    } catch (error) { handleError(error); }
    finally { submit.disabled = false; }
  });
  $("mobile-menu").addEventListener("click", () => document.querySelector(".admin-sidebar").classList.toggle("open"));
  $("admin-logout").addEventListener("click", async () => {
    try { await ContaAPI.request("/api/sair", { method: "POST" }); location.replace("index.html"); }
    catch (error) { handleError(error); }
  });
  load();
})();
