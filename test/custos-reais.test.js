const test = require("node:test");
const assert = require("node:assert/strict");
const { calcularItemPorComposicao } = require("../lib/custos-reais");
const { partesDoItem } = require("../lib/partes-orcamento");

const item = {
  categoria: "porta", modelo: "De correr", largura_cm: 200, altura_cm: 100,
  quantidade: 2, numero_folhas: "2", trilhos: "2 trilhos", linha_aluminio: "Suprema",
};
const ficha = { id: 1, versao: 3, preco_minimo_centavos: 0 };
const configuracao = {
  margem_bp: 2000, impostos_bp: 500, taxa_pagamento_bp: 300,
  despesa_fixa_centavos: 1000, frete_base_centavos: 2000,
};
const material = {
  material_ativo: 1, custo_confirmado: 1, perda_padrao_bp: 0,
  condicao_campo: null, condicao_valor: null, somente_instalacao: 0,
};
const componentes = [
  { ...material, codigo: "VID-6", nome: "Vidro 6 mm", grupo: "Vidro", unidade: "m2", custo_unitario_centavos: 10000, base_calculo: "area_m2", fator_milesimos: 1000, adicional_milesimos: 0, perda_bp: 1000 },
  { ...material, codigo: "PERF-SUP", nome: "Perfil Suprema", grupo: "Alumínio", unidade: "m", custo_unitario_centavos: 5000, base_calculo: "perimetro_m", fator_milesimos: 1200, adicional_milesimos: 0, perda_bp: null },
  { ...material, codigo: "MO-INST", nome: "Instalação", grupo: "Mão de obra", tipo_custo: "instalacao", unidade: "h", custo_unitario_centavos: 10000, base_calculo: "unidade", fator_milesimos: 0, adicional_milesimos: 2000, perda_bp: 0, somente_instalacao: 1 },
];

test("calcula materiais, perdas, despesas e margem pela ficha técnica", () => {
  const result = calcularItemPorComposicao({ item, ficha, componentes, configuracao, instalacao: true });
  assert.equal(result.custo_materiais_centavos, 58000);
  assert.equal(result.custo_direto_centavos, 81000);
  assert.equal(result.produto_unitario_centavos, 112500);
  assert.equal(result.subtotal_centavos, 225000);
  assert.equal(Object.values(result.partes_venda_unitarias_centavos).reduce((sum, value) => sum + value, 0), result.produto_unitario_centavos);
  assert.ok(result.partes_venda_unitarias_centavos.instalacao > 0);
  assert.ok(result.partes_venda_unitarias_centavos.materiais > 0);
  assert.deepEqual(Object.keys(result.partes_venda_unitarias_centavos), ["materiais", "mao_obra", "instalacao"]);
  assert.equal(result.ficha_versao, 3);
});

test("retira componentes de instalação quando o cliente pede somente fornecimento", () => {
  const result = calcularItemPorComposicao({ item, ficha, componentes, configuracao, instalacao: false });
  assert.equal(result.custo_materiais_centavos, 58000);
  assert.equal(result.produto_unitario_centavos, 84723);
  assert.equal(result.partes_venda_unitarias_centavos.instalacao, 0);
});

test("não ativa o cálculo real com custo ainda não confirmado", () => {
  const pendentes = [{ ...componentes[0], custo_confirmado: 0 }];
  assert.equal(calcularItemPorComposicao({ item, ficha, componentes: pendentes, configuracao, instalacao: true }), null);
});

test("aplica componentes condicionais somente à opção selecionada", () => {
  const condicionais = [
    { ...componentes[0], condicao_campo: "linha_aluminio", condicao_valor: "Suprema" },
    { ...componentes[1], condicao_campo: "linha_aluminio", condicao_valor: "Gold" },
  ];
  const result = calcularItemPorComposicao({ item, ficha, componentes: condicionais, configuracao, instalacao: true });
  assert.equal(result.componentes.length, 1);
  assert.equal(result.componentes[0].codigo, "VID-6");
});

test("cobra somente acessórios selecionados na ficha técnica", () => {
  const acessorios = [
    { ...componentes[0], codigo: "ROL-REF", condicao_campo: "acessorios", condicao_valor: "Roldanas reforçadas" },
    { ...componentes[1], codigo: "VED-KIT", condicao_campo: "acessorios", condicao_valor: "Kit de vedação" },
  ];
  const result = calcularItemPorComposicao({ item: { ...item, acessorios: ["Roldanas reforçadas"] }, ficha, componentes: acessorios, configuracao, instalacao: true });
  assert.deepEqual(result.componentes.map((component) => component.codigo), ["ROL-REF"]);
});

test("orçamentos antigos incorporam frete e outras despesas nas três categorias atuais", () => {
  const partes = partesDoItem({ quantidade: 1, subtotal_centavos: 10000,
    partes_venda_unitarias_centavos: { materiais: 6000, mao_obra: 2000, instalacao: 1000, frete: 500, outros: 500 } });
  assert.deepEqual(partes.map(({ chave, valor_centavos }) => ({ chave, valor_centavos })), [
    { chave: "materiais", valor_centavos: 6500 },
    { chave: "mao_obra", valor_centavos: 2500 },
    { chave: "instalacao", valor_centavos: 1000 },
  ]);
});
