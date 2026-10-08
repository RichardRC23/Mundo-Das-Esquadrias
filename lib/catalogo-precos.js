const REFERENCIA_PRECOS = Object.freeze({
  data: "2026-10-08",
  rotulo: "Referência de mercado do Rio de Janeiro — outubro de 2026",
  aviso: "Estimativa inicial. Medição técnica, ferragens, acesso, acabamento e condições do local podem alterar o valor final.",
});

const descricao = (texto) => `${texto}. Referência inicial RJ, out/2026`;
const regra = (categoria, modelo, precoM2, minimo, instalacao, texto) => ({
  categoria, modelo, descricao: descricao(texto),
  preco_m2_centavos: precoM2, preco_minimo_centavos: minimo,
  instalacao_centavos: instalacao,
});

// Valores iniciais de varejo/serviço para projetos residenciais sob medida no RJ.
// São inseridos como referência e podem ser substituídos pela tabela comercial no painel.
const PRECOS_INICIAIS = Object.freeze([
  regra("porta", "De correr", 155000, 180000, 35000, "Alumínio com vidro, ferragens padrão"),
  regra("porta", "De giro", 140000, 160000, 32000, "Alumínio com vidro, fechadura padrão"),
  regra("porta", "Pivotante", 190000, 240000, 45000, "Perfil reforçado e pivô padrão"),
  regra("porta", "Camarão / articulada", 175000, 200000, 45000, "Sistema articulado com ferragens"),
  regra("porta", "Porta-balcão", 165000, 220000, 40000, "Alumínio com vidro e trilhos"),
  regra("porta", "Outro modelo", 155000, 180000, 35000, "Referência genérica para porta sob medida"),

  regra("janela", "De correr", 90000, 75000, 18000, "Alumínio com vidro e ferragens padrão"),
  regra("janela", "Maxim-ar", 110000, 90000, 20000, "Alumínio com braço e fecho"),
  regra("janela", "Basculante", 95000, 80000, 18000, "Alumínio com mecanismo basculante"),
  regra("janela", "Guilhotina", 125000, 100000, 22000, "Alumínio com contrapeso ou sistema equivalente"),
  regra("janela", "Fixa", 85000, 70000, 15000, "Quadro de alumínio com vidro fixo"),
  regra("janela", "Outro modelo", 95000, 80000, 18000, "Referência genérica para janela sob medida"),

  regra("box", "Frontal de correr", 95000, 95000, 20000, "Vidro temperado com kit de correr"),
  regra("box", "De canto", 110000, 120000, 25000, "Vidro temperado com encontro de canto"),
  regra("box", "De abrir", 100000, 100000, 22000, "Vidro temperado com dobradiças"),
  regra("box", "Até o teto", 135000, 150000, 35000, "Vidro temperado em altura especial"),
  regra("box", "Banheira", 115000, 120000, 25000, "Vidro temperado para banheira"),
  regra("box", "Outro modelo", 105000, 100000, 22000, "Referência genérica para box sob medida"),

  regra("fachada", "Pele de vidro", 195000, 250000, 35000, "Sistema de fachada com perfis e vidro"),
  regra("fachada", "Structural glazing", 240000, 300000, 45000, "Sistema estrutural com silicone e perfis"),
  regra("fachada", "Fachada comercial", 150000, 200000, 30000, "Alumínio e vidro para frente de loja"),
  regra("fachada", "Vitrine", 125000, 150000, 25000, "Painéis de vidro com perfis e ferragens"),
  regra("fachada", "Outro modelo", 165000, 200000, 32000, "Referência genérica para fachada sob medida"),

  regra("guarda_corpo", "Com vidro", 150000, 160000, 30000, "Alumínio com vidro de segurança"),
  regra("guarda_corpo", "Com alumínio", 100000, 120000, 25000, "Estrutura e fechamento em alumínio"),
  regra("guarda_corpo", "Vidro autoportante", 180000, 200000, 40000, "Vidro laminado com fixação estrutural"),
  regra("guarda_corpo", "Corrimão", 45000, 45000, 20000, "Corrimão de alumínio sob medida"),
  regra("guarda_corpo", "Outro modelo", 135000, 150000, 30000, "Referência genérica para proteção sob medida"),

  regra("fechamento", "Fechamento de varanda", 85000, 120000, 25000, "Painéis de vidro e perfis de alumínio"),
  regra("fechamento", "Área gourmet", 105000, 140000, 28000, "Vidro temperado com perfis e ferragens"),
  regra("fechamento", "Divisória", 65000, 80000, 18000, "Divisória de vidro com perfis"),
  regra("fechamento", "Cortina de vidro", 110000, 150000, 30000, "Sistema retrátil de painéis de vidro"),
  regra("fechamento", "Outro modelo", 85000, 100000, 22000, "Referência genérica para fechamento sob medida"),

  regra("espelho", "Espelho lapidado", 35000, 30000, 12000, "Espelho lapidado sob medida"),
  regra("espelho", "Tampo de mesa", 60000, 45000, 15000, "Vidro temperado com acabamento de borda"),
  regra("espelho", "Prateleira", 50000, 25000, 10000, "Vidro com bordas lapidadas"),
  regra("espelho", "Painel de vidro", 45000, 35000, 15000, "Painel de vidro sob medida"),
  regra("espelho", "Vidro sob medida", 50000, 30000, 12000, "Vidro cortado e acabado sob medida"),
  regra("espelho", "Outro modelo", 45000, 30000, 12000, "Referência genérica para vidro ou espelho"),

  regra("cobertura", "Cobertura de vidro", 125000, 180000, 30000, "Vidro de segurança com estrutura"),
  regra("cobertura", "Policarbonato", 65000, 100000, 20000, "Policarbonato com estrutura de alumínio"),
  regra("cobertura", "Claraboia", 145000, 180000, 35000, "Vidro de segurança com vedação e estrutura"),
  regra("cobertura", "Toldo / estrutura", 70000, 100000, 20000, "Estrutura leve com cobertura"),
  regra("cobertura", "Outro modelo", 95000, 130000, 25000, "Referência genérica para cobertura sob medida"),

  regra("manutencao", "Troca de roldanas", 1, 16000, 0, "Serviço por esquadria, com par de roldanas padrão"),
  regra("manutencao", "Troca de vidro", 26000, 18000, 12000, "Vidro comum de referência; segurança e espessura alteram o valor"),
  regra("manutencao", "Ajuste de esquadria", 1, 15000, 0, "Regulagem e alinhamento por esquadria"),
  regra("manutencao", "Vedação", 1, 13000, 0, "Troca de vedação e ajuste básico por esquadria"),
  regra("manutencao", "Fechadura / puxador", 1, 18000, 0, "Ferragem padrão com substituição"),
  regra("manutencao", "Outro reparo", 1, 15000, 0, "Visita e reparo básico de referência"),

  regra("outro", "Projeto sob medida", 100000, 120000, 25000, "Referência preliminar para projeto personalizado"),
  regra("outro", "Ainda não sei definir", 100000, 120000, 25000, "Referência preliminar sujeita à definição técnica"),
]);

