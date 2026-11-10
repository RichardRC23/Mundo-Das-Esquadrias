(() => {
  const $ = (id) => document.getElementById(id);
  const labels = { rascunho: "Rascunho", enviado: "Enviado ao cliente", assinado: "Assinado", concluido: "Concluído", cancelado: "Cancelado" };
  const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((value || 0) / 100);
  const date = (value) => {
    if (!value) return "—";
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("pt-BR");
  };
  const node = (tag, className, content) => { const item = document.createElement(tag); if (className) item.className = className; if (content != null) item.textContent = content; return item; };
  let contracts = [];

  async function reload() { contracts = (await ContaAPI.request("/api/admin/contratos")).contratos; render(); }
  function render() {
    const filter = $("contract-filter").value;
    const items = filter ? contracts.filter((item) => item.status === filter) : contracts;
    const target = $("admin-contracts"); target.replaceChildren();
    if (!items.length) return target.append(node("div", "empty", "Nenhum contrato encontrado nesta situação."));
    items.forEach((contract) => {
      const card = node("article", "contract-card");
      const head = node("div", "contract-card-head");
      const title = node("div"); title.append(node("h3", "", contract.codigo || "Contrato"), node("p", "", `${contract.cliente_nome} · ${contract.orcamento_codigo || "Sem orçamento"}`));
      head.append(title, node("span", `badge ${["assinado", "concluido"].includes(contract.status) ? "good" : contract.status === "cancelado" ? "muted" : ""}`, labels[contract.status] || contract.status));
      const summary = node("div", "contract-summary");
      summary.append(node("strong", "", money(contract.valor_centavos)), node("p", "", contract.titulo), node("small", "", `Criado em ${date(contract.criado_em)} · Início ${date(contract.inicio_em)}`));
      const controls = node("div", "contract-controls");
      const uploadForm = node("form", "contract-upload");
      const file = node("input"); file.type = "file"; file.name = "documento"; file.accept = "application/pdf,.pdf"; file.required = true;
      const upload = node("button", "button secondary", contract.documento_url ? "Enviar nova versão do PDF" : "Anexar PDF"); upload.type = "submit";
      uploadForm.append(file, upload);
      uploadForm.addEventListener("submit", async (event) => {
        event.preventDefault(); upload.disabled = true;
        try { const data = new FormData(); data.append("documento", file.files[0]); const result = await ContaAPI.request(`/api/admin/contratos/${contract.id}/documento`, { method: "POST", body: data }); alert(result.mensagem); await reload(); }
        catch (error) { alert(error.message); } finally { upload.disabled = false; }
      });
      const status = node("select"); Object.entries(labels).forEach(([value, label]) => { const option = node("option", "", label); option.value = value; option.selected = value === contract.status; status.append(option); });
      const save = node("button", "button primary", "Salvar situação"); save.type = "button";
      save.addEventListener("click", async () => { save.disabled = true; try { const result = await ContaAPI.request(`/api/admin/contratos/${contract.id}/status`, { method: "PUT", body: { status: status.value } }); alert(result.mensagem); await reload(); } catch (error) { alert(error.message); } finally { save.disabled = false; } });
      controls.append(uploadForm, status, save);
      if (contract.documento_url) { const link = node("a", "text-button", "Baixar documento atual ↓"); link.href = ContaAPI.url(contract.documento_url); link.target = "_blank"; link.rel = "noopener"; controls.append(link); }
      const history = node("details", "contract-history"); history.append(node("summary", "", "Ver histórico")); (contract.eventos || []).forEach((event) => history.append(node("p", "", `${date(event.criado_em)} · ${event.descricao}`)));
      card.append(head, summary, controls, history); target.append(card);
    });
  }

  async function init(quotes) {
    const select = $("contract-quote");
    quotes.filter((quote) => quote.status === "aprovado" && quote.propostas?.at(-1)?.situacao === "aceita").forEach((quote) => {
      const option = node("option", "", `${quote.codigo} · ${quote.nome} · ${money(quote.propostas.at(-1).valor_centavos)}`); option.value = quote.id; select.append(option);
    });
    $("contract-form").addEventListener("submit", async (event) => {
      event.preventDefault(); const button = event.submitter; button.disabled = true;
      try {
        const result = await ContaAPI.request("/api/admin/contratos", { method: "POST", body: {
          orcamento_id: Number(select.value), titulo: $("contract-title").value, descricao: $("contract-description").value,
          validade_em: $("contract-validity").value, inicio_em: $("contract-start").value,
        } });
        alert(result.mensagem); event.currentTarget.reset(); await reload();
      } catch (error) { alert(error.message); } finally { button.disabled = false; }
    });
    $("contract-filter").addEventListener("change", render);
    await reload();
  }
  window.ContratosAdmin = { init };
})();
