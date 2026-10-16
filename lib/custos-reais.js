const BASES_CALCULO = Object.freeze({
  unidade: "Por unidade",
  area_m2: "Área (m²)",
  perimetro_m: "Perímetro (m)",
  largura_m: "Largura (m)",
  altura_m: "Altura (m)",
  folha: "Número de folhas",
  trilho: "Número de trilhos",
});

const UNIDADES = Object.freeze({ un: "unidade", m: "metro", m2: "m²", kg: "kg", h: "hora" });
const TIPOS_CUSTO = Object.freeze({
  materiais: "Materiais", mao_obra: "Mão de obra de fabricação",
  instalacao: "Instalação",
});
const CAMPOS_CONDICAO = new Set([
  "linha_aluminio", "cor", "tipo_vidro", "composicao_vidro", "espessura_vidro",
  "numero_folhas", "trilhos", "fechadura", "puxador", "tela_mosquiteira", "automatizacao",
  "acessorios",
]);

function baseDoItem(item, base) {
  const largura = item.largura_cm / 100;
  const altura = item.altura_cm / 100;
  if (base === "area_m2") return largura * altura;
  if (base === "perimetro_m") return 2 * (largura + altura);
  if (base === "largura_m") return largura;
  if (base === "altura_m") return altura;
  if (base === "folha") return Number(item.numero_folhas) || 1;
  if (base === "trilho") return String(item.trilhos).toLowerCase().includes("sem trilho") ? 0 : (Number.parseInt(item.trilhos, 10) || 1);
  return 1;
}

function componenteAplicavel(componente, item, instalacao) {
  if ((componente.somente_instalacao || componente.tipo_custo === "instalacao") && !instalacao) return false;
  if (!componente.condicao_campo) return true;
  if (componente.condicao_campo === "acessorios") return Array.isArray(item.acessorios) && item.acessorios.includes(componente.condicao_valor);
  return item[componente.condicao_campo] === componente.condicao_valor;
}

function calcularItemPorComposicao({ item, ficha, componentes, configuracao, instalacao }) {
  const usados = componentes.filter((componente) => componenteAplicavel(componente, item, instalacao));
  if (!usados.length || usados.some((componente) => !componente.material_ativo || !componente.custo_confirmado)) return null;

  const detalhamento = usados.map((componente) => {
    const base = baseDoItem(item, componente.base_calculo);
    const quantidadeSemPerda = Math.round(base * componente.fator_milesimos) + componente.adicional_milesimos;
    const perdaBp = componente.perda_bp == null ? componente.perda_padrao_bp : componente.perda_bp;
    const quantidade = Math.round(quantidadeSemPerda * (10000 + perdaBp) / 10000);
    const custo = Math.round(quantidade * componente.custo_unitario_centavos / 1000);
    return {
      codigo: componente.codigo,
      nome: componente.nome,
      grupo: componente.grupo,
      tipo_custo: componente.tipo_custo,
      unidade: componente.unidade,
      quantidade_milesimos: quantidade,
      custo_unitario_centavos: componente.custo_unitario_centavos,
      perda_bp: perdaBp,
      custo_centavos: custo,
    };
  });

  const custosPorTipo = Object.fromEntries(Object.keys(TIPOS_CUSTO).map((tipo) => [tipo, 0]));
  for (const componente of detalhamento) custosPorTipo[componente.tipo_custo || "materiais"] += componente.custo_centavos;
  const materiais = custosPorTipo.materiais;
  // Logística compõe materiais e despesas operacionais compõem mão de obra,
  // mantendo esses custos no preço sem criar categorias extras para o cliente.
  custosPorTipo.materiais += configuracao.frete_base_centavos;
  custosPorTipo.mao_obra += configuracao.despesa_fixa_centavos;
  const custoDireto = Object.values(custosPorTipo).reduce((total, custo) => total + custo, 0);
  const descontosBp = configuracao.impostos_bp + configuracao.taxa_pagamento_bp + configuracao.margem_bp;
  if (descontosBp >= 10000) throw new Error("Impostos, taxa de pagamento e margem devem somar menos de 100%.");
  const vendaCalculada = Math.ceil(custoDireto * 10000 / (10000 - descontosBp));
  const unitario = Math.max(vendaCalculada, ficha.preco_minimo_centavos || 0);
  // Distribui o preço de venda (incluindo margem e tributos) sem perder centavos no arredondamento.
  const partesVenda = Object.fromEntries(Object.keys(TIPOS_CUSTO).map((tipo) => [tipo, 0]));
  if (custoDireto === 0) {
    partesVenda.materiais = unitario;
  } else {
    const restos = Object.entries(custosPorTipo).map(([tipo, custo]) => {
      const exato = custo * unitario / custoDireto;
      partesVenda[tipo] = Math.floor(exato);
      return { tipo, resto: exato - partesVenda[tipo] };
    }).sort((a, b) => b.resto - a.resto);
    let diferenca = unitario - Object.values(partesVenda).reduce((total, valor) => total + valor, 0);
    for (let i = 0; i < diferenca; i++) partesVenda[restos[i % restos.length].tipo]++;
  }

  return {
    categoria: item.categoria,
    modelo: item.modelo,
    quantidade: item.quantidade,
    ficha_versao: ficha.versao,
    metodo: "composicao",
    custo_materiais_centavos: materiais,
    custo_direto_centavos: custoDireto,
    produto_unitario_centavos: unitario,
    partes_venda_unitarias_centavos: partesVenda,
    subtotal_centavos: unitario * item.quantidade,
    configuracao: {
      margem_bp: configuracao.margem_bp,
      impostos_bp: configuracao.impostos_bp,
      taxa_pagamento_bp: configuracao.taxa_pagamento_bp,
      despesa_fixa_centavos: configuracao.despesa_fixa_centavos,
      frete_base_centavos: configuracao.frete_base_centavos,
    },
    componentes: detalhamento,
  };
}

