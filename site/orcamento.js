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
  const frameFinishes = {
    Branco: ["#f7f7f2", "#c9ced0"], Preto: ["#1d2328", "#080b0d"], Bronze: ["#76543e", "#3f2b20"],
    "Natural fosco": ["#c2c9cc", "#7f898e"], Amadeirado: ["#9a6034", "#4d2c18"], "A definir": ["#aeb8bd", "#68757c"],
  };
  const glassFinishes = {
    Incolor: ["rgba(198,235,247,.48)", "rgba(102,176,207,.22)"], Fumê: ["rgba(75,91,101,.64)", "rgba(25,37,45,.42)"],
    Verde: ["rgba(113,184,166,.54)", "rgba(45,111,102,.3)"], Bronze: ["rgba(177,133,91,.56)", "rgba(92,60,38,.3)"],
    "Extra clear": ["rgba(224,249,251,.38)", "rgba(142,221,228,.18)"], Refletivo: ["rgba(124,174,198,.72)", "rgba(62,107,133,.5)"],
    "Jateado ou fantasia": ["rgba(225,235,237,.86)", "rgba(170,188,193,.66)"], Espelho: ["rgba(195,207,214,.94)", "rgba(86,105,117,.75)"],
    "A definir": ["rgba(198,235,247,.48)", "rgba(102,176,207,.22)"],
  };
  const realisticImages = {
    porta: "img/orcamento-realista/porta.webp", janela: "img/orcamento-realista/janela.webp",
    box: "img/orcamento-realista/box.webp", fachada: "img/orcamento-realista/fachada.webp",
    guarda_corpo: "img/orcamento-realista/guarda-corpo.webp", fechamento: "img/orcamento-realista/fechamento.webp",
    espelho: "img/orcamento-realista/espelho.webp", cobertura: "img/orcamento-realista/cobertura.webp",
    manutencao: "img/orcamento-realista/manutencao.webp", outro: "img/orcamento-realista/outro.webp",
  };
  const doorSpecificationLabels = {
    numero_folhas: "Folhas", configuracao_folhas: "Configuração", sentido_abertura: "Abertura",
    trilhos: "Trilhos", fechadura: "Fechadura", puxador: "Puxador", soleira: "Soleira",
    tipo_instalacao: "Instalação", retirada_existente: "Retirada existente",
    tela_mosquiteira: "Tela mosquiteira", automatizacao: "Automatização",
  };

  const items = [];
  const catalog = new Map();
  let priceAdjustments = {};
  let priceReference = null;
  let step = 1;
  let selected = null;
  let draftAdded = false;
  let latestAccess = null;
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

  function doorModelClass(model) {
    if (/camarão|articulada/i.test(model)) return "door-folding";
    if (/pivotante/i.test(model)) return "door-pivot";
    if (/giro/i.test(model)) return "door-swing";
    if (/balcão/i.test(model)) return "door-balcony";
    return "door-sliding";
  }

  function configuredDoorVisual(item) {
    const inferredLeaves = /correr|balcão/i.test(item.modelo) ? 2 : 1;
    const leaves = Math.min(8, Math.max(1, Number.parseInt(item.numero_folhas, 10) || inferredLeaves));
    const [frame, frameShadow] = frameFinishes[item.cor] || frameFinishes["A definir"];
    const [glass, glassShadow] = glassFinishes[item.tipo_vidro] || glassFinishes["A definir"];
    const thickness = Math.min(12, Math.max(4, Number.parseInt(item.espessura_vidro, 10) || 6));
    const ratio = Math.min(1.9, Math.max(.56, Number(item.largura_cm) / Number(item.altura_cm) || .86));
    const line = /suprema/i.test(item.linha_aluminio) ? "line-suprema" : /gold/i.test(item.linha_aluminio) ? "line-gold" : /fachada/i.test(item.linha_aluminio) ? "line-facade" : "line-standard";
    const handle = item.puxador && !/sem|definir/i.test(item.puxador) ? item.puxador : "";
    const lock = item.fechadura && !/sem|definir/i.test(item.fechadura) ? item.fechadura : "";
    const direction = /direita/i.test(item.sentido_abertura) ? "open-right" : /esquerda/i.test(item.sentido_abertura) ? "open-left" : "open-center";
    const threshold = /sem soleira/i.test(item.soleira) ? "threshold-none" : /embutida/i.test(item.soleira) ? "threshold-embedded" : /baixa/i.test(item.soleira) ? "threshold-low" : "threshold-standard";
    const materialClass = item.material === "aluminio" ? "solid-panels" : item.material === "vidro" ? "frameless-panels" : "";
    const activeLeaf = Math.max(0, Math.floor((leaves - 1) / 2));
    const panels = Array.from({ length: leaves }, (_, index) => `<span class="configured-door-leaf${index === activeLeaf ? " active-leaf" : ""}" style="--leaf:${index}">
      <span class="configured-glass"><i></i></span>
      ${index === activeLeaf ? `${handle ? `<span class="configured-handle ${/tubular|alça/i.test(handle) ? "long-handle" : ""}" title="Puxador ${escapeHtml(handle)}"></span>` : ""}${lock ? `<span class="configured-lock${/digital/i.test(lock) ? " digital-lock" : ""}" title="Fechadura ${escapeHtml(lock)}"></span>` : ""}` : ""}
    </span>`).join("");
    const railCount = Math.min(4, Math.max(0, Number.parseInt(item.trilhos, 10) || (/correr/i.test(item.modelo) ? 2 : 0)));
    const rails = Array.from({ length: railCount }, (_, index) => `<i style="--rail:${index}"></i>`).join("");
    return `<div class="configured-door-wrap" aria-hidden="true" style="--frame:${frame};--frame-shadow:${frameShadow};--glass:${glass};--glass-shadow:${glassShadow};--glass-edge:${thickness}px;--door-ratio:${ratio};--leaves:${leaves}">
      <div class="configured-door ${doorModelClass(item.modelo)} ${line} ${direction} ${threshold} ${materialClass}">
        ${item.automatizacao === "Sim" ? "<span class=\"configured-motor\"></span>" : ""}
        <div class="configured-door-leaves">${panels}</div>
        ${rails ? `<span class="configured-rails">${rails}</span>` : ""}
        ${item.tela_mosquiteira === "Sim" ? "<span class=\"configured-screen\"></span>" : ""}
      </div>
      <span class="configured-door-shadow"></span>
    </div>`;
  }

  function modelVariant(model) {
    if (/maxim/i.test(model)) return "variant-maxim";
    if (/basculante/i.test(model)) return "variant-basculante";
    if (/guilhotina/i.test(model)) return "variant-guilhotina";
    if (/fixa|fixo/i.test(model)) return "variant-fixed";
    if (/canto/i.test(model)) return "variant-corner";
    if (/abrir|giro/i.test(model)) return "variant-open";
    if (/teto/i.test(model)) return "variant-tall";
    if (/pele|structural/i.test(model)) return "variant-structural";
    if (/cortina|articulad/i.test(model)) return "variant-folding";
    if (/autoportante/i.test(model)) return "variant-frameless";
    if (/corrimão/i.test(model)) return "variant-railing";
    if (/tampo|prateleira/i.test(model)) return "variant-horizontal";
    if (/claraboia/i.test(model)) return "variant-skylight";
    if (/toldo/i.test(model)) return "variant-awning";
    if (/policarbonato/i.test(model)) return "variant-polycarbonate";
    if (/roldana/i.test(model)) return "variant-rollers";
    if (/vedação/i.test(model)) return "variant-seal";
    if (/fechadura|puxador/i.test(model)) return "variant-hardware";
    return "variant-standard";
  }

  function configuredArchitecturalVisual(item) {
    const [frame, frameShadow] = frameFinishes[item.cor] || frameFinishes["A definir"];
    const [glass, glassShadow] = glassFinishes[item.tipo_vidro] || glassFinishes["A definir"];
    const thickness = Math.min(12, Math.max(4, Number.parseInt(item.espessura_vidro, 10) || 6));
    const ratio = Math.min(2.1, Math.max(.58, Number(item.largura_cm) / Number(item.altura_cm) || 1.15));
    const counts = { janela: /fixa|maxim/i.test(item.modelo) ? 1 : /basculante/i.test(item.modelo) ? 3 : /guilhotina/i.test(item.modelo) ? 2 : 4,
      box: /abrir/i.test(item.modelo) ? 1 : /banheira/i.test(item.modelo) ? 3 : 2, fachada: 8, guarda_corpo: 3,
      fechamento: /divisória/i.test(item.modelo) ? 3 : 5, espelho: 1, cobertura: 3, manutencao: 1, outro: 4 };
    const count = counts[item.categoria] || 2;
    const panes = Array.from({ length: count }, (_, index) => `<span class="model-panel" style="--panel:${index}"><i></i></span>`).join("");
    const style = `--frame:${frame};--frame-shadow:${frameShadow};--glass:${glass};--glass-shadow:${glassShadow};--glass-edge:${thickness}px;--model-ratio:${ratio};--panels:${count}`;
    const variant = modelVariant(item.modelo);
    let model;
    if (item.categoria === "janela") model = `<div class="architectural-model window-model ${variant}"><div class="model-panels">${panes}</div><span class="window-sill"></span></div>`;
    else if (item.categoria === "box") model = `<div class="architectural-model shower-model ${variant}"><div class="model-panels">${panes}</div><span class="shower-handle"></span><span class="shower-base"></span></div>`;
    else if (item.categoria === "fachada") model = `<div class="architectural-model facade-model ${variant}"><div class="model-panels">${panes}</div><span class="facade-door"></span><span class="facade-roof"></span></div>`;
    else if (item.categoria === "guarda_corpo") model = `<div class="architectural-model guard-model ${variant}"><div class="model-panels">${panes}</div><span class="guard-rail"></span><span class="guard-posts"></span></div>`;
    else if (item.categoria === "fechamento") model = `<div class="architectural-model enclosure-model ${variant}"><div class="model-panels">${panes}</div><span class="enclosure-track"></span></div>`;
    else if (item.categoria === "espelho") model = `<div class="architectural-model mirror-model ${variant}"><div class="model-panels">${panes}</div></div>`;
    else if (item.categoria === "cobertura") model = `<div class="architectural-model canopy-model ${variant}"><div class="model-panels">${panes}</div><span class="canopy-supports"></span></div>`;
    else if (item.categoria === "manutencao") model = `<div class="architectural-model repair-model ${variant}"><span class="repair-window"></span><span class="repair-tool"></span><span class="repair-detail"></span></div>`;
    else model = `<div class="architectural-model custom-model ${variant}"><div class="model-panels">${panes}</div><span class="custom-roof"></span><span class="custom-floor"></span></div>`;
    return `<div class="configured-product-wrap configured-${item.categoria}" aria-hidden="true" style="${style}">${model}<span class="configured-product-shadow"></span></div>`;
  }

  function visualDescription(item) {
    const details = [
      item.modelo, item.linha_aluminio, item.cor,
      item.categoria === "porta" && item.numero_folhas && item.numero_folhas !== "A definir" ? `${item.numero_folhas} folhas` : "",
      item.composicao_vidro, item.tipo_vidro, item.espessura_vidro,
      item.categoria === "porta" && item.trilhos && item.trilhos !== "A definir" ? item.trilhos : "",
      item.categoria === "porta" && item.puxador && !/sem|definir/i.test(item.puxador) ? `Puxador ${item.puxador}` : "",
      item.categoria === "porta" && item.fechadura && !/sem|definir/i.test(item.fechadura) ? `Fechadura ${item.fechadura}` : "",
      item.categoria === "porta" && item.tela_mosquiteira === "Sim" ? "Tela mosquiteira" : "",
      item.categoria === "porta" && item.automatizacao === "Sim" ? "Automatizada" : "",
    ].filter((detail) => detail && detail !== "A definir");
    return details.join(" · ");
  }

  function animatedVisual(item, compact = false) {
    return `<figure class="quote-visual${compact ? " compact" : ""}">
      <div class="quote-visual-stage configured-stage">
        <img class="realistic-visual" src="${realisticImages[item.categoria]}" alt="" loading="lazy" decoding="async">
        <button type="button" class="visual-open" aria-label="Ampliar ${escapeHtml(categoryNames[item.categoria])} · ${escapeHtml(item.modelo)}" aria-haspopup="dialog">⤢ Ampliar</button>
      </div>
      <figcaption><strong>${escapeHtml(categoryNames[item.categoria])} · Visualização animada</strong><span>${escapeHtml(visualDescription(item))}</span><small>Imagem ilustrativa de referência do produto</small></figcaption>
    </figure>`;
  }

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
    updateDoorFields();
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

  function updateDoorFields() {
    document.getElementById("door-specs").hidden = selected?.categoria !== "porta";
  }

  function doorSpecifications(item) {
    if (item.categoria !== "porta") return [];
    return Object.entries(doorSpecificationLabels)
      .map(([key, label]) => item[key] && item[key] !== "A definir" ? `${label}: ${item[key]}` : "")
      .filter(Boolean);
  }

  function value(id) { return document.getElementById(id).value.trim(); }

  function currentItem() {
    const material = materialInput.value;
    const hasAluminum = ["aluminio_vidro", "aluminio"].includes(material);
    const hasGlass = ["aluminio_vidro", "vidro"].includes(material);
    const isDoor = selected.categoria === "porta";
    return {
      categoria: selected.categoria,
      material,
      modelo: modelInput.value,
      linha_aluminio: hasAluminum ? value("item-linha-aluminio") : "",
      cor: hasAluminum ? document.querySelector('input[name="cor"]:checked')?.value || "A definir" : "",
      tipo_vidro: hasGlass ? value("item-vidro") : "",
      composicao_vidro: hasGlass ? value("item-composicao-vidro") : "",
      espessura_vidro: hasGlass ? value("item-espessura") : "",
      numero_folhas: isDoor ? value("item-numero-folhas") : "",
      configuracao_folhas: isDoor ? value("item-configuracao-folhas") : "",
      sentido_abertura: isDoor ? value("item-sentido-abertura") : "",
      trilhos: isDoor ? value("item-trilhos") : "",
      fechadura: isDoor ? value("item-fechadura") : "",
      puxador: isDoor ? value("item-puxador") : "",
      soleira: isDoor ? value("item-soleira") : "",
      tipo_instalacao: isDoor ? value("item-tipo-instalacao") : "",
      retirada_existente: isDoor ? value("item-retirada-existente") : "",
      tela_mosquiteira: isDoor ? value("item-tela-mosquiteira") : "",
      automatizacao: isDoor ? value("item-automatizacao") : "",
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
    document.getElementById("items-list").innerHTML = items.map((item, index) => {
      const price = calculateItem(item, false);
      return `
      <div class="item-row">
        <p><strong>${escapeHtml(categoryNames[item.categoria])} · ${escapeHtml(item.modelo)}</strong>
        <small>${item.largura_cm} × ${item.altura_cm} cm · ${escapeHtml(materialNames[item.material])} · ${item.quantidade} un.</small>
        ${[item.linha_aluminio, item.cor, item.tipo_vidro, item.composicao_vidro, item.espessura_vidro].filter((detail) => detail && detail !== "A definir").length ? `<small>${escapeHtml([item.linha_aluminio, item.cor, item.tipo_vidro, item.composicao_vidro, item.espessura_vidro].filter((detail) => detail && detail !== "A definir").join(" · "))}</small>` : ""}
        ${doorSpecifications(item).length ? `<small>${escapeHtml(doorSpecifications(item).join(" · "))}</small>` : ""}
        ${price ? `<small class="item-price">Produtos: ${money(price.produto_unitario_centavos * item.quantidade)}</small>` : ""}</p>
        <button type="button" data-remove="${index}" aria-label="Remover ${escapeHtml(categoryNames[item.categoria])}">Remover</button>
      </div>`;
    }).join("");
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
      <section class="review-section"><h3>Itens e preços estimados</h3>${items.map((item, index) => {
        const price = estimate?.detalhes[index];
        return `
        <div class="review-item">${animatedVisual(item, true)}<span class="review-number">${index + 1}</span><div>
          <strong>${escapeHtml(categoryNames[item.categoria])} · ${escapeHtml(item.modelo)}</strong>
          <p>${item.largura_cm} × ${item.altura_cm} cm · ${escapeHtml(materialNames[item.material])}${item.linha_aluminio ? ` · ${escapeHtml(item.linha_aluminio)}` : ""}${item.cor ? ` · ${escapeHtml(item.cor)}` : ""}${item.tipo_vidro ? ` · Vidro ${escapeHtml(item.tipo_vidro)}` : ""}${item.composicao_vidro ? ` ${escapeHtml(item.composicao_vidro)}` : ""}${item.espessura_vidro && item.espessura_vidro !== "A definir" ? ` · ${escapeHtml(item.espessura_vidro)}` : ""}</p>
          ${doorSpecifications(item).length ? `<p class="review-specifications">${escapeHtml(doorSpecifications(item).join(" · "))}</p>` : ""}
          ${item.ambiente ? `<p>Ambiente: ${escapeHtml(item.ambiente)}</p>` : ""}
          ${price ? `<p class="review-price-detail">Produto: ${money(price.produto_unitario_centavos)} por unidade${data.instalacao ? ` · instalação: ${money(price.instalacao_unitaria_centavos)} por unidade` : ""}</p>` : ""}
        </div><span class="review-qty">${item.quantidade} un.${price ? `<strong>${money(price.subtotal_centavos)}</strong>` : ""}</span></div>`;
      }).join("")}</section>
      <section class="review-section"><h3>Contato e local</h3><div class="contact-summary">
        <span><strong>Responsável:</strong> ${escapeHtml(data.nome)}</span>
        <span><strong>Telefone:</strong> ${escapeHtml(data.telefone)}</span>
        <span><strong>Local:</strong> ${escapeHtml([data.bairro, data.cidade].filter(Boolean).join(", "))}</span>
        <span><strong>Instalação:</strong> ${data.instalacao ? "Sim, incluir" : "Não, só fornecimento"}</span>
      </div></section>`;
    const notice = document.getElementById("price-notice");
    if (estimate != null) {
      const reference = priceReference?.rotulo ? ` ${escapeHtml(priceReference.rotulo)}.` : "";
      notice.innerHTML = `<span>i</span><p><strong>Total estimado: ${money(estimate.total)}</strong>${reference} O cálculo considera as medidas, quantidades, materiais, acabamentos e ${data.instalacao ? "a instalação selecionada" : "somente o fornecimento"}. O preço final será confirmado após medição e avaliação técnica.</p>`;
    } else {
      notice.innerHTML = "<span>i</span><p><strong>Por que o valor não aparece agora?</strong> Ainda não há preço cadastrado para todos os itens. A equipe confirmará materiais, ferragens, acesso e instalação antes de informar o valor final.</p>";
    }
  }

  function money(cents) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  }

  function calculateItem(item, installation) {
    const rule = catalog.get(`${item.categoria}\u0000${item.modelo}`);
    if (!rule) return null;
    const area = Math.round((item.largura_cm * item.altura_cm / 10000) * 1000) / 1000;
    const productBase = Math.max(Math.round(area * rule.preco_m2_centavos), rule.preco_minimo_centavos);
    let product = productBase;
    Object.entries(priceAdjustments).forEach(([field, factors]) => {
      const factor = factors[item[field]];
      if (factor) product = Math.round(product * factor / 10000);
    });
    const installationUnit = installation ? rule.instalacao_centavos : 0;
    return {
      area_m2: area,
      produto_base_centavos: productBase,
      produto_unitario_centavos: product,
      instalacao_unitaria_centavos: installationUnit,
      subtotal_centavos: (product + installationUnit) * item.quantidade,
    };
  }

  function calculateEstimate(installation) {
    const detalhes = [];
    let total = 0;
    for (const item of items) {
      const detail = calculateItem(item, installation);
      if (!detail) return null;
      detalhes.push(detail);
      total += detail.subtotal_centavos;
    }
    return { total, detalhes };
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
    document.querySelectorAll("#door-specs select").forEach((select) => { select.value = "A definir"; });
    updateDoorFields();
    addButton.disabled = false;
    addButton.textContent = "＋ Adicionar este item ao orçamento";
  }

  productCards.forEach((card) => card.addEventListener("click", () => chooseProduct(card)));
  materialInput.addEventListener("change", updateMaterialFields);
  modelInput.addEventListener("change", updateDoorFields);
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
      const summary = items.map((item, index) => {
        const specifications = doorSpecifications(item);
        return `${index + 1}. ${categoryNames[item.categoria]} - ${item.modelo} - ${item.largura_cm}x${item.altura_cm} cm - ${item.quantidade} un.${specifications.length ? ` - ${specifications.join(", ")}` : ""}`;
      }).join("\n");
      const message = `Olá! Acabei de registrar o orçamento ${code} pelo site.\n\n${summary}\n\nNome: ${data.nome}\nCidade: ${data.cidade}\nInstalação: ${data.instalacao ? "Sim" : "Não"}`;
      document.getElementById("whatsapp-link").href = `https://wa.me/5521964070134?text=${encodeURIComponent(message)}`;
      document.getElementById("success-visuals").innerHTML = items.map((item) => animatedVisual(item)).join("");
      form.hidden = true;
      document.querySelector(".progress-wrap").hidden = true;
      document.getElementById("quote-success").hidden = false;
      document.querySelector(".quote-shell").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      if (error.status === 402) {
        await loadAccess();
        document.querySelector(".quote-shell").scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
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
    } catch { /* Authentication is handled by loadAccess. */ }
  }

  function showPaywall(access, allowReturn = false) {
    document.getElementById("access-loading").hidden = true;
    document.getElementById("quota-banner").hidden = true;
    document.querySelector(".progress-wrap").hidden = true;
    form.hidden = true;
    const paywall = document.getElementById("quote-paywall");
    const buttons = [...document.querySelectorAll(".buy-quotes")];
    const note = document.getElementById("paywall-note");
    paywall.hidden = false;
    note.className = "paywall-note";

    paywall.querySelector("h2").textContent = allowReturn ? "Adicione mais orçamentos à sua conta" : "Continue planejando seus projetos";
    paywall.querySelector(":scope > p").textContent = allowReturn
      ? "Você ainda tem orçamento disponível e pode comprar novos créditos antecipadamente, sem mensalidade."
      : "Seu orçamento gratuito já foi utilizado. Escolha quantos novos orçamentos deseja comprar, sem mensalidade.";
    document.getElementById("continue-current-quote").hidden = !allowReturn;
    buttons.forEach((button) => { button.hidden = false; button.disabled = !access.compra_disponivel; });
    note.textContent = access.compra_disponivel
      ? "Pagamento único em ambiente seguro. Os créditos não vencem a cada mês."
      : "A empresa ainda precisa ativar o pagamento online. Seu orçamento gratuito continua salvo na sua conta.";
  }

  async function loadAccess() {
    const loading = document.getElementById("access-loading");
    loading.hidden = false;
    loading.textContent = "Conferindo seus orçamentos disponíveis…";
    try {
      const { acesso } = await ContaAPI.request("/api/orcamentos/acesso");
      latestAccess = acesso;
      if (!acesso.restantes) {
        showPaywall(acesso);
        return;
      }
      loading.hidden = true;
      document.getElementById("quote-paywall").hidden = true;
      const banner = document.getElementById("quota-banner");
      banner.hidden = false;
      document.getElementById("buy-more-quotes").hidden = !acesso.compra_disponivel;
      if (acesso.plano === "creditos") {
        document.getElementById("quota-title").textContent = "Você tem orçamentos disponíveis";
        document.getElementById("quota-description").textContent = `${acesso.restantes} ${acesso.restantes === 1 ? "orçamento disponível" : "orçamentos disponíveis"} para usar quando quiser.`;
      } else {
        document.getElementById("quota-title").textContent = "Seu orçamento gratuito está disponível";
        document.getElementById("quota-description").textContent = "Esta conta tem direito a 1 solicitação gratuita.";
      }
      document.querySelector(".progress-wrap").hidden = false;
      form.hidden = false;
    } catch (error) {
      if (error.status === 401) {
        window.location.replace("login.html?next=orcamento");
        return;
      }
      loading.textContent = error.message || "Não foi possível conferir seu acesso. Atualize a página para tentar novamente.";
    }
  }

  document.getElementById("buy-more-quotes").addEventListener("click", () => {
    if (latestAccess?.compra_disponivel) showPaywall(latestAccess, true);
  });
  document.getElementById("continue-current-quote").addEventListener("click", loadAccess);

  document.querySelectorAll(".buy-quotes").forEach((button) => button.addEventListener("click", async () => {
    const note = document.getElementById("paywall-note");
    const original = button.textContent;
    document.querySelectorAll(".buy-quotes").forEach((item) => { item.disabled = true; });
    button.textContent = "Abrindo pagamento seguro…";
    note.textContent = "";
    try {
      const result = await ContaAPI.request("/api/pagamentos/orcamentos/checkout", { method: "POST", body: { plano: button.dataset.plan } });
      const url = new URL(result.url);
      const allowed = result.provedor === "mercadopago"
        ? ["www.mercadopago.com.br", "sandbox.mercadopago.com.br"].includes(url.hostname) && url.pathname.startsWith("/checkout/")
        : url.hostname === "checkout.stripe.com";
      if (url.protocol !== "https:" || url.username || url.password || url.port || !allowed) throw new Error("Endereço de pagamento inválido.");
      window.location.assign(url.href);
    } catch (error) {
      note.textContent = error.message;
      note.className = "paywall-note error";
      document.querySelectorAll(".buy-quotes").forEach((item) => { item.disabled = false; });
      button.textContent = original;
    }
  }));

  async function confirmPurchase() {
    const params = new URLSearchParams(location.search);
    const reference = params.get("mp_ref");
    if (reference) {
      await checkMercadoPago(reference);
      return;
    }
    const sessionId = params.get("session_id");
    if (params.get("compra") !== "sucesso" || !sessionId) return;
    const loading = document.getElementById("access-loading");
    loading.hidden = false;
    loading.textContent = "Confirmando seu pagamento…";
    try {
      await ContaAPI.request("/api/pagamentos/orcamentos/confirmar", { method: "POST", body: { session_id: sessionId } });
      history.replaceState({}, "", `${location.pathname}${location.hash}`);
    } catch (error) {
      paymentMessage(error.message || "Não foi possível confirmar o pagamento agora.");
    }
  }

  function paymentMessage(message) {
    const panel = document.getElementById("payment-status");
    panel.hidden = false;
    document.getElementById("payment-message").textContent = message;
  }

  async function checkMercadoPago(reference) {
    paymentMessage("Conferindo a confirmação do Mercado Pago…");
    try {
      const result = await ContaAPI.request("/api/pagamentos/mercadopago/confirmar", { method: "POST", body: { referencia: reference } });
      paymentMessage(result.mensagem);
      if (result.status === "pago") history.replaceState({}, "", `${location.pathname}${location.hash}`);
    } catch (error) {
      paymentMessage(error.message);
    }
  }

  async function loadPaymentHistory() {
    const target = document.getElementById("payment-history");
    try {
      const { compras } = await ContaAPI.request("/api/pagamentos/mercadopago/compras");
      target.replaceChildren();
      const pending = compras.filter((item) => ["aguardando", "pendente"].includes(item.status));
      document.getElementById("pending-payments").hidden = pending.length === 0;
      pending.forEach((item) => {
        const row = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = `${item.tipo === "individual" ? "1 orçamento — R$ 5,99" : "Até 10 orçamentos — R$ 9,90"} · aguardando confirmação`;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button ghost";
        button.textContent = "Verificar pagamento";
        button.addEventListener("click", async () => {
          button.disabled = true;
          await checkMercadoPago(item.referencia);
          await loadAccess();
          await loadPaymentHistory();
          button.disabled = false;
        });
        row.append(label, button);
        target.append(row);
      });
    } catch { /* A failed history request must not prevent the free quotation form. */ }
  }

  async function loadCatalog() {
    try {
      const { precos, ajustes, referencia } = await ContaAPI.request("/api/catalogo/precos");
      precos.forEach((price) => catalog.set(`${price.categoria}\u0000${price.modelo}`, price));
      priceAdjustments = ajustes || {};
      priceReference = referencia || null;
      if (items.length) renderItems();
    } catch { /* A quote can still be requested without an automatic estimate. */ }
  }

  prefillAccount();
  loadCatalog();
  confirmPurchase().then(loadAccess).then(loadPaymentHistory).catch(() => {});
  showStep(1, false);
});
