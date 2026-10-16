const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require("pdfkit");
const { partesDoItem } = require("./partes-orcamento");

const CATEGORIES = {
  porta: "Porta", janela: "Janela", box: "Box de banheiro", fachada: "Fachada",
  guarda_corpo: "Guarda-corpo", fechamento: "Fechamento", espelho: "Espelho ou vidro",
  cobertura: "Cobertura", manutencao: "Manutenção", outro: "Outro projeto",
};
const MATERIALS = {
  aluminio_vidro: "Alumínio com vidro", aluminio: "Somente alumínio", vidro: "Somente vidro",
  manutencao: "Manutenção / reparo", outro: "A definir",
};
const STATUS = {
  recebido: "Recebido", em_analise: "Em análise", aguardando_cliente: "Aguardando cliente",
  aprovado: "Aprovado", concluido: "Concluído", cancelado: "Cancelado",
};
const doorSpecs = (item) => item.categoria === "porta" ? [
  item.numero_folhas && item.numero_folhas !== "A definir" ? `${item.numero_folhas} folha${item.numero_folhas === "1" ? "" : "s"}` : "",
  item.configuracao_folhas, item.sentido_abertura && `Abertura: ${item.sentido_abertura}`,
  item.trilhos, item.fechadura && `Fechadura: ${item.fechadura}`, item.puxador && `Puxador: ${item.puxador}`,
  item.soleira && `Soleira: ${item.soleira}`, item.tipo_instalacao && `Instalação: ${item.tipo_instalacao}`,
  item.retirada_existente && `Retirada existente: ${item.retirada_existente}`,
  item.tela_mosquiteira && `Tela: ${item.tela_mosquiteira}`, item.automatizacao && `Automatização: ${item.automatizacao}`,
].filter((value) => value && !value.endsWith("A definir") && value !== "A definir").join("; ") : "";

const money = (value) => Number.isSafeInteger(value)
  ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100).replace(/\u00a0/g, " ")
  : "A confirmar";
