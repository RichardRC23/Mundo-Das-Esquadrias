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
  const boxSpecs = (item) => item.categoria === "box" && item.tipo_caixa && !/Caixa (Redonda|Quadrada)$/i.test(item.modelo) ? `Formato: ${item.tipo_caixa}` : "";
  const statusLabels = { recebido: "Recebido", em_analise: "Em análise", aguardando_cliente: "Aguardando cliente", aprovado: "Aprovado", concluido: "Concluído", cancelado: "Cancelado" };
  const productModels = {
    porta: ["De correr", "De giro", "Pivotante", "Camarão / articulada", "Porta-balcão", "Outro modelo"],
    janela: ["De correr", "Maxim-ar", "Basculante", "Guilhotina", "Fixa", "Outro modelo"],
    box: [
      "Frontal de Correr F1 Caixa Redonda", "Frontal de Correr F1 Caixa Quadrada",
      "Frontal de Correr F2 Caixa Redonda", "Frontal de Correr F2 Caixa Quadrada",
      "Frontal de Correr F3 Caixa Redonda", "Frontal de Correr F3 Caixa Quadrada",
      "Box até o teto Caixa Redonda", "Box até o teto Caixa Quadrada",
      "Box Open", "Box Flex Camarão", "Box Elegance", "Box Moove",
    ],
    fachada: ["Pele de vidro", "Structural glazing", "Fachada comercial", "Vitrine", "Outro modelo"],
    guarda_corpo: ["Com vidro", "Com alumínio", "Vidro autoportante", "Corrimão", "Outro modelo"],
    fechamento: ["Fechamento de varanda", "Área gourmet", "Divisória", "Cortina de vidro", "Outro modelo"],
    espelho: ["Espelho lapidado", "Espelho bisotê", "Espelho orgânico", "Espelho redondo", "Espelho para banheiro", "Espelho de camarim / LED", "Espelho de parede inteira", "Espelho bronze ou fumê", "Espelho com moldura", "Espelho decorativo", "Espelho sob medida", "Tampo de mesa", "Prateleira", "Painel de vidro", "Vidro sob medida", "Outro modelo"],
    cobertura: ["Cobertura de vidro", "Policarbonato", "Claraboia", "Toldo / estrutura", "Outro modelo"],
    manutencao: ["Troca de roldanas", "Troca de vidro", "Ajuste de esquadria", "Vedação", "Fechadura / puxador", "Outro reparo"],
    outro: ["Projeto sob medida", "Ainda não sei definir"],
  };
  const standardPriceColors = ["Branco", "Preto", "Bronze", "Cromada", "Dourado"];
  const ceilingBoxPriceColors = [...standardPriceColors, "Inox escovado"];
  const glassPriceColors = ["Incolor", "Fumê", "Verde", "Bronze"];
  const aluminumLines = ["Linha 16", "Linha 20", "Linha 25", "Linha 30", "Suprema", "Gold", "Modular", "Fachada", "Outro perfil"];
  let quotes = [];
  let prices = [];
  const selectedPriceIds = new Set();
  let priceFormDirty = false;
  let draftColorPrices = {};
  let draftGlassPrices = {};
  let draftLinePrices = {};
  let draftCombinationPrices = {};
  let draftDefaultPrice = { preco_m2_centavos: 0, preco_minimo_centavos: 0, instalacao_centavos: 0 };
  let activePriceColor = "";
  let activePriceVariation = "aluminio";
  let selectedAluminumColor = "";
  let selectedGlassColor = "";
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
        if (boxSpecs(item)) box.append(element("small", "item-specifications", boxSpecs(item)));
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
    const variationLabel = activePriceVariation === "vidro" ? "Vidro" : activePriceVariation === "linha" ? "Linha" : "Alumínio";
    $("prices-view-label").textContent = activePriceColor ? `Exibindo: ${variationLabel} · ${activePriceColor}` : "Exibindo preço padrão";
    if (!prices.length) {
      $("prices-count").textContent = "Nenhuma regra cadastrada.";
      return target.append(element("div", "empty", "Cadastre o primeiro preço para ativar estimativas no formulário."));
    }
    const query = $("prices-search").value.trim().toLocaleLowerCase("pt-BR");
    const categoryFilter = $("prices-category-filter").value;
    const modelFilter = $("prices-model-filter").value;
    const completenessFilter = $("prices-completeness-filter").value;
    const visiblePrices = prices.filter((price) => {
      const searchable = [categories[price.categoria], price.modelo, price.descricao,
        ...Object.keys(price.precos_linhas || {}), ...Object.keys(price.precos_cores || {}), ...Object.keys(price.precos_vidros || {})]
        .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
      const incomplete = isPriceIncomplete(price);
      return searchable.includes(query) && (!categoryFilter || price.categoria === categoryFilter)
        && (!modelFilter || `${price.categoria}::${price.modelo}` === modelFilter)
        && (!completenessFilter || (completenessFilter === "incompleto") === incomplete);
    });
    const filtering = query || categoryFilter || modelFilter || completenessFilter;
    $("prices-count").textContent = filtering
      ? `${visiblePrices.length} de ${prices.length} ${prices.length === 1 ? "regra encontrada" : "regras encontradas"}.`
      : `${prices.length} ${prices.length === 1 ? "regra cadastrada" : "regras cadastradas"}.`;
    if (!visiblePrices.length) return target.append(element("div", "empty", "Nenhum preço encontrado. Tente outro termo."));
    visiblePrices.forEach((price) => {
      const row = element("article", "price-row");
      const selection = element("input", "price-row-check"); selection.type = "checkbox"; selection.checked = selectedPriceIds.has(price.id);
      selection.setAttribute("aria-label", `Selecionar ${categories[price.categoria]} ${price.modelo}`);
      selection.addEventListener("change", () => { selection.checked ? selectedPriceIds.add(price.id) : selectedPriceIds.delete(price.id); updateBulkCount(); });
      const info = element("div"); info.append(element("h3", "", `${categories[price.categoria]} · ${price.modelo}`));
      info.append(element("p", "", `${price.ativo ? "Ativo" : "Inativo"} · Mínimo ${money(price.preco_minimo_centavos)} · Instalação ${money(price.instalacao_centavos)}`));
      info.append(element("p", isPriceIncomplete(price) ? "price-incomplete" : "price-complete", isPriceIncomplete(price) ? "Cadastro incompleto: revise as linhas ou o preço base." : "Cadastro completo."));
      const colorPrices = Object.entries(price.precos_cores || {});
      if (colorPrices.length) info.append(element("p", "price-colors", colorPrices.map(([color, value]) => {
        const values = normalizePriceVariant(value, price);
        return `${color}: ${priceSummary(values)}`;
      }).join(" · ")));
      const glassPrices = Object.entries(price.precos_vidros || {});
      if (glassPrices.length) info.append(element("p", "price-glasses", `Vidros: ${glassPrices.map(([color, value]) => {
        const values = normalizePriceVariant(value, price);
        return `${color}: ${priceSummary(values)}`;
      }).join(" · ")}`));
      const linePrices = Object.entries(price.precos_linhas || {});
      if (linePrices.length) info.append(element("p", "price-lines", `Linhas: ${linePrices.map(([line, value]) => `${line}: ${priceSummary(value)}`).join(" · ")}`));
      const edit = element("button", "", "Editar"); edit.type = "button";
      edit.addEventListener("click", () => editPrice(price));
      const variations = activePriceVariation === "vidro" ? price.precos_vidros : activePriceVariation === "linha" ? price.precos_linhas : price.precos_cores;
      const selectedPrice = activePriceColor ? variations?.[activePriceColor] : null;
      const displayedCents = typeof selectedPrice === "number" ? selectedPrice : selectedPrice?.preco_m2_centavos;
      const displayedPrice = activePriceColor
        ? displayedCents == null ? "Não cadastrado" : `${money(displayedCents)}/m²`
        : `${money(price.preco_m2_centavos)}/m²`;
      row.append(selection, info, element("strong", "", displayedPrice), edit); target.append(row);
    });
    updateBulkCount();
  }
  function isPriceIncomplete(price) {
    if (!Number(price.preco_m2_centavos)) return true;
    if (["porta", "janela"].includes(price.categoria)) return aluminumLines.some((line) => !price.precos_linhas?.[line]?.preco_m2_centavos);
    return false;
  }
  function normalizePriceVariant(value, base) {
    if (typeof value === "number") return { preco_m2_centavos: value, preco_minimo_centavos: base.preco_minimo_centavos, instalacao_centavos: base.instalacao_centavos };
    return { preco_minimo_centavos: base.preco_minimo_centavos, instalacao_centavos: base.instalacao_centavos, ...(value || {}) };
  }
  function priceSummary(value) {
    return `${money(value.preco_m2_centavos)}/m² · mín. ${money(value.preco_minimo_centavos || 0)} · inst. ${money(value.instalacao_centavos || 0)}`;
  }
  function updateBulkCount() {
    const count = selectedPriceIds.size;
    $("prices-selected-count").textContent = `${count} ${count === 1 ? "selecionado" : "selecionados"}`;
  }
  function refreshPriceFilters() {
    const category = $("prices-category-filter").value;
    const oldModel = $("prices-model-filter").value;
    const categoriesPresent = [...new Set(prices.map((price) => price.categoria))];
    $("prices-category-filter").replaceChildren(new Option("Todas", ""), ...categoriesPresent.map((key) => new Option(categories[key] || key, key)));
    $("prices-category-filter").value = category;
    const modelOptions = prices.filter((price) => !category || price.categoria === category);
    $("prices-model-filter").replaceChildren(new Option("Todos", ""), ...modelOptions.map((price) => new Option(`${categories[price.categoria]} · ${price.modelo}`, `${price.categoria}::${price.modelo}`)));
    $("prices-model-filter").value = [...$("prices-model-filter").options].some((option) => option.value === oldModel) ? oldModel : "";
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
  function modelSuggestions(selectedValue = "") {
    const values = [...(productModels[$("price-category").value] || [])];
    if (selectedValue && !values.includes(selectedValue)) values.unshift(selectedValue);
    $("price-model").replaceChildren(...values.map((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      return option;
    }));
    if (selectedValue) $("price-model").value = selectedValue;
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
    const variations = activePriceVariation === "vidro" ? draftGlassPrices : activePriceVariation === "linha" ? draftLinePrices : draftColorPrices;
    if (activePriceColor && values.preco_m2_centavos > 0) variations[activePriceColor] = values;
    else if (activePriceColor) delete variations[activePriceColor];
    else draftDefaultPrice = values;
  }
  function refreshPriceColorOptions(preserveCurrent = true) {
    if (preserveCurrent) storeVisiblePrice();
    const isCeilingBox = $("price-category").value === "box" && /^Box até o teto Caixa (?:Redonda|Quadrada)$/i.test($("price-model").value.trim());
    const isLinePrice = activePriceVariation === "linha";
    const isGlass = activePriceVariation === "vidro";
    const aluminumColors = isCeilingBox ? ceilingBoxPriceColors : standardPriceColors;
    selectedAluminumColor = (isLinePrice ? aluminumLines : aluminumColors).includes(selectedAluminumColor) ? selectedAluminumColor : "";
    selectedGlassColor = glassPriceColors.includes(selectedGlassColor) ? selectedGlassColor : "";
    activePriceColor = isGlass ? selectedGlassColor : selectedAluminumColor;
    const variations = isGlass ? draftGlassPrices : isLinePrice ? draftLinePrices : draftColorPrices;
    $("price-line-select").replaceChildren(...[{ value: "", label: "Selecione a linha" }, ...aluminumLines.map((line) => ({ value: line, label: line }))].map(({ value, label }) => {
      const option = document.createElement("option"); option.value = value; option.textContent = label; return option;
    }));
    $("price-line-select").value = isLinePrice ? (selectedAluminumColor || "") : "";
    $("price-line-card").hidden = !["porta", "janela"].includes($("price-category").value);
    const aluminumOptions = [
      { value: "", label: "Selecione a cor ou kit", disabled: true },
      { value: "__default", label: "Preço padrão / outros acabamentos" },
      ...aluminumColors.map((color) => ({ value: color, label: color })),
    ];
    $("price-aluminum-select").replaceChildren(...aluminumOptions.map(({ value, label, disabled }) => {
      const option = document.createElement("option"); option.value = value; option.textContent = label; option.disabled = Boolean(disabled); return option;
    }));
    $("price-glass-select").replaceChildren(
      ...[{ value: "", label: "Selecione o vidro", disabled: true }, ...glassPriceColors.map((color) => ({ value: color, label: color }))].map(({ value, label, disabled }) => {
        const option = document.createElement("option"); option.value = value; option.textContent = label; option.disabled = Boolean(disabled); return option;
      }),
    );
    $("price-aluminum-select").value = selectedAluminumColor || "__default";
    $("price-glass-select").value = selectedGlassColor;
    $("price-aluminum-card").classList.toggle("active", !isGlass && !isLinePrice);
    $("price-glass-card").classList.toggle("active", isGlass);
    $("price-line-card").classList.toggle("active", isLinePrice);
    $("price-selection-label").textContent = isGlass
      ? `Editando vidro: ${selectedGlassColor || "selecione uma opção"}`
      : isLinePrice ? `Editando linha: ${selectedAluminumColor || "selecione uma opção"}`
        : `Editando alumínio/kit: ${selectedAluminumColor || "preço padrão"}`;
    const visiblePrice = activePriceColor && Object.hasOwn(variations, activePriceColor)
      ? variations[activePriceColor]
      : activePriceColor ? {} : draftDefaultPrice;
    showPriceValues(visiblePrice);
    renderPrices();
  }
  function normalizeColorPrice(value, fallback) {
    return typeof value === "number"
      ? { preco_m2_centavos: value, preco_minimo_centavos: fallback.preco_minimo_centavos, instalacao_centavos: fallback.instalacao_centavos }
      : { ...fallback, ...(value || {}) };
  }
  function editPrice(price, scroll = true) {
    priceFormDirty = false;
    $("price-id").value = price.id;
    $("price-category").value = price.categoria;
    modelSuggestions(price.modelo);
    $("price-description").value = price.descricao || "";
    draftDefaultPrice = { preco_m2_centavos: price.preco_m2_centavos, preco_minimo_centavos: price.preco_minimo_centavos, instalacao_centavos: price.instalacao_centavos };
    draftColorPrices = Object.fromEntries(Object.entries(price.precos_cores || {}).map(([color, value]) => [color, normalizeColorPrice(value, draftDefaultPrice)]));
    draftGlassPrices = Object.fromEntries(Object.entries(price.precos_vidros || {}).map(([color, value]) => [color, normalizeColorPrice(value, draftDefaultPrice)]));
    draftLinePrices = Object.fromEntries(Object.entries(price.precos_linhas || {}));
    draftCombinationPrices = { ...(price.precos_combinacoes || {}) };
    activePriceVariation = "aluminio";
    selectedAluminumColor = "";
    selectedGlassColor = "";
    activePriceColor = ""; refreshPriceColorOptions(false);
    $("price-active").checked = price.ativo;
    $("price-form-title").textContent = "Editar preço";
    $("price-cancel").hidden = false;
    if (scroll) $("price-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function prepareNewPriceForSelectedModel() {
    priceFormDirty = false;
    $("price-id").value = "";
    $("price-description").value = "";
    draftDefaultPrice = { preco_m2_centavos: 0, preco_minimo_centavos: 0, instalacao_centavos: 0 };
    draftColorPrices = {};
    draftGlassPrices = {};
    draftLinePrices = {};
    draftCombinationPrices = {};
    activePriceVariation = "aluminio";
    selectedAluminumColor = "";
    selectedGlassColor = "";
    activePriceColor = "";
    $("price-active").checked = true;
    refreshPriceColorOptions(false);
    $("price-form-title").textContent = "Novo preço";
    $("price-cancel").hidden = true;
  }
  function loadSelectedPrice() {
    const selectedPrice = prices.find((price) => price.categoria === $("price-category").value && price.modelo === $("price-model").value);
    if (selectedPrice) editPrice(selectedPrice, false);
    else prepareNewPriceForSelectedModel();
  }
  function clearPriceForm() {
    priceFormDirty = false;
    $("price-form").reset(); $("price-id").value = ""; $("price-minimum").value = "0"; $("price-installation").value = "0"; $("price-active").checked = true;
    draftDefaultPrice = { preco_m2_centavos: 0, preco_minimo_centavos: 0, instalacao_centavos: 0 }; draftColorPrices = {}; draftGlassPrices = {}; draftLinePrices = {}; draftCombinationPrices = {}; activePriceVariation = "aluminio"; selectedAluminumColor = ""; selectedGlassColor = ""; activePriceColor = ""; refreshPriceColorOptions(false);
    $("price-form-title").textContent = "Novo preço"; $("price-cancel").hidden = true; modelSuggestions();
  }
  function csvCell(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
  function parseCsv(source) {
    source = source.replace(/^\uFEFF/, "");
    const rows = []; let row = []; let cell = ""; let quoted = false;
    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (quoted && char === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { row.push(cell); cell = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && source[i + 1] === "\n") i += 1; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += char;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((values) => values.some((value) => value.trim()));
  }
  function exportPricesCsv() {
    const columns = ["categoria", "modelo", "descricao", "preco_m2_centavos", "preco_minimo_centavos", "instalacao_centavos", "ativo", "precos_cores_json", "precos_vidros_json", "precos_linhas_json", "precos_combinacoes_json"];
    const lines = [columns.map(csvCell).join(","), ...prices.map((price) => columns.map((column) => {
      if (column === "ativo") return csvCell(price.ativo ? "true" : "false");
      if (column.endsWith("_json")) return csvCell(JSON.stringify(column === "precos_cores_json" ? price.precos_cores || {} : column === "precos_vidros_json" ? price.precos_vidros || {} : column === "precos_linhas_json" ? price.precos_linhas || {} : price.precos_combinacoes || {}));
      return csvCell(price[column]);
    }).join(","))];
    const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `precos-mundo-das-esquadrias-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  async function importPricesCsv(file) {
    const rows = parseCsv(await file.text());
    if (rows.length < 2) throw new Error("O CSV não contém linhas de preços.");
    const headers = rows[0].map((header) => header.trim());
    const required = ["categoria", "modelo", "preco_m2_centavos", "preco_minimo_centavos", "instalacao_centavos"];
    if (required.some((key) => !headers.includes(key))) throw new Error("Use o modelo CSV exportado pelo painel para importar.");
    const index = Object.fromEntries(headers.map((header, position) => [header, position]));
    const staged = rows.slice(1).map((cells) => Object.fromEntries(headers.map((header) => [header, cells[index[header]] ?? ""])));
    const updates = staged.map((row) => {
      const current = prices.find((price) => price.categoria === row.categoria && price.modelo === row.modelo);
      if (!current) return null;
      const readJson = (name, fallback) => row[name] ? JSON.parse(row[name]) : fallback;
      return { current, body: { ...current, categoria: row.categoria, modelo: row.modelo, descricao: row.descricao || "",
        preco_m2_centavos: Number(row.preco_m2_centavos), preco_minimo_centavos: Number(row.preco_minimo_centavos), instalacao_centavos: Number(row.instalacao_centavos),
        ativo: row.ativo !== "false", precos_cores: readJson("precos_cores_json", current.precos_cores || {}),
        precos_vidros: readJson("precos_vidros_json", current.precos_vidros || {}), precos_linhas: readJson("precos_linhas_json", current.precos_linhas || {}),
        precos_combinacoes: readJson("precos_combinacoes_json", current.precos_combinacoes || {}) } };
    }).filter(Boolean);
    if (!updates.length) throw new Error("Não encontrei modelos do CSV que correspondam aos preços cadastrados.");
    if (!window.confirm(`O arquivo tem ${updates.length} modelo(s) correspondente(s). A importação vai atualizar esses preços. Continuar?`)) return;
    for (const update of updates) await ContaAPI.request(`/api/admin/precos/${update.current.id}`, { method: "PUT", body: update.body });
    prices = (await ContaAPI.request("/api/admin/precos")).precos; refreshPriceFilters(); renderPrices(); await loadSummary();
    message(`${updates.length} preço(s) importado(s). Itens sem correspondência foram ignorados.`, true);
  }
  async function applyBulkPriceChanges() {
    const chosen = prices.filter((price) => selectedPriceIds.has(price.id));
    if (!chosen.length) return message("Selecione pelo menos um preço na lista.");
    const fields = [["bulk-price-square", "preco_m2_centavos"], ["bulk-price-minimum", "preco_minimo_centavos"], ["bulk-price-installation", "instalacao_centavos"]];
    const changes = Object.fromEntries(fields.filter(([id]) => $(id).value !== "").map(([id, key]) => [key, Math.round(Number($(id).value) * 100)]));
    if (!Object.keys(changes).length) return message("Preencha pelo menos um valor para aplicar.");
    if (!window.confirm(`Aplicar os campos preenchidos em ${chosen.length} modelos? Os preços por linha, cor e vidro serão preservados.`)) return;
    for (const price of chosen) await ContaAPI.request(`/api/admin/precos/${price.id}`, { method: "PUT", body: { ...price, ...changes,
      precos_cores: price.precos_cores || {}, precos_vidros: price.precos_vidros || {}, precos_linhas: price.precos_linhas || {}, precos_combinacoes: price.precos_combinacoes || {} } });
    prices = (await ContaAPI.request("/api/admin/precos")).precos; selectedPriceIds.clear(); refreshPriceFilters(); renderPrices(); await loadSummary();
    fields.forEach(([id]) => { $(id).value = ""; }); message(`Preços atualizados em ${chosen.length} modelos.`, true);
  }
  async function loadPriceHistory() {
    const { historico } = await ContaAPI.request("/api/admin/precos/historico");
    const target = $("prices-history-list"); target.replaceChildren();
    if (!historico.length) return target.append(element("p", "", "Ainda não há alterações registradas."));
    historico.forEach((entry) => {
      const row = element("article", "price-history-row");
      row.append(element("strong", "", `${categories[entry.categoria] || entry.categoria} · ${entry.modelo}`));
      row.append(element("p", "", `${entry.acao} por ${entry.administrador_nome} · ${new Date(`${entry.criado_em}Z`).toLocaleString("pt-BR")}`));
      if (entry.antes || entry.depois) row.append(element("small", "", `${entry.antes ? money(entry.antes.preco_m2_centavos) : "Novo"} → ${money(entry.depois?.preco_m2_centavos || 0)} por m²`));
      target.append(row);
    });
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
      refreshPriceFilters(); renderRecent(); renderQuotes(); renderPrices(); renderFeedbackSummary(); renderFeedbacks(); modelSuggestions();
      fillCostSettings(); renderMaterials(); renderRecipes(); populateCostSelects(); recipeSuggestions();
      $("admin-loading").hidden = true; $("admin-content").hidden = false;
    } catch (error) { handleError(error); $("admin-loading").hidden = true; }
  }

  const confirmPriceNavigation = (target) => !priceFormDirty || document.querySelector('[data-panel="precos"]')?.hidden || target === "precos" || window.confirm("Há alterações de preço ainda não salvas. Deseja sair desta tela?");
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => { if (confirmPriceNavigation(button.dataset.view)) showView(button.dataset.view); }));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => { if (confirmPriceNavigation(button.dataset.go)) showView(button.dataset.go); }));
  window.addEventListener("beforeunload", (event) => { if (priceFormDirty) { event.preventDefault(); event.returnValue = ""; } });
  $("quote-filter").addEventListener("change", renderQuotes);
  $("feedback-search").addEventListener("input", renderFeedbacks);
  $("feedback-type-filter").addEventListener("change", renderFeedbacks);
  $("feedback-rating-filter").addEventListener("change", renderFeedbacks);
  $("feedback-clear-filters").addEventListener("click", () => {
    $("feedback-search").value = ""; $("feedback-type-filter").value = ""; $("feedback-rating-filter").value = ""; renderFeedbacks();
  });
  $("price-category").addEventListener("change", () => { modelSuggestions(); loadSelectedPrice(); });
  $("price-model").addEventListener("change", loadSelectedPrice);
  $("prices-search").addEventListener("input", renderPrices);
  $("prices-category-filter").addEventListener("change", () => { refreshPriceFilters(); renderPrices(); });
  $("prices-model-filter").addEventListener("change", renderPrices);
  $("prices-completeness-filter").addEventListener("change", renderPrices);
  $("prices-export").addEventListener("click", exportPricesCsv);
  $("prices-import-trigger").addEventListener("click", () => $("prices-import-file").click());
  $("prices-import-file").addEventListener("change", async (event) => {
    const [file] = event.currentTarget.files || [];
    if (!file) return;
    try { await importPricesCsv(file); } catch (error) { handleError(error); }
    finally { event.currentTarget.value = ""; }
  });
  $("prices-bulk-save").addEventListener("click", () => applyBulkPriceChanges().catch(handleError));
  $("prices-history-refresh").addEventListener("click", () => loadPriceHistory().catch(handleError));
  document.querySelector(".price-history").addEventListener("toggle", (event) => { if (event.currentTarget.open) loadPriceHistory().catch(handleError); });
  const markPriceFormDirty = (event) => {
    if (["price-description", "price-square", "price-minimum", "price-installation", "price-active"].includes(event.target.id)) priceFormDirty = true;
  };
  $("price-form").addEventListener("input", markPriceFormDirty);
  $("price-form").addEventListener("change", markPriceFormDirty);
  $("price-aluminum-select").addEventListener("change", () => {
    storeVisiblePrice();
    activePriceVariation = "aluminio";
    selectedAluminumColor = $("price-aluminum-select").value === "__default" ? "" : $("price-aluminum-select").value;
    activePriceColor = selectedAluminumColor;
    refreshPriceColorOptions(false);
  });
  $("price-glass-select").addEventListener("change", () => {
    storeVisiblePrice();
    activePriceVariation = "vidro";
    selectedGlassColor = $("price-glass-select").value;
    activePriceColor = selectedGlassColor;
    refreshPriceColorOptions(false);
  });
  $("price-line-select").addEventListener("change", () => {
    storeVisiblePrice();
    activePriceVariation = "linha";
    selectedAluminumColor = $("price-line-select").value;
    activePriceColor = selectedAluminumColor;
    refreshPriceColorOptions(false);
  });
  refreshPriceColorOptions(false);
  $("price-cancel").addEventListener("click", clearPriceForm);
  $("price-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    storeVisiblePrice();
    if (!draftDefaultPrice.preco_m2_centavos && activePriceColor) {
      const variations = activePriceVariation === "vidro" ? draftGlassPrices : activePriceVariation === "linha" ? draftLinePrices : draftColorPrices;
      draftDefaultPrice = { ...variations[activePriceColor] };
    }
    const id = $("price-id").value;
    const body = {
      categoria: $("price-category").value, modelo: $("price-model").value,
      descricao: $("price-description").value,
      precos_cores: { ...draftColorPrices },
      precos_vidros: { ...draftGlassPrices },
      precos_linhas: { ...draftLinePrices },
      precos_combinacoes: { ...draftCombinationPrices },
      ...draftDefaultPrice,
      ativo: $("price-active").checked,
    };
    const submit = event.currentTarget.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      await ContaAPI.request(id ? `/api/admin/precos/${id}` : "/api/admin/precos", { method: id ? "PUT" : "POST", body });
      prices = (await ContaAPI.request("/api/admin/precos")).precos;
      priceFormDirty = false;
      refreshPriceFilters(); renderPrices(); clearPriceForm(); await loadSummary(); message(id ? "Preço atualizado com sucesso." : "Preço cadastrado com sucesso.", true);
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