// Fatores em pontos-base (10000 = 1,00). A seleção "A definir" mantém a base.
const AJUSTES_PRECO = Object.freeze({
  linha_aluminio: Object.freeze({
    "Linha 16": 9000, "Linha 20": 10000, "Linha 25": 10800, "Linha 30": 11500,
    Suprema: 12000, Gold: 13000, Modular: 13500, Fachada: 14500, "Outro perfil": 11000,
  }),
  cor: Object.freeze({ Branco: 10000, Preto: 10500, Bronze: 10600, Fosco: 10500,
    Natural: 10000, "Natural fosco": 10000, Amadeirado: 11800, "Cor especial": 11000 }),
  tipo_vidro: Object.freeze({ Incolor: 10000, "Fumê": 10500, Verde: 10500, Bronze: 10500,
    "Extra clear": 11200, Refletivo: 11800, "Jateado ou fantasia": 11500, Espelho: 11500 }),
  composicao_vidro: Object.freeze({ Temperado: 10000, Laminado: 11500, Comum: 9000,
    Insulado: 15000, Aramado: 12000, Outro: 11000 }),
  espessura_vidro: Object.freeze({ "4 mm": 9000, "6 mm": 10000, "8 mm": 11000,
    "10 mm": 12000, "12 mm": 13500, Laminado: 12500 }),
  numero_folhas: Object.freeze({ "1": 9500, "2": 10000, "3": 11200, "4": 12500,
    "5": 13800, "6": 15000, "8": 17500 }),
  fechadura: Object.freeze({ "Padrão com chave": 10000, "Bico de papagaio": 10300,
    Multiponto: 11000, Digital: 12500, "Sem fechadura": 9700 }),
  tela_mosquiteira: Object.freeze({ Sim: 10800, "Não": 10000 }),
  automatizacao: Object.freeze({ Sim: 13000, "Não": 10000 }),
});

function ajustarProduto(precoCentavos, item) {
  let ajustado = precoCentavos;
  for (const [campo, fatores] of Object.entries(AJUSTES_PRECO)) {
    const fator = fatores[item[campo]];
    if (fator) ajustado = Math.round(ajustado * fator / 10000);
  }
  return ajustado;
}

module.exports = { REFERENCIA_PRECOS, PRECOS_INICIAIS, AJUSTES_PRECO, ajustarProduto };