const date = (value) => {
  if (!value) return "";
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

function gerarOrcamentoPdf(quote, logoPath) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margins: { top: 42, right: 48, bottom: 54, left: 48 },
      bufferPages: true, info: { Title: `Orçamento ${quote.codigo}`, Author: "Mundo das Esquadrias" } });
    const chunks = [];
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));

    const blue = "#075b9d";
    const navy = "#12364f";
    const muted = "#617583";
    const line = "#d8e3e9";
    const green = "#287452";
    const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const logo = fs.readFileSync(path.resolve(logoPath));

    function continuationHeader() {
      document.image(logo, 48, 36, { fit: [34, 34] });
      document.font("Helvetica-Bold").fontSize(11).fillColor(navy).text("Mundo das Esquadrias", 90, 42);
      document.font("Helvetica").fontSize(8).fillColor(muted).text(`Continuação do orçamento ${quote.codigo}`, 90, 57);
      document.moveTo(48, 78).lineTo(document.page.width - 48, 78).strokeColor(line).stroke();
      document.x = 48;
      document.y = 94;
    }
    function ensureSpace(height) {
      if (document.y + height <= document.page.height - 65) return;
      document.addPage();
      continuationHeader();
    }
    function heading(title) {
      ensureSpace(35);
      document.x = 48;
      document.moveDown(.7).font("Helvetica-Bold").fontSize(10).fillColor(blue).text(title.toUpperCase());
      document.moveDown(.35).moveTo(48, document.y).lineTo(document.page.width - 48, document.y).strokeColor(line).stroke();
      document.x = 48;
      document.moveDown(.65);
    }
    function pair(label, value, x, y, width) {
      document.font("Helvetica-Bold").fontSize(8).fillColor(muted).text(label.toUpperCase(), x, y, { width });
      document.font("Helvetica").fontSize(10).fillColor(navy).text(value || "Não informado", x, y + 13, { width });
    }

    document.image(logo, 48, 38, { fit: [62, 62] });
    document.font("Helvetica-Bold").fontSize(17).fillColor(navy).text("Mundo das Esquadrias", 122, 47);
    document.font("Helvetica").fontSize(9).fillColor(muted).text("Alumínio e vidros sob medida", 122, 70);
    document.text("Rio de Janeiro - RJ  |  (21) 96407-0134", 122, 84);
    document.font("Helvetica-Bold").fontSize(9).fillColor(blue).text("ORÇAMENTO", 430, 49, { width: 116, align: "right" });
    document.fontSize(12).fillColor(navy).text(quote.codigo, 390, 66, { width: 156, align: "right" });
    document.moveTo(48, 112).lineTo(document.page.width - 48, 112).lineWidth(2).strokeColor(blue).stroke();

    document.x = 48;
    document.y = 132;
    document.font("Helvetica-Bold").fontSize(20).fillColor(navy).text("Resumo do orçamento");
    document.moveDown(.3).font("Helvetica").fontSize(9).fillColor(muted)
      .text(`Solicitado em ${date(quote.criado_em)}  |  Situação: ${STATUS[quote.status] || quote.status}`);

    heading("Cliente e local do serviço");
    const infoY = document.y;
    pair("Cliente", quote.nome, 48, infoY, 225);
    pair("Telefone", quote.telefone, 296, infoY, 120);
    pair("E-mail", quote.email, 438, infoY, 108);
    document.y = infoY + 39;
    const locationY = document.y;
    pair("Cidade", quote.cidade, 48, locationY, 170);
    pair("Bairro", quote.bairro, 242, locationY, 170);
    pair("Instalação", quote.instalacao ? "Incluída" : "Somente fornecimento", 436, locationY, 110);
    document.y = locationY + 40;

    heading("Itens e valores");
    const columns = [48, 72, 300, 390, 458];
    const widths = [22, 222, 83, 60, 88];
    const headers = ["#", "Descrição", "Medidas", "Qtd.", "Subtotal"];
    function itemsHeader() {
      const headerY = document.y;
      document.rect(48, headerY, contentWidth, 22).fill("#edf5fa");
      headers.forEach((header, index) => document.font("Helvetica-Bold").fontSize(7).fillColor(navy)
        .text(header, columns[index] + 3, headerY + 7, { width: widths[index] - 6, align: index > 2 ? "right" : "left" }));
      document.y = headerY + 22;
    }
    itemsHeader();

    const items = Array.isArray(quote.itens) ? quote.itens : [];
    const details = Array.isArray(quote.estimativa_detalhes) ? quote.estimativa_detalhes : [];
    items.forEach((item, index) => {
      const detail = details[index] || {};
      const specifications = doorSpecs(item);
      const accessories = Array.isArray(item.acessorios) && item.acessorios.length ? `Acessórios: ${item.acessorios.join(", ")}` : "";
      const technical = [item.linha_aluminio && `Linha: ${item.linha_aluminio}`, item.cor && `Cor: ${item.cor}`,
        item.tipo_vidro && `Vidro: ${item.tipo_vidro}`, item.composicao_vidro, item.espessura_vidro]
        .filter((value) => value && !value.endsWith("A definir") && value !== "A definir").join("; ");
      const description = `${CATEGORIES[item.categoria] || item.categoria} - ${item.modelo || "Modelo a definir"}\n${MATERIALS[item.material] || item.material || "Material a definir"}${technical ? `\n${technical}` : ""}${specifications ? `\n${specifications}` : ""}${accessories ? `\n${accessories}` : ""}`;
      document.font("Helvetica").fontSize(8);
      const rowMainHeight = Math.max(40, document.heightOfString(description, { width: widths[1] - 6 }) + 12);
      const breakdown = partesDoItem(detail);
      const rowHeight = rowMainHeight + (breakdown.length ? breakdown.length * 12 + 8 : 0);
      if (document.y + rowHeight > document.page.height - 65) {
        document.addPage();
        continuationHeader();
        itemsHeader();
      }
      const y = document.y;
      if (index % 2) document.rect(48, y, contentWidth, rowHeight).fill("#f8fafb");
      const values = [String(index + 1), description, `${item.largura_cm} x ${item.altura_cm} cm`, String(item.quantidade), money(detail.subtotal_centavos)];
      values.forEach((value, column) => document.font(column === 4 ? "Helvetica-Bold" : "Helvetica").fontSize(8)
        .fillColor(column === 4 ? green : navy).text(value, columns[column] + 3, y + 8,
          { width: widths[column] - 6, align: column > 2 ? "right" : "left" }));
      breakdown.forEach((part, partIndex) => {
        const partY = y + rowMainHeight + 4 + partIndex * 12;
        document.font("Helvetica").fontSize(8).fillColor(muted)
          .text(part.rotulo, 78, partY, { width: 340 });
        document.font("Helvetica-Bold").fillColor(navy)
          .text(money(part.valor_centavos), 438, partY, { width: 105, align: "right" });
      });
      document.moveTo(48, y + rowHeight).lineTo(document.page.width - 48, y + rowHeight).strokeColor(line).lineWidth(.5).stroke();
      document.y = y + rowHeight;
    });

    const totaisPorParte = new Map();
    details.forEach((detail) => partesDoItem(detail).forEach((part) => {
      const atual = totaisPorParte.get(part.chave) || { rotulo: part.rotulo, valor_centavos: 0 };
      atual.valor_centavos += part.valor_centavos;
      totaisPorParte.set(part.chave, atual);
    }));
    if (totaisPorParte.size) {
      heading("Resumo dos valores");
      for (const part of totaisPorParte.values()) {
        ensureSpace(16);
        const partY = document.y;
        document.font("Helvetica").fontSize(9).fillColor(navy).text(part.rotulo, 55, partY, { width: 340 });
        document.font("Helvetica-Bold").fontSize(9).text(money(part.valor_centavos), 425, partY, { width: 120, align: "right" });
        document.y = partY + 16;
      }
    }

    ensureSpace(70);
    const totalY = document.y + 12;
    document.font("Helvetica").fontSize(9).fillColor(muted).text(quote.tipo_calculo === "composicao" ? "Valor calculado" : "Estimativa inicial", 330, totalY, { width: 105, align: "right" });
    document.font("Helvetica-Bold").fontSize(16).fillColor(green).text(money(quote.estimativa_centavos), 440, totalY - 4, { width: 106, align: "right" });
    document.y = totalY + 29;

    const proposals = Array.isArray(quote.propostas) ? quote.propostas : [];
    const currentProposal = proposals.at(-1);
    if (currentProposal) {
      ensureSpace(currentProposal.partes_valor_centavos ? 220 : 105);
      heading(`Proposta comercial - versão ${currentProposal.numero}`);
      ensureSpace(75);
      const proposalY = document.y;
      document.roundedRect(48, proposalY, contentWidth, 58, 7).fillAndStroke("#edf7f2", "#b8d8c8");
      document.font("Helvetica-Bold").fontSize(8).fillColor(muted).text("VALOR FINAL PROPOSTO", 62, proposalY + 12);
      document.fontSize(17).fillColor(green).text(money(currentProposal.valor_centavos), 62, proposalY + 27);
      document.font("Helvetica-Bold").fontSize(8).fillColor(muted).text("PRAZO", 285, proposalY + 12);
      document.font("Helvetica").fontSize(9).fillColor(navy).text(currentProposal.prazo, 285, proposalY + 27, { width: 244 });
      document.y = proposalY + 68;
      const proposalParts = currentProposal.partes_valor_centavos;
      if (proposalParts && typeof proposalParts === "object") {
        heading("Composição do valor final proposto");
        const labels = { materiais: "Materiais", mao_obra: "Mão de obra de fabricação", instalacao: "Instalação" };
        Object.entries(labels).forEach(([key, label]) => {
          const value = key === "materiais" ? (proposalParts[key] || 0) + (proposalParts.frete || 0)
            : key === "mao_obra" ? (proposalParts[key] || 0) + (proposalParts.outros || 0)
              : proposalParts[key];
          if (!Number.isSafeInteger(value) || value <= 0) return;
          ensureSpace(17);
          const partY = document.y;
          document.font("Helvetica").fontSize(9).fillColor(navy).text(label, 55, partY, { width: 340 });
          document.font("Helvetica-Bold").fontSize(9).text(money(value), 425, partY, { width: 120, align: "right" });
          document.y = partY + 17;
        });
      }
      if (currentProposal.observacoes) {
        ensureSpace(35);
        document.font("Helvetica").fontSize(9).fillColor(navy)
          .text(`Condições: ${currentProposal.observacoes}`, 48, document.y, { width: contentWidth, lineGap: 3 });
      }
    }

    if (quote.observacoes) {
      heading("Observações do cliente");
      document.font("Helvetica").fontSize(9).fillColor(navy).text(quote.observacoes, { lineGap: 3 });
    }

    heading("Informações importantes");
    document.font("Helvetica").fontSize(8.5).fillColor(muted).text(
      quote.tipo_calculo === "composicao"
        ? "Os valores separados são preços de venda, com margem, impostos e taxas distribuídos entre as categorias. O cálculo usa a ficha técnica e os custos cadastrados na data do envio. Medidas e condições do local ainda precisam de conferência. A proposta comercial, quando houver, prevalece."
        : quote.tipo_calculo === "misto"
          ? "Alguns itens foram calculados por ficha técnica e outros por estimativa por m². Os preços de venda por categoria incluem margem, impostos e taxas. Produto/serviço estimado não separa materiais e mão de obra. A equipe confirmará as medidas. A proposta comercial, quando houver, prevalece."
          : "A estimativa inicial considera as medidas e opções informadas no site. A linha Produto/serviço não separa materiais e mão de obra porque essa composição não estava disponível. O valor final depende de medição técnica e das condições do local. A proposta comercial, quando houver, prevalece.",
      { lineGap: 3 });

    const range = document.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page++) {
      document.switchToPage(page);
      const footerY = document.page.height - 67;
      document.moveTo(48, footerY - 8).lineTo(document.page.width - 48, footerY - 8).strokeColor(line).lineWidth(.5).stroke();
      document.font("Helvetica").fontSize(7.5).fillColor(muted).text(
        `Documento gerado em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        48, footerY, { width: 250, lineBreak: false });
      document.text(`Página ${page + 1} de ${range.count}`, 396, footerY, { width: 150, align: "right", lineBreak: false });
    }
    document.end();
  });
}

async function initOrcamentoPdf({ app, db, exigirLogin, logoPath }) {
  app.get("/api/orcamentos/:codigo/pdf", exigirLogin, async (req, res) => {
    const codigo = String(req.params.codigo || "");
    if (!/^MDE-\d{4}-\d{6}$/.test(codigo)) return res.status(400).json({ erro: "Orçamento inválido." });
    const row = await db.get(`SELECT * FROM orcamentos
      WHERE codigo=? AND usuario_id=? AND removido_em IS NULL`, [codigo, req.session.usuario.id]);
    if (!row) return res.status(404).json({ erro: "Orçamento não encontrado." });
    const quote = {
      ...row,
      itens: JSON.parse(row.itens_json),
      instalacao: Boolean(row.instalacao),
      estimativa_detalhes: row.estimativa_detalhes_json ? JSON.parse(row.estimativa_detalhes_json) : [],
      tipo_calculo: row.tipo_calculo,
      propostas: JSON.parse(row.propostas_json || "[]"),
    };
    const pdf = await gerarOrcamentoPdf(quote, logoPath);
    res.set("Cache-Control", "no-store");
    res.set("Content-Disposition", `attachment; filename="orcamento-${codigo}.pdf"`);
    res.type("application/pdf").send(pdf);
  });
}

module.exports = { initOrcamentoPdf, gerarOrcamentoPdf };
