window.OperacaoAdmin = (() => {
  const $ = (id) => document.getElementById(id);
  const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((value || 0) / 100);
  const date = (value) => value ? new Date(`${String(value).replace(" ", "T")}Z`).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Ainda não registrado";
  const statusLabels = { recebida: "Recebida", em_analise: "Em análise", concluida: "Concluída", cancelada: "Cancelada",
    pago: "Pago", pendente: "Pendente", recusado: "Recusado", contestado: "Contestado", reembolsado: "Reembolsado", cancelado: "Cancelado" };
  let data;

  function showMessage(text, success = true) {
    const target = $("operation-message");
    target.textContent = text; target.hidden = !text; target.classList.toggle("error", !success);
  }
  function setRoutine(id, routine) {
    const card = $(id);
    card.classList.toggle("due", routine.pendente);
    card.classList.toggle("done", !routine.pendente);
    card.querySelector(".routine-status").textContent = routine.pendente ? "!" : "✓";
    card.querySelector(".routine-date").textContent = routine.ultima_em ? `Último registro: ${date(routine.ultima_em)}` : "Ainda não revisado";
  }
  function renderPayments(items) {
    const target = $("operation-recent-payments"); target.replaceChildren();
    if (!items.length) { target.innerHTML = '<p class="operation-empty">Nenhum pagamento registrado.</p>'; return; }
    for (const payment of items) {
      const row = document.createElement("article"); row.className = "operation-payment";
      const copy = document.createElement("div");
      copy.innerHTML = `<strong></strong><small></small>`;
      copy.querySelector("strong").textContent = payment.titulo;
      copy.querySelector("small").textContent = `${date(payment.criado_em)} · ${money(payment.valor_centavos)}`;
      const badge = document.createElement("span"); badge.className = `operation-badge ${payment.status}`; badge.textContent = statusLabels[payment.status] || payment.status;
      row.append(copy, badge); target.append(row);
    }
  }
  function renderPrivacy(items) {
    const target = $("operation-privacy-list"); target.replaceChildren();
    const active = items.filter((item) => !["concluida", "cancelada"].includes(item.status));
    if (!active.length) { target.innerHTML = '<p class="operation-empty">Nenhuma solicitação pendente.</p>'; return; }
    for (const item of active) {
      const row = document.createElement("article"); row.className = "privacy-operation-row";
      const copy = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = item.nome;
      const detail = document.createElement("small"); detail.textContent = `${item.email || item.telefone || "Sem contato"} · ${date(item.solicitado_em)}`;
      copy.append(title, detail);
      const select = document.createElement("select");
      for (const [value, label] of Object.entries({ recebida: "Recebida", em_analise: "Em análise", concluida: "Concluída", cancelada: "Cancelada" })) {
        const option = new Option(label, value, false, value === item.status); select.add(option);
      }
      const save = document.createElement("button"); save.type = "button"; save.className = "button secondary"; save.textContent = "Salvar";
      save.addEventListener("click", async () => {
        save.disabled = true;
        try { const result = await ContaAPI.request(`/api/admin/operacao/privacidade/${item.id}`, { method: "PUT", body: { status: select.value } }); await load(); showMessage(result.mensagem); }
        catch (error) { showMessage(error.message, false); } finally { save.disabled = false; }
      });
      row.append(copy, select, save); target.append(row);
    }
  }
  function render() {
    const settings = data.configuracao;
    $("operation-responsible").value = settings.responsavel_orcamentos;
    $("operation-contact").value = settings.contato_responsavel;
    $("operation-deadline").value = String(settings.prazo_resposta_horas);
    if (!$("operation-deadline").value) $("operation-deadline").add(new Option(`${settings.prazo_resposta_horas} horas`, settings.prazo_resposta_horas, true, true));
    $("operation-price-frequency").value = settings.frequencia_precos_dias;
    $("operation-content-frequency").value = settings.frequencia_conteudo_dias;
    const pendingPrivacy = data.privacidade.filter((item) => ["recebida", "em_analise"].includes(item.status)).length;
    $("operation-overdue").textContent = data.orcamentos.atrasados;
    $("operation-proposals").textContent = data.propostas.pendentes;
    $("operation-payments").textContent = data.pagamentos.atencao;
    $("operation-privacy").textContent = pendingPrivacy;
    $("operation-paid").textContent = data.pagamentos.pagos;
    $("operation-revenue").textContent = money(data.pagamentos.recebido_centavos);
    $("operation-accepted").textContent = data.propostas.aceitas;
    $("operation-adjustments").textContent = data.propostas.ajustes;
    setRoutine("routine-prices", data.rotina.precos); setRoutine("routine-content", data.rotina.conteudo); setRoutine("routine-backup", data.rotina.backup);
    renderPayments(data.pagamentos.recentes); renderPrivacy(data.privacidade);
  }
  async function load() { data = await ContaAPI.request("/api/admin/operacao"); render(); }
  async function init() {
    $("operation-settings-form").addEventListener("submit", async (event) => {
      event.preventDefault(); const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true;
      try {
        const result = await ContaAPI.request("/api/admin/operacao/configuracao", { method: "PUT", body: {
          responsavel_orcamentos: $("operation-responsible").value, contato_responsavel: $("operation-contact").value,
          prazo_resposta_horas: Number($("operation-deadline").value), frequencia_precos_dias: Number($("operation-price-frequency").value),
          frequencia_conteudo_dias: Number($("operation-content-frequency").value),
        } }); await load(); showMessage(result.mensagem);
      } catch (error) { showMessage(error.message, false); } finally { button.disabled = false; }
    });
    document.querySelectorAll("[data-review]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try { const result = await ContaAPI.request(`/api/admin/operacao/revisoes/${button.dataset.review}`, { method: "POST", body: {} }); await load(); showMessage(result.mensagem); }
      catch (error) { showMessage(error.message, false); } finally { button.disabled = false; }
    }));
    $("operation-backup").addEventListener("click", async (event) => {
      const button = event.currentTarget; button.disabled = true; button.textContent = "Preparando…";
      try {
        const result = await ContaAPI.request("/api/admin/operacao/backup", { method: "POST", body: {} });
        const blob = await ContaAPI.requestBlob(result.download_url); const url = URL.createObjectURL(blob);
        const link = document.createElement("a"); link.href = url; link.download = result.arquivo; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        await load(); showMessage("Backup criado e baixado. Guarde o arquivo em local protegido.");
      } catch (error) { showMessage(error.message, false); } finally { button.disabled = false; button.textContent = "Criar e baixar"; }
    });
    await load();
  }
  return { init, reload: load };
})();
