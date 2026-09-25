(() => {
  const $ = (id) => document.getElementById(id);
  let usuario;
  let conta;
  const pages = {
    inicio: ["Tudo sobre seus projetos.", "Seu perfil, serviços e pagamentos, em um só lugar."],
    perfil: ["Seu perfil, do seu jeito.", "Um espaço para manter seus dados sempre atualizados."],
    compras: ["Cada projeto tem uma história.", "Consulte seus pedidos e acompanhe as faturas disponíveis."],
    contratos: ["Tudo no seu lugar.", "Seus contratos, documentos e informações importantes."],
    assinaturas: ["Cuidado que continua.", "Acompanhe seus planos e serviços recorrentes."],
    pagamentos: ["Mais praticidade para você.", "Organize suas preferências e métodos de pagamento."],
  };
  const methods = { pix: "Pix", boleto: "boleto", cartao: "cartão" };
  const labels = { pendente: "Pendente", pago: "Pago", paid: "Pago", open: "Em aberto", active: "Ativa", trialing: "Período de teste", canceled: "Cancelada", incomplete: "Incompleta", incomplete_expired: "Expirada", paused: "Pausada", past_due: "Pagamento pendente", unpaid: "Não paga", uncollectible: "Não recebida", void: "Anulada", assinado: "Assinado", aguardando_assinatura: "Aguardando assinatura", concluido: "Concluído", em_andamento: "Em andamento", cancelado: "Cancelado" };
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
      right.append(node("span", `badge${positive ? " positive" : pending ? " pending" : ""}`, labels[item.status] || item.status || "Registrado"));
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
    $("form-portal").hidden = !billing.configurado;
    $("billing-mode").hidden = !billing.configurado;
    $("billing-mode").textContent = billing.modo === "teste" ? "AMBIENTE DE TESTES" : "PORTAL SEGURO";
    $("limite-metodos").hidden = !conta.tem_mais?.metodos;
    const target = $("lista-metodos"); target.replaceChildren();
    if (billing.configurado && !billing.metodos.length) empty(target, "card", "Nenhum cartão cadastrado", "Use o portal de pagamentos para cadastrar e gerenciar seus cartões.");
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
  async function carregarConta() {
    $("erro-conta").hidden = true;
    $("retry-conta").disabled = true;
    $("pagamento-fields").disabled = true;
    try {
      conta = await ContaAPI.request("/api/conta");
      renderAccount();
      $("pagamento-fields").disabled = false;
    } catch (error) {
      conta = null;
      $("erro-conta").hidden = false;
      $("erro-conta").querySelector("p").textContent = error.message;
      ["total-compras", "total-contratos", "total-assinaturas"].forEach((id) => { $(id).textContent = "—"; });
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
  $("foto").addEventListener("change", async () => {
    const file = $("foto").files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024 || (file.type && !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      mensagem("Escolha uma foto JPG, PNG ou WebP de até 2 MB."); $("foto").value = ""; return;
    }
    mensagem(""); $("foto").disabled = true; $("remover-foto").disabled = true; $("status-foto").textContent = "Enviando sua foto…";
    const body = new FormData(); body.append("foto", file);
    try {
      const result = await ContaAPI.request("/api/perfil/foto", { method: "POST", body });
      usuario.foto_url = result.foto_url; avatar(); mensagem(result.mensagem, true);
    } catch (error) { erro(error); }
    finally { $("foto").disabled = false; $("remover-foto").disabled = false; $("foto").value = ""; $("status-foto").textContent = ""; }
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
