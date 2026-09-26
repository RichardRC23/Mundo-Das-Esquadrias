document.addEventListener("DOMContentLoaded", () => {
  const categoryNames = {
    porta: "Porta", janela: "Janela", box: "Box de banheiro", fachada: "Fachada",
    guarda_corpo: "Guarda-corpo", fechamento: "Fechamento", espelho: "Espelho ou vidro",
    cobertura: "Cobertura", manutencao: "Manutenção", outro: "Outro projeto",
  };
  const models = {
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
  const materialNames = {
    aluminio_vidro: "Alumínio com vidro", aluminio: "Somente alumínio", vidro: "Somente vidro",
    manutencao: "Manutenção / reparo", outro: "A definir",
  };

  const items = [];
  const catalog = new Map();
  let step = 1;
  let selected = null;
  let draftAdded = false;
  const form = document.getElementById("quote-form");
  const steps = [...document.querySelectorAll(".step")];
  const progress = [...document.querySelectorAll("[data-progress]")];
  const productCards = [...document.querySelectorAll(".product-card")];
  const modelInput = document.getElementById("item-modelo");
  const materialInput = document.getElementById("item-material");
  const addButton = document.getElementById("add-item");
  const itemError = document.getElementById("item-error");

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);

  function showStep(nextStep, shouldScroll = true) {
    step = nextStep;
    steps.forEach((panel) => panel.classList.toggle("active", Number(panel.dataset.step) === step));
    progress.forEach((item) => {
      const number = Number(item.dataset.progress);
      item.classList.toggle("active", number === step);
      item.classList.toggle("done", number < step);
      if (number < step) item.querySelector("span").textContent = "✓";
      else item.querySelector("span").textContent = String(number);
    });
    document.getElementById("progress-fill").style.width = `${((step - 1) / 3) * 100}%`;
    if (shouldScroll) document.querySelector(".quote-shell").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function chooseProduct(card) {
    productCards.forEach((item) => item.classList.toggle("selected", item === card));
    selected = {
      categoria: card.dataset.category,
      material: card.dataset.material,
      nome: categoryNames[card.dataset.category],
    };
    draftAdded = false;
    document.getElementById("product-error").textContent = "";
    modelInput.innerHTML = models[selected.categoria]
      .map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("");
    materialInput.value = selected.material;
    updateMaterialFields();
    addButton.disabled = false;
    addButton.textContent = "＋ Adicionar este item ao orçamento";
    document.getElementById("selected-product").innerHTML = `<strong>${escapeHtml(selected.nome)}</strong><button type="button" id="change-product">Trocar produto</button>`;
    document.getElementById("change-product").addEventListener("click", () => showStep(1));
  }

  function updateMaterialFields() {
    const material = materialInput.value;
    const hasAluminum = ["aluminio_vidro", "aluminio"].includes(material);
    const hasGlass = ["aluminio_vidro", "vidro"].includes(material);
    document.getElementById("color-field").hidden = !hasAluminum;
    document.querySelectorAll(".aluminum-field").forEach((field) => { field.hidden = !hasAluminum; });
    document.querySelectorAll(".glass-field").forEach((field) => { field.hidden = !hasGlass; });
  }

  function value(id) { return document.getElementById(id).value.trim(); }

  function currentItem() {
    const material = materialInput.value;
    const hasAluminum = ["aluminio_vidro", "aluminio"].includes(material);
    const hasGlass = ["aluminio_vidro", "vidro"].includes(material);
    return {
      categoria: selected.categoria,
      material,
      modelo: modelInput.value,
      linha_aluminio: hasAluminum ? value("item-linha-aluminio") : "",
      cor: hasAluminum ? document.querySelector('input[name="cor"]:checked')?.value || "A definir" : "",
      tipo_vidro: hasGlass ? value("item-vidro") : "",
      composicao_vidro: hasGlass ? value("item-composicao-vidro") : "",
      espessura_vidro: hasGlass ? value("item-espessura") : "",
      largura_cm: Number(value("item-largura")),
      altura_cm: Number(value("item-altura")),
      quantidade: Number(value("item-quantidade")),
      ambiente: value("item-ambiente"),
      detalhes: value("item-detalhes"),
    };
  }

  function validateItem(item) {
    ["item-largura", "item-altura", "item-quantidade"].forEach((id) => document.getElementById(id).classList.remove("invalid"));
    if (!item.largura_cm || item.largura_cm < 10 || item.largura_cm > 1500) {
      document.getElementById("item-largura").classList.add("invalid");
      return "Informe uma largura aproximada entre 10 e 1.500 cm.";
    }
    if (!item.altura_cm || item.altura_cm < 10 || item.altura_cm > 1500) {
      document.getElementById("item-altura").classList.add("invalid");
      return "Informe uma altura aproximada entre 10 e 1.500 cm.";
    }
    if (!Number.isInteger(item.quantidade) || item.quantidade < 1 || item.quantidade > 50) {
      document.getElementById("item-quantidade").classList.add("invalid");
      return "Informe uma quantidade entre 1 e 50.";
    }
    return "";
  }

  function addCurrentItem() {
    if (!selected) return false;
    if (draftAdded) return true;
    if (items.length >= 10) {
      itemError.textContent = "Cada solicitação pode ter até 10 itens.";
      return false;
    }
    const item = currentItem();
    const error = validateItem(item);
    itemError.textContent = error;
    if (error) return false;
    items.push(item);
    draftAdded = true;
    addButton.disabled = true;
    addButton.textContent = "✓ Item adicionado";
    renderItems();
    return true;
  }

  function renderItems() {
    const panel = document.getElementById("items-panel");
    panel.hidden = items.length === 0;
    document.getElementById("another-item").hidden = items.length === 0;
    document.getElementById("items-count").textContent = `${items.length} ${items.length === 1 ? "item" : "itens"}`;
    document.getElementById("items-list").innerHTML = items.map((item, index) => `
      <div class="item-row">
        <p><strong>${escapeHtml(categoryNames[item.categoria])} · ${escapeHtml(item.modelo)}</strong>
        <small>${item.largura_cm} × ${item.altura_cm} cm · ${escapeHtml(materialNames[item.material])} · ${item.quantidade} un.</small></p>
        <button type="button" data-remove="${index}" aria-label="Remover ${escapeHtml(categoryNames[item.categoria])}">Remover</button>
      </div>`).join("");
    document.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => {
      items.splice(Number(button.dataset.remove), 1);
      draftAdded = false;
      addButton.disabled = false;
      addButton.textContent = "＋ Adicionar este item ao orçamento";
      renderItems();
    }));
  }

  function contactPayload() {
    return {
      nome: value("contact-name"), telefone: value("contact-phone"), email: value("contact-email"),
      cidade: value("contact-city"), bairro: value("contact-neighborhood"),
      instalacao: document.querySelector('input[name="instalacao"]:checked')?.value !== "nao",
      observacoes: value("contact-notes"), itens: items,
    };
  }

  function validateContact(data) {
    if (!data.nome) return "Informe seu nome completo.";
    if (!/^\d{10,13}$/.test(data.telefone.replace(/\D/g, ""))) return "Informe um telefone com DDD.";
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return "Informe um e-mail válido ou deixe o campo vazio.";
    if (!data.cidade) return "Informe a cidade da instalação.";
    return "";
  }

  function renderReview() {
    const data = contactPayload();
    const estimate = calculateEstimate(data.instalacao);
    document.getElementById("review-content").innerHTML = `
      <section class="review-section"><h3>Itens do orçamento</h3>${items.map((item, index) => `
        <div class="review-item"><span class="review-number">${index + 1}</span><div>
          <strong>${escapeHtml(categoryNames[item.categoria])} · ${escapeHtml(item.modelo)}</strong>
          <p>${item.largura_cm} × ${item.altura_cm} cm · ${escapeHtml(materialNames[item.material])}${item.linha_aluminio ? ` · ${escapeHtml(item.linha_aluminio)}` : ""}${item.cor ? ` · ${escapeHtml(item.cor)}` : ""}${item.tipo_vidro ? ` · Vidro ${escapeHtml(item.tipo_vidro)}` : ""}${item.composicao_vidro ? ` ${escapeHtml(item.composicao_vidro)}` : ""}</p>
          ${item.ambiente ? `<p>Ambiente: ${escapeHtml(item.ambiente)}</p>` : ""}
        </div><span class="review-qty">${item.quantidade} un.</span></div>`).join("")}</section>
      <section class="review-section"><h3>Contato e local</h3><div class="contact-summary">
        <span><strong>Responsável:</strong> ${escapeHtml(data.nome)}</span>
        <span><strong>Telefone:</strong> ${escapeHtml(data.telefone)}</span>
        <span><strong>Local:</strong> ${escapeHtml([data.bairro, data.cidade].filter(Boolean).join(", "))}</span>
        <span><strong>Instalação:</strong> ${data.instalacao ? "Sim, incluir" : "Não, só fornecimento"}</span>
      </div></section>`;
    const notice = document.getElementById("price-notice");
    if (estimate != null) {
      notice.innerHTML = `<span>i</span><p><strong>Estimativa inicial: ${money(estimate)}</strong> Este valor usa a tabela atual por metro quadrado, medidas informadas e instalação. O preço final será confirmado após avaliação técnica.</p>`;
    } else {
      notice.innerHTML = "<span>i</span><p><strong>Por que o valor não aparece agora?</strong> Ainda não há preço cadastrado para todos os itens. A equipe confirmará materiais, ferragens, acesso e instalação antes de informar o valor final.</p>";
    }
  }

  function money(cents) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  }

  function calculateEstimate(installation) {
    let total = 0;
    for (const item of items) {
      const rule = catalog.get(`${item.categoria}\u0000${item.modelo}`);
      if (!rule) return null;
      const area = item.largura_cm * item.altura_cm / 10000;
      const product = Math.max(Math.round(area * rule.preco_m2_centavos), rule.preco_minimo_centavos);
      total += (product + (installation ? rule.instalacao_centavos : 0)) * item.quantidade;
    }
    return total;
  }

  function resetItemForm() {
    productCards.forEach((card) => card.classList.remove("selected"));
    selected = null;
    draftAdded = false;
    document.getElementById("item-largura").value = "";
    document.getElementById("item-altura").value = "";
    document.getElementById("item-quantidade").value = "1";
    document.getElementById("item-ambiente").value = "";
    document.getElementById("item-detalhes").value = "";
    addButton.disabled = false;
    addButton.textContent = "＋ Adicionar este item ao orçamento";
  }

  productCards.forEach((card) => card.addEventListener("click", () => chooseProduct(card)));
  materialInput.addEventListener("change", updateMaterialFields);
  addButton.addEventListener("click", addCurrentItem);
  document.getElementById("another-item").addEventListener("click", () => { resetItemForm(); showStep(1); });

  document.querySelectorAll("[data-next]").forEach((button) => button.addEventListener("click", () => {
    if (step === 1) {
      if (!selected) {
        document.getElementById("product-error").textContent = "Escolha um produto ou serviço para continuar.";
        return;
      }
      showStep(2);
      return;
    }
    if (step === 2) {
      if (!addCurrentItem() || items.length === 0) return;
      showStep(3);
      return;
    }
    if (step === 3) {
      const error = validateContact(contactPayload());
      document.getElementById("contact-error").textContent = error;
      if (error) return;
      renderReview();
      showStep(4);
    }
  }));
  document.querySelectorAll("[data-back]").forEach((button) => button.addEventListener("click", () => showStep(Math.max(1, step - 1))));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorElement = document.getElementById("submit-error");
    if (!document.getElementById("quote-consent").checked) {
      errorElement.textContent = "Confirme a autorização de contato para enviar.";
      return;
    }
    const button = document.getElementById("submit-quote");
    button.disabled = true;
    button.textContent = "Enviando...";
    errorElement.textContent = "";
    const data = contactPayload();
    try {
      const result = await ContaAPI.request("/api/orcamentos", { method: "POST", body: data });
      const code = result.orcamento.codigo;
      document.getElementById("success-code").textContent = code;
      const estimateElement = document.getElementById("success-estimate");
      if (Number.isSafeInteger(result.orcamento.estimativa_centavos)) {
        estimateElement.textContent = `Estimativa inicial registrada: ${money(result.orcamento.estimativa_centavos)}. O valor final depende da conferência técnica.`;
        estimateElement.hidden = false;
      }
      const summary = items.map((item, index) => `${index + 1}. ${categoryNames[item.categoria]} - ${item.modelo} - ${item.largura_cm}x${item.altura_cm} cm - ${item.quantidade} un.`).join("\n");
      const message = `Olá! Acabei de registrar o orçamento ${code} pelo site.\n\n${summary}\n\nNome: ${data.nome}\nCidade: ${data.cidade}\nInstalação: ${data.instalacao ? "Sim" : "Não"}`;
      document.getElementById("whatsapp-link").href = `https://wa.me/5521964070134?text=${encodeURIComponent(message)}`;
      form.hidden = true;
      document.querySelector(".progress-wrap").hidden = true;
      document.getElementById("quote-success").hidden = false;
      document.querySelector(".quote-shell").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      errorElement.textContent = error.message;
      button.disabled = false;
      button.innerHTML = "Enviar solicitação <span>→</span>";
    }
  });

  async function prefillAccount() {
    try {
      const { usuario } = await ContaAPI.request("/api/perfil");
      document.getElementById("contact-name").value = usuario.nome || "";
      document.getElementById("contact-email").value = usuario.email || "";
      document.getElementById("contact-phone").value = usuario.telefone || "";
      const link = document.getElementById("quote-account-link");
      link.textContent = "Minha conta";
      link.href = "perfil.html";
    } catch { /* Anonymous customers fill their contact details manually. */ }
  }

  async function loadCatalog() {
    try {
      const { precos } = await ContaAPI.request("/api/catalogo/precos");
      precos.forEach((price) => catalog.set(`${price.categoria}\u0000${price.modelo}`, price));
    } catch { /* A quote can still be requested without an automatic estimate. */ }
  }

  prefillAccount();
  loadCatalog();
  showStep(1, false);
});
