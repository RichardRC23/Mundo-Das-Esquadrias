(() => {
  const $ = (id) => document.getElementById(id);
  let usuario;
  let conta;
  let orcamentos = [];
  const pages = {
    inicio: ["Tudo sobre seus projetos.", "Seu perfil, serviços e pagamentos, em um só lugar."],
    perfil: ["Seu perfil, do seu jeito.", "Um espaço para manter seus dados sempre atualizados."],
    orcamentos: ["Seus projetos começam aqui.", "Acompanhe cada solicitação de orçamento enviada."],
    compras: ["Cada projeto tem uma história.", "Consulte seus pedidos e acompanhe as faturas disponíveis."],
    contratos: ["Tudo no seu lugar.", "Seus contratos, documentos e informações importantes."],
    assinaturas: ["Cuidado que continua.", "Acompanhe seus planos e serviços recorrentes."],
    pagamentos: ["Mais praticidade para você.", "Organize suas preferências e métodos de pagamento."],
  };
  const methods = { pix: "Pix", boleto: "boleto", cartao: "cartão" };
  const paymentLabels = { reembolsado: "Reembolsado", contestado: "Em contestação", recusado: "Recusado" };
  const labels = { recebido: "Recebido", em_analise: "Em análise", aguardando_cliente: "Aguardando você", aprovado: "Aprovado", pendente: "Pendente", pago: "Pago", paid: "Pago", open: "Em aberto", active: "Ativa", trialing: "Período de teste", canceled: "Cancelada", incomplete: "Incompleta", incomplete_expired: "Expirada", paused: "Pausada", past_due: "Pagamento pendente", unpaid: "Não paga", uncollectible: "Não recebida", void: "Anulada", assinado: "Assinado", aguardando_assinatura: "Aguardando assinatura", concluido: "Concluído", em_andamento: "Em andamento", cancelado: "Cancelado" };
  function node(tag, className, content) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content != null) el.textContent = content;
    return el;
  }
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    svg.setAttribute("aria-hidden", "true");
    use.setAttribute("href", `#i-${name}`);
    svg.append(use);
    return svg;
  }
  function mensagem(texto, success = false) {
    const el = $("mensagem-perfil");
    el.textContent = texto;
    el.className = success ? "notice sucesso" : "notice";
    el.hidden = !texto;
  }
  function erro(error) {
    if (error.status === 401) {
      $("account-content").hidden = true;
      window.location.replace("login.html?next=perfil");
      return;
    }
    mensagem(error.message || "Não foi possível concluir. Tente novamente.");
  }
  function data(value) {
    if (!value) return "";
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? value.replace(" ", "T") + "Z" : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR");
  }
  function dinheiro(amount, currency) {
    if (!Number.isFinite(amount)) return "Valor a consultar";
    try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(amount / 100); }
    catch { return "Valor a consultar"; }
  }
  function doorSpecs(item) {
    if (item.categoria !== "porta") return "";
    return [
      item.numero_folhas && item.numero_folhas !== "A definir" ? `${item.numero_folhas} folha${item.numero_folhas === "1" ? "" : "s"}` : "",
      item.configuracao_folhas, item.sentido_abertura && `Abertura: ${item.sentido_abertura}`,
      item.trilhos, item.fechadura && `Fechadura: ${item.fechadura}`, item.puxador && `Puxador: ${item.puxador}`,
      item.soleira && `Soleira: ${item.soleira}`, item.tipo_instalacao && `Instalação: ${item.tipo_instalacao}`,
      item.retirada_existente && `Retirada existente: ${item.retirada_existente}`,
      item.tela_mosquiteira && `Tela: ${item.tela_mosquiteira}`, item.automatizacao && `Automatização: ${item.automatizacao}`,
    ].filter((value) => value && !value.endsWith("A definir") && value !== "A definir").join(" · ");
  }
  function avatar() {
    const initials = (usuario.nome || "Minha conta").trim().split(/\s+/).slice(0, 2).map((s) => s[0] || "").join("").toUpperCase();
    document.querySelectorAll("[data-avatar]").forEach((el) => {
      el.replaceChildren();
      if (usuario.foto_url?.startsWith("/api/perfil/foto")) {
        const img = document.createElement("img");
        img.alt = "Sua foto de perfil";
        img.src = ContaAPI.url(usuario.foto_url);
        img.addEventListener("error", () => { el.textContent = initials; }, { once: true });
        el.append(img);
      } else el.textContent = initials;
    });
    $("remover-foto").hidden = !usuario.foto_url;
  }
  function renderProfile() {
    $("perfil-nome").value = usuario.nome || "";
    $("perfil-email").value = usuario.email || "";
    $("perfil-telefone").value = usuario.telefone || "";
    document.querySelectorAll("[data-full-name]").forEach((el) => { el.textContent = usuario.nome; });
    $("primeiro-nome").textContent = usuario.nome.trim().split(/\s+/)[0];
    const since = data(usuario.criado_em);
    $("data-cadastro").textContent = since ? `Cliente desde ${since}` : "";
    $("admin-link").hidden = usuario.papel !== "admin";
    avatar();
  }
  function showPage() {
    const key = Object.hasOwn(pages, location.hash.slice(1)) ? location.hash.slice(1) : "inicio";
    document.querySelectorAll("[data-panel]").forEach((el) => { el.hidden = el.dataset.panel !== key; });
    document.querySelectorAll("[data-page]").forEach((el) => {
      if (el.dataset.page === key) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
    });
    $("page-title").textContent = pages[key][0];
    $("page-description").textContent = pages[key][1];
    document.title = `${key === "inicio" ? "Minha conta" : $("page-title").textContent} | Mundo das Esquadrias`;
  }
  function empty(target, name, title, description) {
    target.replaceChildren();
    const block = node("div", "empty-state");
    const box = node("span", "icon-box"); box.append(icon(name));
    block.append(box, node("h3", "", title), node("p", "", description));
    target.append(block);
  }
  function safeLink(value) {
    if (!value || typeof value !== "string") return null;
    if (/^\/api\/contratos\/[1-9]\d*\/documento$/.test(value)) return ContaAPI.url(value);
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && ["billing.stripe.com", "invoice.stripe.com"].includes(url.hostname) && !url.username && !url.password) return url.href;
    } catch { /* no valid document link */ }
    return null;
  }
  function records(type, items) {
    const target = $(`lista-${type}`);
    const meta = {
      compras: ["bag", "Seus próximos projetos começam aqui", "Você ainda não tem compras registradas. Quando a equipe registrar um pedido, ele aparecerá neste espaço."],
      contratos: ["file", "Tudo pronto para novos projetos", "Os contratos e documentos disponibilizados para sua conta aparecerão aqui."],
      assinaturas: ["repeat", "Nenhuma assinatura por aqui ainda", "Quando você contratar um serviço recorrente vinculado à sua conta, poderá acompanhar os detalhes aqui."],
    }[type];
    if (!items.length) { empty(target, ...meta); return; }
    target.replaceChildren();
    items.forEach((item) => {
      const row = node("article", "record");
      const box = node("span", "icon-box"); box.append(icon(meta[0]));
      const info = node("div", "record-info");
      info.append(node("h3", "", item.titulo || "Registro de serviço"));
      if (item.descricao) info.append(node("p", "", item.descricao));
      const dates = [];
      if (data(item.criado_em)) dates.push(`Registrado em ${data(item.criado_em)}`);
      if (data(item.assinado_em)) dates.push(`Assinado em ${data(item.assinado_em)}`);
      if (data(item.proxima_cobranca)) dates.push(`Próximo ciclo: ${data(item.proxima_cobranca)}`);
      if (item.cancelamento_agendado) dates.push("Cancelamento agendado");
      info.append(node("p", "date", dates.join(" · ")));
      const right = node("div", "record-meta");
      const value = dinheiro(item.valor_centavos, item.moeda);
      right.append(node("strong", "", type === "assinaturas" && item.periodicidade ? `${value} / ${item.periodicidade}` : value));
      const positive = ["paid", "pago", "active", "assinado", "concluido"].includes(item.status);
      const pending = ["pendente", "open", "past_due", "unpaid", "incomplete"].includes(item.status);
      right.append(node("span", `badge${positive ? " positive" : pending ? " pending" : ""}`, paymentLabels[item.status] || labels[item.status] || item.status || "Registrado"));
      const link = safeLink(item.documento_url);
      if (link) {
        const anchor = node("a", "text-link", type === "contratos" ? "Baixar documento ↓" : "Ver fatura ↗");
        anchor.href = link;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        info.append(anchor);
      }
      row.append(box, info, right);
      target.append(row);
    });
  }
  function preferencia(value) {
    document.querySelectorAll('input[name="metodo"]').forEach((el) => { el.checked = el.value === value; });
    $("resumo-pagamento").textContent = methods[value] ? `Sua preferência atual é ${methods[value]}. Você pode mudar quando quiser.` : "Escolha como prefere pagar seus próximos projetos.";
  }
  function renderAccount() {
    ["compras", "contratos", "assinaturas"].forEach((type) => {
      records(type, conta[type]);
      $(`limite-${type}`).hidden = !conta.tem_mais?.[type];
    });
    $("total-compras").textContent = `${conta.compras.length}${conta.tem_mais?.compras ? "+" : ""}`;
    $("total-contratos").textContent = `${conta.contratos.length}${conta.tem_mais?.contratos ? "+" : ""}`;
    $("total-assinaturas").textContent = `${conta.assinaturas.filter((s) => ["active", "trialing"].includes(s.status)).length}${conta.tem_mais?.assinaturas ? "+" : ""}`;
    const billing = conta.pagamentos;
    preferencia(billing.preferencia);
    $("pagamento-pendente").hidden = billing.configurado;
    $("form-portal").hidden = !(billing.portal_disponivel ?? billing.configurado);
    $("billing-mode").hidden = !billing.configurado;
    $("billing-mode").textContent = billing.modo === "teste" ? "AMBIENTE DE TESTES" : "PORTAL SEGURO";
    $("limite-metodos").hidden = !conta.tem_mais?.metodos;
    const target = $("lista-metodos"); target.replaceChildren();
    if (billing.configurado && !billing.metodos.length) empty(target, "card",
      billing.provedor === "mercadopago" ? "Pagamento protegido pelo Mercado Pago" : "Nenhum cartão cadastrado",
      billing.provedor === "mercadopago" ? "Escolha entre os meios disponíveis no checkout a cada compra. Este site não armazena seus dados de cartão." : "Use o portal de pagamentos para cadastrar e gerenciar seus cartões.");
    billing.metodos.forEach((method) => {
      const row = node("article", "record");
      const box = node("span", "icon-box"); box.append(icon("card"));
      const info = node("div", "record-info");
      info.append(node("h3", "", `${method.bandeira || "Cartão"} •••• ${method.ultimos4 || ""}`));
      info.append(node("p", "", `Validade ${String(method.exp_mes).padStart(2, "0")}/${method.exp_ano}`));
      row.append(box, info);
      if (method.padrao) row.append(node("span", "badge positive", "Padrão"));
      target.append(row);
    });
  }
  function renderQuotes() {
    const target = $("lista-orcamentos");
    $("total-orcamentos").textContent = String(orcamentos.length);
    if (!orcamentos.length) {
      empty(target, "quote", "Nenhum orçamento solicitado", "Use o botão Novo orçamento para contar o que você precisa e receber um protocolo.");
      return;
    }
    target.replaceChildren();
    orcamentos.forEach((quote) => {
      const row = node("article", "record proposal-record");
      const box = node("span", "icon-box"); box.append(icon("quote"));
      const info = node("div", "record-info");
      info.append(node("h3", "", quote.codigo));
      const productNames = quote.itens.map((item) => item.modelo || "Item").join(", ");
      info.append(node("p", "", `${quote.itens.length} ${quote.itens.length === 1 ? "item" : "itens"}: ${productNames}`));
      if (quote.estimativa_detalhes?.length === quote.itens.length) {
        const breakdown = node("div", "quote-price-breakdown");
        quote.itens.forEach((item, index) => {
          const detail = quote.estimativa_detalhes[index];
          breakdown.append(node("p", "", `${item.quantidade}× ${item.modelo}: ${dinheiro(detail.subtotal_centavos, "BRL")}`));
          const technical = [item.linha_aluminio, item.cor, item.tipo_vidro, item.composicao_vidro, item.espessura_vidro]
            .filter((value) => value && value !== "A definir").join(" · ");
          if (technical) breakdown.append(node("p", "quote-specifications", technical));
          if (doorSpecs(item)) breakdown.append(node("p", "quote-specifications", doorSpecs(item)));
        });
        info.append(breakdown);
      }
      info.append(node("p", "date", `Enviado em ${data(quote.criado_em)} · ${quote.instalacao ? "Com instalação" : "Somente fornecimento"}`));
      const right = node("div", "record-meta");
      right.append(node("strong", "", `Estimativa inicial: ${dinheiro(quote.estimativa_centavos, "BRL")}`));
      const positive = ["aprovado", "concluido"].includes(quote.status);
      const pending = ["recebido", "em_analise", "aguardando_cliente"].includes(quote.status);
      right.append(node("span", `badge${positive ? " positive" : pending ? " pending" : ""}`, labels[quote.status] || quote.status));
      const pdf = node("a", "download-quote", "Baixar orçamento em PDF");
      pdf.href = ContaAPI.url(`/api/orcamentos/${encodeURIComponent(quote.codigo)}/pdf`);
      pdf.target = "_blank";
      pdf.rel = "noopener noreferrer";
      right.append(pdf);
      if (!["aprovado", "concluido"].includes(quote.status)) {
        const remove = node("button", "remove-quote", "Remover orçamento");
        remove.type = "button";
        remove.addEventListener("click", async () => {
          if (!window.confirm(`Deseja remover o orçamento ${quote.codigo}? O uso deste orçamento não será devolvido.`)) return;
          remove.disabled = true;
          remove.textContent = "Removendo…";
          try {
            const result = await ContaAPI.request(`/api/orcamentos/${encodeURIComponent(quote.codigo)}`, { method: "DELETE" });
            orcamentos = (await ContaAPI.request("/api/orcamentos")).orcamentos;
            renderQuotes();
            mensagem(result.mensagem, true);
          } catch (error) {
            erro(error);
            remove.disabled = false;
            remove.textContent = "Remover orçamento";
          }
        });
        right.append(remove);
      }
      row.append(box, info, right);
      row.append(PropostasUI.render(quote, false, async (notice) => {
        orcamentos = (await ContaAPI.request("/api/orcamentos")).orcamentos;
        renderQuotes(); mensagem(notice, true);
      }));
      target.append(row);
    });
  }
  async function carregarConta() {
    $("erro-conta").hidden = true;
    $("retry-conta").disabled = true;
    $("pagamento-fields").disabled = true;
    try {
      const [accountData, quoteData] = await Promise.all([
        ContaAPI.request("/api/conta"), ContaAPI.request("/api/orcamentos"),
      ]);
      conta = accountData;
      orcamentos = quoteData.orcamentos;
      renderAccount();
      renderQuotes();
      $("pagamento-fields").disabled = false;
    } catch (error) {
      conta = null;
      $("erro-conta").hidden = false;
      $("erro-conta").querySelector("p").textContent = error.message;
      ["total-compras", "total-contratos", "total-assinaturas"].forEach((id) => { $(id).textContent = "—"; });
      $("total-orcamentos").textContent = "—";
      $("lista-orcamentos").replaceChildren(node("p", "hint", "Orçamentos indisponíveis. Tente consultar novamente."));
      ["compras", "contratos", "assinaturas"].forEach((type) => {
        $(`lista-${type}`).replaceChildren(node("p", "hint", "Informações indisponíveis. Tente consultar novamente."));
        $(`limite-${type}`).hidden = true;
      });
      $("form-portal").hidden = true;
      $("pagamento-pendente").hidden = true;
      $("billing-mode").hidden = true;
      $("limite-metodos").hidden = true;
      $("lista-metodos").replaceChildren();
      if (error.status === 401) erro(error);
    } finally { $("retry-conta").disabled = false; }
  }
  async function carregar() {
    $("carregando").hidden = false;
    $("erro-perfil").hidden = true;
    $("retry-perfil").disabled = true;
    try {
      ({ usuario } = await ContaAPI.request("/api/perfil"));
      renderProfile();
      $("account-content").hidden = false;
      await carregarConta();
    } catch (error) {
      $("account-content").hidden = true;
      $("erro-perfil").hidden = false;
      $("erro-perfil").querySelector("p").textContent = error.message;
      erro(error);
    } finally { $("carregando").hidden = true; $("retry-perfil").disabled = false; }
  }
  $("form-perfil").addEventListener("submit", async (event) => {
    event.preventDefault(); mensagem("");
    const body = { nome: $("perfil-nome").value, email: $("perfil-email").value, telefone: $("perfil-telefone").value, senha_atual: $("senha-atual").value };
    $("perfil-fields").disabled = true;
    try {
      const result = await ContaAPI.request("/api/perfil", { method: "PUT", body });
      usuario = result.usuario; renderProfile(); mensagem(result.mensagem, true);
    } catch (error) { erro(error); }
    finally { $("perfil-fields").disabled = false; $("senha-atual").value = ""; }
  });
  const cropCanvas = $("crop-canvas");
  const cropContext = cropCanvas.getContext("2d", { alpha: false });
  const cropState = { image: null, url: null, zoom: 1, x: 0, y: 0, drag: null, saving: false, returnFocus: null };

  function cropLimits() {
    if (!cropState.image) return { x: 0, y: 0 };
    const scale = Math.max(cropCanvas.width / cropState.image.naturalWidth, cropCanvas.height / cropState.image.naturalHeight) * cropState.zoom;
    return {
      x: Math.max(0, (cropState.image.naturalWidth * scale - cropCanvas.width) / 2),
      y: Math.max(0, (cropState.image.naturalHeight * scale - cropCanvas.height) / 2),
    };
  }

  function drawCrop() {
    if (!cropState.image) return;
    const scale = Math.max(cropCanvas.width / cropState.image.naturalWidth, cropCanvas.height / cropState.image.naturalHeight) * cropState.zoom;
    const width = cropState.image.naturalWidth * scale;
    const height = cropState.image.naturalHeight * scale;
    const limits = cropLimits();
    cropState.x = Math.max(-limits.x, Math.min(limits.x, cropState.x));
    cropState.y = Math.max(-limits.y, Math.min(limits.y, cropState.y));
    cropContext.fillStyle = "#dfe9ee";
    cropContext.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
    cropContext.drawImage(cropState.image,
      (cropCanvas.width - width) / 2 + cropState.x,
      (cropCanvas.height - height) / 2 + cropState.y, width, height);
  }

  function resetCrop() {
    cropState.zoom = 1;
    cropState.x = 0;
    cropState.y = 0;
    $("crop-zoom").value = "100";
    drawCrop();
  }

  function closeCrop() {
    if (cropState.saving) return;
    $("crop-modal").hidden = true;
    document.body.classList.remove("crop-open");
    cropState.drag = null;
    cropState.image = null;
    if (cropState.url) URL.revokeObjectURL(cropState.url);
    cropState.url = null;
    $("foto").disabled = false;
    $("foto").value = "";
    $("crop-status").textContent = "";
    cropState.returnFocus?.focus();
  }

  async function loadCropImage(url) {
    const image = new Image();
    image.decoding = "async";
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("A imagem demorou demais para abrir.")), 15000);
      const loaded = () => {
        window.clearTimeout(timeout);
        if (image.naturalWidth && image.naturalHeight) resolve();
        else reject(new Error("Imagem sem dimensões válidas."));
      };
      const failed = () => {
        window.clearTimeout(timeout);
        reject(new Error("O navegador não conseguiu ler esta imagem."));
      };
      image.addEventListener("load", loaded, { once: true });
      image.addEventListener("error", failed, { once: true });
      image.src = url;
      // `complete` can briefly be true with zero dimensions while a Blob URL is
      // still being decoded. Only finish early when pixels are already available.
      if (image.complete && image.naturalWidth && image.naturalHeight) loaded();
    });
    return image;
  }

  async function openCrop(file) {
    if (cropState.url) URL.revokeObjectURL(cropState.url);
    cropState.url = URL.createObjectURL(file);
    let image;
    try {
      image = await loadCropImage(cropState.url);
    } catch {
      URL.revokeObjectURL(cropState.url);
      const body = new FormData();
      body.append("foto", file);
      const compatible = await ContaAPI.requestBlob("/api/perfil/foto/preparar", { method: "POST", body });
      cropState.url = URL.createObjectURL(compatible);
      image = await loadCropImage(cropState.url);
    }
    cropState.image = image;
    cropState.returnFocus = document.activeElement;
    $("crop-modal").hidden = false;
    document.body.classList.add("crop-open");
    resetCrop();
    $("crop-stage").focus();
  }

  $("foto").addEventListener("change", async () => {
    const file = $("foto").files[0];
    if (!file) return;
    const supportedType = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.type);
    const supportedName = /\.(?:jpe?g|png|webp|heic|heif)$/i.test(file.name);
    if (file.size > 2 * 1024 * 1024 || (!supportedType && !supportedName)) {
      mensagem("Escolha uma foto JPG, PNG, WebP ou HEIC de até 2 MB."); $("foto").value = ""; return;
    }
    mensagem("");
    $("foto").disabled = true;
    try { await openCrop(file); }
    catch (error) {
      mensagem(error.message || "Não foi possível abrir essa imagem. Exporte-a como JPG, PNG ou WebP e tente novamente.");
      if (cropState.url) URL.revokeObjectURL(cropState.url);
      cropState.url = null;
      $("foto").disabled = false;
      $("foto").value = "";
    }
  });

  $("crop-zoom").addEventListener("input", (event) => {
    cropState.zoom = Number(event.target.value) / 100;
    drawCrop();
  });
  $("crop-reset").addEventListener("click", resetCrop);
  $("crop-cancel").addEventListener("click", closeCrop);
  $("crop-close").addEventListener("click", closeCrop);
  document.querySelector("[data-close-crop]").addEventListener("click", closeCrop);

  const cropStage = $("crop-stage");
  cropStage.addEventListener("pointerdown", (event) => {
    if (!cropState.image || cropState.saving) return;
    cropState.drag = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: cropState.x, y: cropState.y };
    cropStage.setPointerCapture(event.pointerId);
    cropStage.classList.add("dragging");
  });
  cropStage.addEventListener("pointermove", (event) => {
    if (!cropState.drag || cropState.drag.id !== event.pointerId) return;
    const factor = cropCanvas.width / cropStage.getBoundingClientRect().width;
    cropState.x = cropState.drag.x + (event.clientX - cropState.drag.clientX) * factor;
    cropState.y = cropState.drag.y + (event.clientY - cropState.drag.clientY) * factor;
    drawCrop();
  });
  function endCropDrag(event) {
    if (cropState.drag?.id !== event.pointerId) return;
    cropState.drag = null;
    cropStage.classList.remove("dragging");
  }
  cropStage.addEventListener("pointerup", endCropDrag);
  cropStage.addEventListener("pointercancel", endCropDrag);
  cropStage.addEventListener("keydown", (event) => {
    const movement = event.shiftKey ? 20 : 6;
    const directions = { ArrowLeft: [-movement, 0], ArrowRight: [movement, 0], ArrowUp: [0, -movement], ArrowDown: [0, movement] };
    if (!directions[event.key]) return;
    event.preventDefault();
    cropState.x += directions[event.key][0];
    cropState.y += directions[event.key][1];
    drawCrop();
  });

  $("crop-save").addEventListener("click", async () => {
    if (!cropState.image || cropState.saving) return;
    cropState.saving = true;
    $("crop-save").disabled = true;
    $("crop-cancel").disabled = true;
    $("crop-close").disabled = true;
    $("crop-status").textContent = "Salvando sua foto…";
    $("remover-foto").disabled = true;
    try {
      const blob = await new Promise((resolve) => cropCanvas.toBlob(resolve, "image/webp", .9));
      if (!blob) throw new Error("Não foi possível preparar a imagem.");
      const body = new FormData();
      body.append("foto", blob, "foto-perfil.webp");
      const result = await ContaAPI.request("/api/perfil/foto", { method: "POST", body });
      usuario.foto_url = result.foto_url;
      avatar();
      cropState.saving = false;
      closeCrop();
      mensagem("Foto ajustada e salva com sucesso.", true);
    } catch (error) {
      cropState.saving = false;
      $("crop-status").textContent = error.message || "Não foi possível salvar a foto.";
    } finally {
      $("crop-save").disabled = false;
      $("crop-cancel").disabled = false;
      $("crop-close").disabled = false;
      $("remover-foto").disabled = false;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("crop-modal").hidden) closeCrop();
  });
  $("remover-foto").addEventListener("click", async () => {
    $("remover-foto").disabled = true; $("foto").disabled = true;
    try {
      const result = await ContaAPI.request("/api/perfil/foto", { method: "DELETE" });
      usuario.foto_url = null; avatar(); mensagem(result.mensagem, true);
    } catch (error) { erro(error); }
    finally { $("remover-foto").disabled = false; $("foto").disabled = false; }
  });
  async function salvarPreferencia(method) {
    $("pagamento-fields").disabled = true;
    try {
      const result = await ContaAPI.request("/api/pagamentos/preferencia", { method: "PUT", body: { metodo: method } });
      preferencia(result.preferencia); mensagem(result.mensagem, true);
    } catch (error) { erro(error); }
    finally { $("pagamento-fields").disabled = false; }
  }
  $("form-preferencia").addEventListener("submit", (event) => {
    event.preventDefault();
    const chosen = document.querySelector('input[name="metodo"]:checked');
    if (!chosen) { mensagem("Selecione uma forma de pagamento."); return; }
    salvarPreferencia(chosen.value);
  });
  $("limpar-preferencia").addEventListener("click", () => salvarPreferencia(null));
  $("form-portal").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button"); button.disabled = true;
    try {
      const result = await ContaAPI.request("/api/pagamentos/portal", { method: "POST", body: { senha_atual: $("senha-portal").value } });
      const url = safeLink(result.url);
      if (!url || new URL(url).hostname !== "billing.stripe.com") throw new Error("Não foi possível abrir o portal de pagamentos.");
      window.location.assign(url);
    } catch (error) { erro(error); }
    finally { button.disabled = false; $("senha-portal").value = ""; }
  });
  $("btn-sair").addEventListener("click", async () => {
    $("btn-sair").disabled = true;
    try {
      await ContaAPI.request("/api/sair", { method: "POST" });
      $("account-content").hidden = true; window.location.replace("index.html");
    } catch (error) { erro(error); $("btn-sair").disabled = false; }
  });
  window.addEventListener("hashchange", () => { showPage(); mensagem(""); });
  window.addEventListener("pageshow", (event) => { if (event.persisted) carregar(); });
  $("retry-perfil").addEventListener("click", carregar);
  $("retry-conta").addEventListener("click", carregarConta);
  showPage(); carregar();
})();
