const fs = require("node:fs/promises");
const path = require("node:path");
const { gerarOrcamentoPdf } = require("../lib/orcamento-pdf");

async function main() {
  const outputDir = path.join(__dirname, "..", "output", "pdf");
  await fs.mkdir(outputDir, { recursive: true });
  const quote = {
    codigo: "MDE-2026-000001",
    nome: "Cliente de exemplo",
    email: "cliente@exemplo.com",
    telefone: "(21) 99999-9999",
    cidade: "Rio de Janeiro",
    bairro: "Centro",
    instalacao: true,
    status: "aguardando_cliente",
    criado_em: "2026-10-08 12:00:00",
    observacoes: "Preferência por acabamento preto fosco.",
    itens: [
      { categoria: "porta", material: "aluminio_vidro", modelo: "De correr", largura_cm: 180, altura_cm: 210, quantidade: 1,
        linha_aluminio: "Suprema", cor: "Preto", tipo_vidro: "Incolor", composicao_vidro: "Temperado", espessura_vidro: "8 mm",
        numero_folhas: "4", configuracao_folhas: "2 móveis e demais fixas", sentido_abertura: "Ambos os lados",
        trilhos: "2 trilhos", fechadura: "Multiponto", puxador: "Tubular", soleira: "Embutida",
        tipo_instalacao: "Substituição", retirada_existente: "Sim", tela_mosquiteira: "Não", automatizacao: "Não" },
      { categoria: "box", material: "vidro", modelo: "Frontal de correr", largura_cm: 140, altura_cm: 190, quantidade: 1 },
    ],
    estimativa_centavos: 617000,
    estimativa_detalhes: [
      { produto_unitario_centavos: 293000, instalacao_unitaria_centavos: 35000, subtotal_centavos: 328000 },
      { produto_unitario_centavos: 269000, instalacao_unitaria_centavos: 20000, subtotal_centavos: 289000 },
    ],
    propostas: [{ numero: 1, valor_centavos: 599000, prazo: "15 dias úteis após a medição técnica",
      observacoes: "Materiais, ferragens e instalação incluídos.", situacao: "pendente" }],
  };
  const pdf = await gerarOrcamentoPdf(quote, path.join(__dirname, "..", "img", "Mundo das Esquadrias 2.jpg"));
  const output = path.join(outputDir, "orcamento-exemplo.pdf");
  await fs.writeFile(output, pdf);
  console.log(output);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
