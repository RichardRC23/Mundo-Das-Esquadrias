(() => {
  const $ = (id) => document.getElementById(id);
  const categories = { porta: "Porta", janela: "Janela", box: "Box", fachada: "Fachada", guarda_corpo: "Guarda-corpo", fechamento: "Fechamento", espelho: "Espelho ou vidro", cobertura: "Cobertura", manutencao: "Manutenção", outro: "Outro" };
  const statusLabels = { recebido: "Recebido", em_analise: "Em análise", aguardando_cliente: "Aguardando cliente", aprovado: "Aprovado", concluido: "Concluído", cancelado: "Cancelado" };
  const productModels = {
    porta: ["De correr", "De giro", "Pivotante", "Camarão / articulada", "Porta-balcão", "Outro modelo"],
    janela: ["De correr", "Maxim-ar", "Basculante", "Guilhotina", "Fixa", "Outro modelo"],
    box: ["Frontal de correr", "De canto", "De abrir", "Até o teto", "Banheira", "Outro modelo"],
    fachada: ["Pele de vidro", "Structural glazing", "Fachada comercial", "Vitrine", "Outro modelo"],
    guarda_corpo: ["Com vidro", "Com alumínio", "Vidro autoportante", "Corrimão", "Outro modelo"],
    fechamento: ["Fechamento de varanda", "Área gourmet", "Divisória", "Cortina de vidro", "Outro modelo"],
    espelho: ["Espelho lapidado", "Tampo de mesa", "Prateleira", "Painel de vidro", "Vidro sob medida", "Outro modelo"],
    cobertura: ["Cobertura de vidro", "Policarbonato", "Claraboia", "Toldo / estrutura", "Outro modelo"],
    manutencao: ["Troca de roldanas", "Troca de vidro", "Ajuste de esquadria", "Vedação", "Fechadura / puxador", "Outro reparo"],
    outro: ["Projeto sob medida", "Ainda não sei definir"],
  };
  let quotes = [];
  let prices = [];

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
      quote.itens.forEach((item) => {
        const box = element("div", "quote-item");
        box.append(element("strong", "", `${categories[item.categoria] || item.categoria} · ${item.modelo}`));
        box.append(element("small", "", `${item.largura_cm} × ${item.altura_cm} cm · ${item.quantidade} un. · ${item.material.replaceAll("_", " ")}${item.ambiente ? ` · ${item.ambiente}` : ""}`));
        itemList.append(box);
      });
      itemColumn.append(itemList);
      const actions = element("div", "quote-actions"); actions.append(element("h3", "", "Atendimento"), element("p", "estimate", money(quote.estimativa_centavos)));
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
      body.append(contact, itemColumn, actions); card.append(head, body); target.append(card);
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
      const edit = element("button", "", "Editar"); edit.type = "button";
      edit.addEventListener("click", () => editPrice(price));
      row.append(info, element("strong", "", `${money(price.preco_m2_centavos)}/m²`), edit); target.append(row);
    });
  }
  function modelSuggestions() {
    $("model-suggestions").replaceChildren(...(productModels[$("price-category").value] || []).map((value) => {
      const option = document.createElement("option"); option.value = value; return option;
    }));
  }
  function editPrice(price) {
    $("price-id").value = price.id;
    $("price-category").value = price.categoria;
    modelSuggestions();
    $("price-model").value = price.modelo;
    $("price-description").value = price.descricao || "";
    $("price-square").value = (price.preco_m2_centavos / 100).toFixed(2);
    $("price-minimum").value = (price.preco_minimo_centavos / 100).toFixed(2);
    $("price-installation").value = (price.instalacao_centavos / 100).toFixed(2);
    $("price-active").checked = price.ativo;
    $("price-form-title").textContent = "Editar preço";
    $("price-cancel").hidden = false;
    $("price-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function clearPriceForm() {
    $("price-form").reset(); $("price-id").value = ""; $("price-minimum").value = "0"; $("price-installation").value = "0"; $("price-active").checked = true;
    $("price-form-title").textContent = "Novo preço"; $("price-cancel").hidden = true; modelSuggestions();
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
      const [profile, summary, quoteData, priceData] = await Promise.all([
        ContaAPI.request("/api/perfil"), ContaAPI.request("/api/admin/resumo"),
        ContaAPI.request("/api/admin/orcamentos"), ContaAPI.request("/api/admin/precos"),
      ]);
      $("admin-name").textContent = profile.usuario.nome;
      quotes = quoteData.orcamentos; prices = priceData.precos;
      $("metric-pending").textContent = summary.orcamentos.pendentes;
      $("metric-quotes").textContent = summary.orcamentos.total;
      $("metric-approved").textContent = summary.orcamentos.aprovados;
      $("metric-prices").textContent = summary.precos_ativos;
      renderRecent(); renderQuotes(); renderPrices(); modelSuggestions();
      $("admin-loading").hidden = true; $("admin-content").hidden = false;
    } catch (error) { handleError(error); $("admin-loading").hidden = true; }
  }

  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.go)));
  $("quote-filter").addEventListener("change", renderQuotes);
  $("price-category").addEventListener("change", modelSuggestions);
  $("price-cancel").addEventListener("click", clearPriceForm);
  $("price-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = $("price-id").value;
    const body = {
      categoria: $("price-category").value, modelo: $("price-model").value,
      descricao: $("price-description").value,
      preco_m2_centavos: Math.round(Number($("price-square").value) * 100),
      preco_minimo_centavos: Math.round(Number($("price-minimum").value || 0) * 100),
      instalacao_centavos: Math.round(Number($("price-installation").value || 0) * 100),
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
  $("mobile-menu").addEventListener("click", () => document.querySelector(".admin-sidebar").classList.toggle("open"));
  $("admin-logout").addEventListener("click", async () => {
    try { await ContaAPI.request("/api/sair", { method: "POST" }); location.replace("index.html"); }
    catch (error) { handleError(error); }
  });
  load();
})();