async function initCustosReais(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS configuracao_custos (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    margem_bp INTEGER NOT NULL DEFAULT 2500,
    impostos_bp INTEGER NOT NULL DEFAULT 600,
    taxa_pagamento_bp INTEGER NOT NULL DEFAULT 500,
    despesa_fixa_centavos INTEGER NOT NULL DEFAULT 0,
    frete_base_centavos INTEGER NOT NULL DEFAULT 0,
    atualizado_em TEXT
  )`);
  await db.run("INSERT OR IGNORE INTO configuracao_custos (id) VALUES (1)");
  await db.run(`CREATE TABLE IF NOT EXISTS materiais_custo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    grupo TEXT NOT NULL,
    unidade TEXT NOT NULL,
    custo_unitario_centavos INTEGER NOT NULL,
    tipo_custo TEXT NOT NULL DEFAULT 'materiais',
    perda_padrao_bp INTEGER NOT NULL DEFAULT 0,
    fornecedor TEXT,
    referencia_em TEXT,
    custo_confirmado INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT
  )`);
  const materialColumns = await db.all("PRAGMA table_info(materiais_custo)");
  if (!materialColumns.some((column) => column.name === "tipo_custo")) {
    await db.run("ALTER TABLE materiais_custo ADD COLUMN tipo_custo TEXT NOT NULL DEFAULT 'materiais'");
  }
  await db.run("UPDATE materiais_custo SET tipo_custo='materiais' WHERE tipo_custo='frete'");
  await db.run("UPDATE materiais_custo SET tipo_custo='mao_obra' WHERE tipo_custo='outros'");
  await db.run(`CREATE TABLE IF NOT EXISTS fichas_tecnicas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria TEXT NOT NULL,
    modelo TEXT NOT NULL,
    versao INTEGER NOT NULL DEFAULT 1,
    preco_minimo_centavos INTEGER NOT NULL DEFAULT 0,
    validada INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT,
    UNIQUE (categoria, modelo)
  )`);
  const fichaColumns = await db.all("PRAGMA table_info(fichas_tecnicas)");
  if (!fichaColumns.some((column) => column.name === "validada")) {
    await db.run("ALTER TABLE fichas_tecnicas ADD COLUMN validada INTEGER NOT NULL DEFAULT 0");
  }
  await db.run(`CREATE TABLE IF NOT EXISTS ficha_componentes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ficha_id INTEGER NOT NULL REFERENCES fichas_tecnicas(id) ON DELETE CASCADE,
    material_id INTEGER NOT NULL REFERENCES materiais_custo(id),
    base_calculo TEXT NOT NULL,
    fator_milesimos INTEGER NOT NULL DEFAULT 1000,
    adicional_milesimos INTEGER NOT NULL DEFAULT 0,
    perda_bp INTEGER,
    condicao_campo TEXT,
    condicao_valor TEXT,
    somente_instalacao INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function carregarDadosCustos(db) {
  const [configuracao, fichas, componentes] = await Promise.all([
    db.get("SELECT * FROM configuracao_custos WHERE id = 1"),
    db.all("SELECT * FROM fichas_tecnicas WHERE ativo = 1 AND validada = 1"),
    db.all(`SELECT fc.*,m.codigo,m.nome,m.grupo,m.unidade,m.tipo_custo,m.custo_unitario_centavos,
      m.perda_padrao_bp,m.custo_confirmado,m.ativo AS material_ativo
      FROM ficha_componentes fc JOIN materiais_custo m ON m.id=fc.material_id`),
  ]);
  const fichasPorProduto = new Map(fichas.map((ficha) => [`${ficha.categoria}\u0000${ficha.modelo}`, ficha]));
  const componentesPorFicha = new Map();
  for (const componente of componentes) {
    if (!componentesPorFicha.has(componente.ficha_id)) componentesPorFicha.set(componente.ficha_id, []);
    componentesPorFicha.get(componente.ficha_id).push(componente);
  }
  return { configuracao, fichasPorProduto, componentesPorFicha };
}

module.exports = {
  BASES_CALCULO, UNIDADES, TIPOS_CUSTO, CAMPOS_CONDICAO,
  calcularItemPorComposicao, initCustosReais, carregarDadosCustos,
};
