const { propostas } = require("./propostas");
const { REFERENCIA_PRECOS, PRECOS_INICIAIS, AJUSTES_PRECO, ajustarProduto } = require("./catalogo-precos");
const { initCustosReais, carregarDadosCustos, calcularItemPorComposicao } = require("./custos-reais");
const { detalhePublico } = require("./partes-orcamento");
const CATEGORIAS = new Set([
  "porta", "janela", "box", "fachada", "guarda_corpo", "fechamento",
  "espelho", "cobertura", "manutencao", "outro",
]);
const MATERIAIS = new Set(["aluminio_vidro", "aluminio", "vidro", "manutencao", "outro"]);
const CAIXAS_BOX = new Set(["Caixa redonda", "Caixa quadrada"]);
const ACESSORIOS_POR_CATEGORIA = Object.freeze({
  porta: new Set(["Roldanas reforçadas", "Fechamento suave", "Limitador de abertura", "Kit de vedação", "Controle remoto adicional"]),
  janela: new Set(["Roldanas reforçadas", "Limitador de abertura", "Kit de vedação", "Tela mosquiteira removível", "Trava de segurança"]),
  box: new Set(["Kit de ferragens inox", "Puxador duplo", "Barra de apoio", "Película de segurança"]),
  fachada: new Set(["Película de segurança", "Fechadura adicional", "Mola aérea", "Controle de acesso"]),
  guarda_corpo: new Set(["Corrimão adicional", "Kit de fixação inox", "Acabamento de base"]),
  fechamento: new Set(["Roldanas reforçadas", "Fechamento suave", "Kit de vedação", "Trava de segurança"]),
  espelho: new Set(["Moldura de alumínio", "Iluminação LED", "Película de segurança", "Fixação invisível"]),
  cobertura: new Set(["Calha", "Rufo", "Kit de vedação", "Película de controle solar"]),
  manutencao: new Set(["Kit de roldanas", "Kit de vedação", "Fechadura", "Puxador"]),
  outro: new Set(["Kit de vedação", "Película de segurança", "Fixação reforçada"]),
});
const PORTA_ESPECIFICACOES = Object.freeze({
  numero_folhas: new Set(["A definir", "1", "2", "3", "4", "5", "6", "8"]),
  configuracao_folhas: new Set(["A definir", "Todas móveis", "1 móvel e demais fixas", "2 móveis e demais fixas", "Laterais fixas e centrais móveis", "Todas de giro", "Articuladas"]),
  sentido_abertura: new Set(["A definir", "Direita", "Esquerda", "Ambos os lados", "Para dentro", "Para fora"]),
  trilhos: new Set(["A definir", "Sem trilho", "1 trilho", "2 trilhos", "3 trilhos", "4 trilhos"]),
  fechadura: new Set(["A definir", "Padrão com chave", "Bico de papagaio", "Multiponto", "Digital", "Sem fechadura"]),
  puxador: new Set(["A definir", "Concha", "Alça", "Tubular", "Embutido", "Sem puxador"]),
  soleira: new Set(["A definir", "Convencional", "Embutida", "Baixa acessível", "Sem soleira"]),
  tipo_instalacao: new Set(["A definir", "Vão novo", "Substituição", "Adequação do vão"]),
  retirada_existente: new Set(["A definir", "Sim", "Não"]),
  tela_mosquiteira: new Set(["A definir", "Sim", "Não"]),
  automatizacao: new Set(["A definir", "Sim", "Não"]),
});

const fail = (status, message) => Object.assign(new Error(message), { status });
const clean = (value, max = 200) => {
  if (value == null) return "";
  if (typeof value !== "string") throw fail(400, "Há informações inválidas no orçamento.");
  return value.trim().replace(/\s+/g, " ").slice(0, max);
};

function numberInRange(value, min, max, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw fail(400, `${label} deve estar entre ${min} e ${max}.`);
  }
  return Math.round(number * 10) / 10;
}

function especificacoesPorta(item, categoria, index) {
  const result = {};
  for (const [field, allowed] of Object.entries(PORTA_ESPECIFICACOES)) {
    if (categoria !== "porta") {
      result[field] = "";
      continue;
    }
    const value = clean(item[field], 60) || "A definir";
    if (!allowed.has(value)) throw fail(400, `A especificação ${field.replaceAll("_", " ")} do item ${index + 1} é inválida.`);
    result[field] = value;
  }
  return result;
}

function validarAcessorios(value, categoria, index) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 10) throw fail(400, `Os acessórios do item ${index + 1} são inválidos.`);
  const allowed = ACESSORIOS_POR_CATEGORIA[categoria] || new Set();
  const result = value.map((accessory) => clean(accessory, 80));
  if (result.some((accessory) => !allowed.has(accessory)) || new Set(result).size !== result.length) {
    throw fail(400, `Escolha somente acessórios disponíveis para o item ${index + 1}.`);
  }
  return result;
}

function validarOrcamento(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw fail(400, "Preencha os dados do orçamento.");
  }
  const nome = clean(body.nome, 120);
  const email = clean(body.email, 254).toLowerCase() || null;
  const telefone = clean(body.telefone, 30).replace(/\D/g, "");
  const cidade = clean(body.cidade, 100);
  const bairro = clean(body.bairro, 100);
  if (!nome) throw fail(400, "Informe o nome do responsável pelo orçamento.");
  if (!/^\d{10,13}$/.test(telefone)) throw fail(400, "Informe um telefone com DDD.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, "Informe um e-mail válido.");
  if (!cidade) throw fail(400, "Informe a cidade da instalação.");
  if (!Array.isArray(body.itens) || body.itens.length < 1 || body.itens.length > 10) {
    throw fail(400, "Adicione de 1 a 10 itens ao orçamento.");
  }

  const itens = body.itens.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw fail(400, `O item ${index + 1} é inválido.`);
    }
    const categoria = clean(item.categoria, 30);
    const material = clean(item.material, 30);
    const modelo = clean(item.modelo, 100);
    if (!CATEGORIAS.has(categoria)) throw fail(400, `Escolha o serviço do item ${index + 1}.`);
    if (!MATERIAIS.has(material)) throw fail(400, `Escolha o material do item ${index + 1}.`);
    const tipoCaixaInformado = clean(item.tipo_caixa, 30);
    const tipoCaixa = tipoCaixaInformado || (/Caixa Quadrada$/i.test(modelo) ? "Caixa quadrada" : /Caixa Redonda$/i.test(modelo) ? "Caixa redonda" : "");
    const exigeTipoCaixa = categoria === "box" && /^Frontal de Correr F[123] Caixa (?:Redonda|Quadrada)$/i.test(modelo);
    if (exigeTipoCaixa && !CAIXAS_BOX.has(tipoCaixa)) throw fail(400, `Escolha o formato da caixa do box no item ${index + 1}.`);
    return {
      categoria,
      material,
      ...especificacoesPorta(item, categoria, index),
      acessorios: validarAcessorios(item.acessorios, categoria, index),
      modelo,
      linha_aluminio: clean(item.linha_aluminio, 60),
      cor: clean(item.cor, 60),
      tipo_vidro: clean(item.tipo_vidro, 60),
      composicao_vidro: clean(item.composicao_vidro, 60),
      espessura_vidro: clean(item.espessura_vidro, 20),
      tipo_caixa: exigeTipoCaixa ? tipoCaixa : "",
      largura_cm: numberInRange(item.largura_cm, 10, 1500, `A largura do item ${index + 1}`),
      altura_cm: numberInRange(item.altura_cm, 10, 1500, `A altura do item ${index + 1}`),
      quantidade: numberInRange(item.quantidade, 1, 50, `A quantidade do item ${index + 1}`),
      ambiente: clean(item.ambiente, 80),
      detalhes: clean(item.detalhes, 500),
    };
  }).map((item, index) => {
    if (!Number.isInteger(item.quantidade)) throw fail(400, `A quantidade do item ${index + 1} deve ser um número inteiro.`);
    return item;
  });

  return {
    nome, email, telefone, cidade, bairro, itens,
    instalacao: body.instalacao !== false,
    observacoes: clean(body.observacoes, 1000),
  };
}

async function initOrcamentos({ app, db, exigirLogin, changesLimit, comprasOrcamentoConfiguradas = false, aceitarCreditosMPTeste = false }) {
  await db.run(`CREATE TABLE IF NOT EXISTS orcamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE,
    usuario_id INTEGER,
    nome TEXT NOT NULL,
    email TEXT,
    telefone TEXT NOT NULL,
    cidade TEXT NOT NULL,
    bairro TEXT,
    itens_json TEXT NOT NULL,
    instalacao INTEGER NOT NULL DEFAULT 1,
    observacoes TEXT,
    status TEXT NOT NULL DEFAULT 'recebido',
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
  )`);
  const quoteColumns = await db.all("PRAGMA table_info(orcamentos)");
  for (const [name, type] of [["estimativa_centavos", "INTEGER"], ["estimativa_detalhes_json", "TEXT"], ["tipo_calculo", "TEXT NOT NULL DEFAULT 'estimativa'"], ["atualizado_em", "TEXT"], ["removido_em", "TEXT"]]) {
    if (!quoteColumns.some((column) => column.name === name)) await db.run(`ALTER TABLE orcamentos ADD COLUMN ${name} ${type}`);
  }
  await db.run(`CREATE TABLE IF NOT EXISTS precos_orcamento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria TEXT NOT NULL,
    modelo TEXT NOT NULL,
    descricao TEXT,
    precos_cores_json TEXT NOT NULL DEFAULT '{}',
    precos_vidros_json TEXT NOT NULL DEFAULT '{}',
    precos_combinacoes_json TEXT NOT NULL DEFAULT '{}',
    preco_m2_centavos INTEGER NOT NULL,
    preco_minimo_centavos INTEGER NOT NULL DEFAULT 0,
    instalacao_centavos INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1,
    origem TEXT NOT NULL DEFAULT 'empresa',
    referencia_em TEXT,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT,
    UNIQUE (categoria, modelo)
  )`);
  const priceColumns = await db.all("PRAGMA table_info(precos_orcamento)");
  for (const [name, type] of [["origem", "TEXT NOT NULL DEFAULT 'empresa'"], ["referencia_em", "TEXT"], ["precos_cores_json", "TEXT NOT NULL DEFAULT '{}'"], ["precos_vidros_json", "TEXT NOT NULL DEFAULT '{}'"]]) {
    if (!priceColumns.some((column) => column.name === name)) await db.run(`ALTER TABLE precos_orcamento ADD COLUMN ${name} ${type}`);
  }
  if (!priceColumns.some((column) => column.name === "precos_combinacoes_json")) {
    await db.run("ALTER TABLE precos_orcamento ADD COLUMN precos_combinacoes_json TEXT NOT NULL DEFAULT '{}' ");
  }
  // Mantém preços personalizados e orçamentos antigos ao atualizar o nome comercial do modelo.
  await db.run("UPDATE precos_orcamento SET modelo='Box Open' WHERE categoria='box' AND modelo='De abrir' AND NOT EXISTS (SELECT 1 FROM precos_orcamento p2 WHERE p2.categoria='box' AND p2.modelo='Box Open')");
  await db.run(`UPDATE orcamentos SET itens_json=REPLACE(itens_json,'"modelo":"De abrir"','"modelo":"Box Open"')
    WHERE itens_json LIKE '%"modelo":"De abrir"%'`);
  // Padroniza os nomes do box frontal sem perder preços ou orçamentos anteriores.
  for (const [anterior, atual] of [
    ["Frontal de correr", "Frontal de correr F2"],
    ["Box frontal F1", "Frontal de correr F1"],
    ["Box frontal F2", "Frontal de correr F2"],
    ["Box frontal F3", "Frontal de correr F3"],
  ]) {
    await db.run(`UPDATE precos_orcamento SET modelo=? WHERE categoria='box' AND modelo=?
      AND NOT EXISTS (SELECT 1 FROM precos_orcamento p2 WHERE p2.categoria='box' AND p2.modelo=?)`, [atual, anterior, atual]);
    await db.run("UPDATE orcamentos SET itens_json=REPLACE(itens_json, ?, ?) WHERE itens_json LIKE ?",
      [`\"modelo\":\"${anterior}\"`, `\"modelo\":\"${atual}\"`, `%\"modelo\":\"${anterior}\"%`]);
  }
  // Restaura uma única vez as regras F1/F2/F3 desativadas na versão anterior.
  await db.run(`CREATE TABLE IF NOT EXISTS migracoes_app (
    chave TEXT PRIMARY KEY,
    aplicada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  // Remove o modelo que a empresa não comercializa, preservando os orçamentos antigos.
  if (!await db.get("SELECT chave FROM migracoes_app WHERE chave='remove_box_banheira'")) {
    await db.run("DELETE FROM precos_orcamento WHERE categoria='box' AND modelo='Banheira'");
    await db.run("INSERT INTO migracoes_app (chave) VALUES ('remove_box_banheira')");
  }
  if (!await db.get("SELECT chave FROM migracoes_app WHERE chave='restaura_precos_box_f123'")) {
    await db.run(`UPDATE precos_orcamento SET ativo=1 WHERE categoria='box'
      AND modelo IN ('Frontal de correr F1','Frontal de correr F2','Frontal de correr F3')`);
    await db.run("INSERT INTO migracoes_app (chave) VALUES ('restaura_precos_box_f123')");
  }
  // Separa os preços antigos em seis registros independentes, sem sobrescrever combinações já cadastradas.
  if (!await db.get("SELECT chave FROM migracoes_app WHERE chave='separa_precos_caixas_box'")) {
    for (const folha of ["F1", "F2", "F3"]) {
      for (const formato of ["Redonda", "Quadrada"]) {
        const novoModelo = `Frontal de Correr ${folha} Caixa ${formato}`;
        await db.run(`INSERT OR IGNORE INTO precos_orcamento
          (categoria,modelo,descricao,precos_cores_json,precos_vidros_json,preco_m2_centavos,
           preco_minimo_centavos,instalacao_centavos,ativo,origem,referencia_em,criado_em,atualizado_em)
          SELECT categoria,?,descricao,precos_cores_json,precos_vidros_json,preco_m2_centavos,
           preco_minimo_centavos,instalacao_centavos,ativo,origem,referencia_em,criado_em,atualizado_em
          FROM precos_orcamento WHERE categoria='box' AND modelo=?`, [novoModelo, `Frontal de correr ${folha}`]);
      }
    }
    await db.run(`UPDATE precos_orcamento SET ativo=0 WHERE categoria='box'
      AND modelo IN ('Frontal de correr F1','Frontal de correr F2','Frontal de correr F3')`);

      await db.run("INSERT INTO migracoes_app (chave) VALUES ('separa_precos_caixas_box')");
  }
  // Mantém somente o preço de vidro Incolor já cadastrado em cada produto.
  if (!await db.get("SELECT chave FROM migracoes_app WHERE chave='mantem_somente_vidro_incolor'")) {
    const regrasComVidro = await db.all("SELECT id,precos_vidros_json FROM precos_orcamento");
    for (const regra of regrasComVidro) {
      let precosVidros = {};
      try { precosVidros = JSON.parse(regra.precos_vidros_json || "{}"); } catch {}
      const somenteIncolor = Object.hasOwn(precosVidros, "Incolor") ? { Incolor: precosVidros.Incolor } : {};
      await db.run("UPDATE precos_orcamento SET precos_vidros_json=? WHERE id=?", [JSON.stringify(somenteIncolor), regra.id]);
    }
    await db.run("INSERT INTO migracoes_app (chave) VALUES ('mantem_somente_vidro_incolor')");
  }
  for (const item of PRECOS_INICIAIS) {
    await db.run(`INSERT OR IGNORE INTO precos_orcamento
      (categoria,modelo,descricao,preco_m2_centavos,preco_minimo_centavos,instalacao_centavos,ativo,origem,referencia_em)
      VALUES (?,?,?,?,?,?,1,'referencia',?)`,
    [item.categoria, item.modelo, item.descricao, item.preco_m2_centavos,
      item.preco_minimo_centavos, item.instalacao_centavos, REFERENCIA_PRECOS.data]);

    }
  // Copia cada preço já salvo para o vidro Incolor, sem apagar o preço padrão do produto.
  if (!await db.get("SELECT chave FROM migracoes_app WHERE chave='copia_precos_salvos_para_vidro_incolor'")) {
    const regrasSalvas = await db.all(`SELECT id,preco_m2_centavos,preco_minimo_centavos,instalacao_centavos
      FROM precos_orcamento`);
    for (const regra of regrasSalvas) {
      const precoIncolor = {
        Incolor: {
          preco_m2_centavos: regra.preco_m2_centavos,
          preco_minimo_centavos: regra.preco_minimo_centavos,
          instalacao_centavos: regra.instalacao_centavos,
        },
      };
      await db.run("UPDATE precos_orcamento SET precos_vidros_json=? WHERE id=?", [JSON.stringify(precoIncolor), regra.id]);
    }
    await db.run("INSERT INTO migracoes_app (chave) VALUES ('copia_precos_salvos_para_vidro_incolor')");
  }
  // Preço comercial informado para o F2 de caixa redonda, sem alterar as demais variações já salvas.
  if (!await db.get("SELECT chave FROM migracoes_app WHERE chave='preco_f2_redonda_423_20261109'")) {
    const modelo = "Frontal de Correr F2 Caixa Redonda";
    const valor = { preco_m2_centavos: 42300, preco_minimo_centavos: 41800, instalacao_centavos: 15000 };
    const regra = await db.get(`SELECT id,precos_cores_json,precos_vidros_json FROM precos_orcamento
      WHERE categoria='box' AND modelo=?`, [modelo]);
    if (regra) {
      let precosCores = {};
      let precosVidros = {};
      try { precosCores = JSON.parse(regra.precos_cores_json || "{}"); } catch {}
      try { precosVidros = JSON.parse(regra.precos_vidros_json || "{}"); } catch {}
      precosCores.Branco = { ...valor };
      precosCores.Preto = { ...valor };
      precosVidros["Fumê"] = { ...valor };
      precosVidros.Verde = { ...valor };
      await db.run(`UPDATE precos_orcamento SET precos_cores_json=?,precos_vidros_json=?,ativo=1,
        atualizado_em=CURRENT_TIMESTAMP WHERE id=?`, [JSON.stringify(precosCores), JSON.stringify(precosVidros), regra.id]);
    } else {
      await db.run(`INSERT INTO precos_orcamento
        (categoria,modelo,descricao,precos_cores_json,precos_vidros_json,preco_m2_centavos,
         preco_minimo_centavos,instalacao_centavos,ativo,origem,referencia_em)
        VALUES ('box',?,?,?,?,?,?,?,1,'empresa',?)`, [modelo, "Box frontal F2 com caixa redonda",
        JSON.stringify({ Branco: valor, Preto: valor }), JSON.stringify({ "Fumê": valor, Verde: valor }),
        valor.preco_m2_centavos, valor.preco_minimo_centavos, valor.instalacao_centavos, "2026-11-09"]);
    }
    await db.run("INSERT INTO migracoes_app (chave) VALUES ('preco_f2_redonda_423_20261109')");
  }
  // Preço informado posteriormente para os kits cromado/bronze e vidros fumê/verde do F2 redondo.
  if (!await db.get("SELECT chave FROM migracoes_app WHERE chave='preco_f2_redonda_cromada_bronze_473_20261109'")) {
    const modelo = "Frontal de Correr F2 Caixa Redonda";
    const valor = { preco_m2_centavos: 47300, preco_minimo_centavos: 46800, instalacao_centavos: 15000 };
    const regra = await db.get(`SELECT id,precos_cores_json,precos_vidros_json FROM precos_orcamento
      WHERE categoria='box' AND modelo=?`, [modelo]);
    if (regra) {
      let precosCores = {};
      let precosVidros = {};
      try { precosCores = JSON.parse(regra.precos_cores_json || "{}"); } catch {}
      try { precosVidros = JSON.parse(regra.precos_vidros_json || "{}"); } catch {}
      precosCores.Cromada = { ...valor };
      precosCores.Bronze = { ...valor };
      precosVidros["Fumê"] = { ...valor };
      precosVidros.Verde = { ...valor };
      await db.run(`UPDATE precos_orcamento SET precos_cores_json=?,precos_vidros_json=?,ativo=1,
        atualizado_em=CURRENT_TIMESTAMP WHERE id=?`, [JSON.stringify(precosCores), JSON.stringify(precosVidros), regra.id]);
    }
    await db.run("INSERT INTO migracoes_app (chave) VALUES ('preco_f2_redonda_cromada_bronze_473_20261109')");
  }
  // Preço informado para o kit dourado e vidros fumê/verde do F2 de caixa redonda.

  if (!await db.get("SELECT chave FROM migracoes_app WHERE chave='preco_f2_redonda_dourado_821_20261109'")) {
    const modelo = "Frontal de Correr F2 Caixa Redonda";
    const valor = { preco_m2_centavos: 82100, preco_minimo_centavos: 81600, instalacao_centavos: 15000 };
    const regra = await db.get(`SELECT id,precos_cores_json,precos_vidros_json FROM precos_orcamento
      WHERE categoria='box' AND modelo=?`, [modelo]);
    if (regra) {
      let precosCores = {};
      let precosVidros = {};
      try { precosCores = JSON.parse(regra.precos_cores_json || "{}"); } catch {}
      try { precosVidros = JSON.parse(regra.precos_vidros_json || "{}"); } catch {}
      precosCores.Dourado = { ...valor };
      precosVidros["Fumê"] = { ...valor };
      precosVidros.Verde = { ...valor };
      await db.run(`UPDATE precos_orcamento SET precos_cores_json=?,precos_vidros_json=?,ativo=1,
        atualizado_em=CURRENT_TIMESTAMP WHERE id=?`, [JSON.stringify(precosCores), JSON.stringify(precosVidros), regra.id]);
    }
    await db.run("INSERT INTO migracoes_app (chave) VALUES ('preco_f2_redonda_dourado_821_20261109')");
  }
  // Preço informado para kit cromado e vidros fumê/verde do F1 de caixa redonda.


  if (!await db.get("SELECT chave FROM migracoes_app WHERE chave='preco_f1_redonda_cromado_536_20261109'")) {
    const modelo = "Frontal de Correr F1 Caixa Redonda";
    const valor = { preco_m2_centavos: 53600, preco_minimo_centavos: 53100, instalacao_centavos: 15000 };
    const regra = await db.get(`SELECT id,precos_cores_json,precos_vidros_json FROM precos_orcamento
      WHERE categoria='box' AND modelo=?`, [modelo]);
    if (regra) {
      let precosCores = {};
      let precosVidros = {};
      try { precosCores = JSON.parse(regra.precos_cores_json || "{}"); } catch {}
      try { precosVidros = JSON.parse(regra.precos_vidros_json || "{}"); } catch {}
      precosCores.Cromada = { ...valor };
      precosVidros["Fumê"] = { ...valor };
      precosVidros.Verde = { ...valor };
      await db.run(`UPDATE precos_orcamento SET precos_cores_json=?,precos_vidros_json=?,ativo=1,
        atualizado_em=CURRENT_TIMESTAMP WHERE id=?`, [JSON.stringify(precosCores), JSON.stringify(precosVidros), regra.id]);
    }
    await db.run("INSERT INTO migracoes_app (chave) VALUES ('preco_f1_redonda_cromado_536_20261109')");
  }
  // Preços exclusivos das combinações de kit e vidro solicitadas para o F3 redondo.

  if (!await db.get("SELECT chave FROM migracoes_app WHERE chave='preco_f3_redonda_combinacoes_41525_20261109'")) {
    const modelo = "Frontal de Correr F3 Caixa Redonda";
    const valor = { preco_m2_centavos: 41525, preco_minimo_centavos: 41025, instalacao_centavos: 20000 };
    const regra = await db.get(`SELECT id,precos_combinacoes_json FROM precos_orcamento
      WHERE categoria='box' AND modelo=?`, [modelo]);
    if (regra) {
      let combinacoes = {};
      try { combinacoes = JSON.parse(regra.precos_combinacoes_json || "{}"); } catch {}
      for (const kit of ["Branco", "Preto"]) {
        for (const vidro of ["Fumê", "Verde"]) combinacoes[JSON.stringify([kit, vidro])] = { ...valor };
      }
      await db.run(`UPDATE precos_orcamento SET precos_combinacoes_json=?,ativo=1,
        atualizado_em=CURRENT_TIMESTAMP WHERE id=?`, [JSON.stringify(combinacoes), regra.id]);
    }
    await db.run("INSERT INTO migracoes_app (chave) VALUES ('preco_f3_redonda_combinacoes_41525_20261109')");
  }
  // Atualiza somente a instalação das quatro combinações F3 solicitadas, preservando os demais preços.
  if (!await db.get("SELECT chave FROM migracoes_app WHERE chave='preco_f3_redonda_instalacao_250_20261109'")) {
    const modelo = "Frontal de Correr F3 Caixa Redonda";
    const regra = await db.get(`SELECT id,precos_combinacoes_json FROM precos_orcamento
      WHERE categoria='box' AND modelo=?`, [modelo]);
    if (regra) {
      let combinacoes = {};
      try { combinacoes = JSON.parse(regra.precos_combinacoes_json || "{}"); } catch {}
      for (const kit of ["Branco", "Preto"]) {
        for (const vidro of ["Fumê", "Verde"]) {
          combinacoes[JSON.stringify([kit, vidro])] = {
            preco_m2_centavos: 41525, preco_minimo_centavos: 41025, instalacao_centavos: 25000,
          };
        }
      }
      await db.run(`UPDATE precos_orcamento SET precos_combinacoes_json=?,ativo=1,
        atualizado_em=CURRENT_TIMESTAMP WHERE id=?`, [JSON.stringify(combinacoes), regra.id]);
    }
    await db.run("INSERT INTO migracoes_app (chave) VALUES ('preco_f3_redonda_instalacao_250_20261109')");
  }
  // Atualiza somente o kit Preto com vidros Fumê/Verde no F3 redondo.
  if (!await db.get("SELECT chave FROM migracoes_app WHERE chave='preco_f3_preto_fume_verde_45240_20261109'")) {
    const modelo = "Frontal de Correr F3 Caixa Redonda";
    const regra = await db.get(`SELECT id,precos_combinacoes_json FROM precos_orcamento
      WHERE categoria='box' AND modelo=?`, [modelo]);
    if (regra) {
      let combinacoes = {};
      try { combinacoes = JSON.parse(regra.precos_combinacoes_json || "{}"); } catch {}
      const valor = { preco_m2_centavos: 45240, preco_minimo_centavos: 44700, instalacao_centavos: 25000 };
      for (const vidro of ["Fumê", "Verde"]) combinacoes[JSON.stringify(["Preto", vidro])] = { ...valor };
      await db.run(`UPDATE precos_orcamento SET precos_combinacoes_json=?,ativo=1,
        atualizado_em=CURRENT_TIMESTAMP WHERE id=?`, [JSON.stringify(combinacoes), regra.id]);
    }
    await db.run("INSERT INTO migracoes_app (chave) VALUES ('preco_f3_preto_fume_verde_45240_20261109')");
  }
  // Preço exclusivo do kit Dourado com vidros Fumê/Verde no F1 redondo.
  if (!await db.get("SELECT chave FROM migracoes_app WHERE chave='preco_f1_dourado_combinacoes_82875_20261109'")) {
    const modelo = "Frontal de Correr F1 Caixa Redonda";
    const valor = { preco_m2_centavos: 82875, preco_minimo_centavos: 82275, instalacao_centavos: 15000 };
    const regra = await db.get(`SELECT id,precos_combinacoes_json FROM precos_orcamento
      WHERE categoria='box' AND modelo=?`, [modelo]);
    if (regra) {
      let combinacoes = {};
      try { combinacoes = JSON.parse(regra.precos_combinacoes_json || "{}"); } catch {}
      for (const vidro of ["Fumê", "Verde"]) combinacoes[JSON.stringify(["Dourado", vidro])] = { ...valor };
      await db.run(`UPDATE precos_orcamento SET precos_combinacoes_json=?,ativo=1,
        atualizado_em=CURRENT_TIMESTAMP WHERE id=?`, [JSON.stringify(combinacoes), regra.id]);
    }
    await db.run("INSERT INTO migracoes_app (chave) VALUES ('preco_f1_dourado_combinacoes_82875_20261109')");
  }
  await initCustosReais(db);
  await db.run(`CREATE TABLE IF NOT EXISTS usos_orcamento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    periodo_chave TEXT NOT NULL,
    slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 10),
    orcamento_id INTEGER UNIQUE REFERENCES orcamentos(id) ON DELETE SET NULL,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (usuario_id, periodo_chave, slot)
  )`);

  async function acessoOrcamentos(usuarioId) {
    const gratis = await db.get(
      "SELECT COUNT(*) AS usados FROM usos_orcamento WHERE usuario_id = ? AND periodo_chave = 'gratuito'",
      [usuarioId],
    );
    if (!gratis.usados) {
      return { plano: "gratuito", limite: 1, usados: 0, restantes: 1 };
    }

    const lotes = await db.all(`SELECT c.id,c.quantidade,COUNT(u.id) AS usados
      FROM creditos_orcamento c LEFT JOIN usos_orcamento u
        ON u.usuario_id=c.usuario_id AND u.periodo_chave='compra:' || c.id
      WHERE c.usuario_id=? AND c.revogado=0 AND (c.stripe_session_id NOT LIKE 'mp:test:%' OR ?)
      GROUP BY c.id ORDER BY c.id`, [usuarioId, aceitarCreditosMPTeste ? 1 : 0]);
    const limite = lotes.reduce((total, lote) => total + lote.quantidade, 0);
    const usados = lotes.reduce((total, lote) => total + lote.usados, 0);
    return {
      plano: limite ? "creditos" : "gratuito", limite, usados, restantes: Math.max(0, limite - usados),
      compra_disponivel: comprasOrcamentoConfiguradas,
      opcoes: { individual: { quantidade: 1, preco_centavos: 599 }, pacote10: { quantidade: 10, preco_centavos: 990 } },
    };
  }

  async function reservarUso(usuarioId, acesso) {
    if (!acesso.restantes) throw fail(402, "Você já utilizou seus orçamentos disponíveis. Compre outro crédito para continuar.");
    if (acesso.plano === "gratuito") {
      const result = await db.run(`INSERT INTO usos_orcamento (usuario_id,periodo_chave,slot)
        SELECT ?, 'gratuito', 1 WHERE NOT EXISTS
        (SELECT 1 FROM usos_orcamento WHERE usuario_id=? AND periodo_chave='gratuito')`, [usuarioId, usuarioId]);
      if (result.changes) return { id: result.lastID, periodo: "gratuito" };
    } else {
      const lotes = await db.all(`SELECT id,quantidade FROM creditos_orcamento WHERE usuario_id=? AND revogado=0
        AND (stripe_session_id NOT LIKE 'mp:test:%' OR ?) ORDER BY id`, [usuarioId, aceitarCreditosMPTeste ? 1 : 0]);
      for (const lote of lotes) {
        const periodo = `compra:${lote.id}`;
        const result = await db.run(`INSERT INTO usos_orcamento (usuario_id,periodo_chave,slot)
          SELECT ?, ?, COUNT(*) + 1 FROM usos_orcamento
          WHERE usuario_id=? AND periodo_chave=? HAVING COUNT(*) < ?
          AND EXISTS(SELECT 1 FROM creditos_orcamento WHERE id=? AND usuario_id=? AND revogado=0
            AND (stripe_session_id NOT LIKE 'mp:test:%' OR ?))`,
        [usuarioId, periodo, usuarioId, periodo, lote.quantidade, lote.id, usuarioId, aceitarCreditosMPTeste ? 1 : 0]);
        if (result.changes) return { id: result.lastID, periodo };
      }
    }
    throw fail(402, "Você já utilizou seus orçamentos disponíveis. Compre outro crédito para continuar.");
  }

  async function calcularEstimativa(itens, instalacao) {
    const rules = await db.all("SELECT * FROM precos_orcamento WHERE ativo = 1");
    const indexed = new Map(rules.map((rule) => [`${rule.categoria}\u0000${rule.modelo}`, {
      ...rule,
      precos_cores: JSON.parse(rule.precos_cores_json || "{}"),
      precos_vidros: JSON.parse(rule.precos_vidros_json || "{}"),
      precos_combinacoes: JSON.parse(rule.precos_combinacoes_json || "{}"),
    }]));
    const custos = await carregarDadosCustos(db);
    let total = 0;
    const detalhes = [];
    let todosPorComposicao = true;
    let algumPorComposicao = false;
    for (const item of itens) {
      const chaveExata = `${item.categoria}\u0000${item.modelo}`;
      const regraCatalogo = indexed.get(chaveExata);
      const chaveCombinacao = item.cor && item.tipo_vidro ? JSON.stringify([item.cor, item.tipo_vidro]) : "";
      const regraCombinacao = regraCatalogo?.precos_combinacoes[chaveCombinacao];
      const ficha = custos.fichasPorProduto.get(chaveExata);
      const composicao = ficha && calcularItemPorComposicao({
        item,
        ficha,
        componentes: custos.componentesPorFicha.get(ficha.id) || [],
        configuracao: custos.configuracao,
        instalacao,
      });
      if (composicao && !regraCombinacao) {
        algumPorComposicao = true;
        total += composicao.subtotal_centavos;
        detalhes.push(composicao);
        continue;
      }
      todosPorComposicao = false;
      const rule = regraCatalogo;
      if (!rule) return { total: null, detalhes: [], tipo: "analise" };
      const areaM2 = Math.round((item.largura_cm * item.altura_cm / 10000) * 1000) / 1000;
      const precoCorBruto = rule.precos_cores[item.cor];
      const precoVidroBruto = rule.precos_vidros[item.tipo_vidro];
      const regraCor = typeof precoCorBruto === "number" ? { preco_m2_centavos: precoCorBruto } : precoCorBruto;
      const regraVidro = typeof precoVidroBruto === "number" ? { preco_m2_centavos: precoVidroBruto } : precoVidroBruto;
      if (item.tipo_vidro && Object.keys(rule.precos_vidros).length && !regraVidro && !regraCombinacao) {
        return { total: null, detalhes: [], tipo: "analise" };
      }
      if (item.tipo_vidro && item.cor && Object.keys(rule.precos_combinacoes).length && !regraCombinacao && !regraVidro) {
        return { total: null, detalhes: [], tipo: "analise" };
      }
      const regraAplicada = regraCombinacao || regraVidro || regraCor;
      const base = Math.round(areaM2 * (regraAplicada?.preco_m2_centavos || rule.preco_m2_centavos));
      const produtoBase = Math.max(base, regraAplicada?.preco_minimo_centavos ?? rule.preco_minimo_centavos);
      const itemAjustado = regraCombinacao ? { ...item, tipo_vidro: "", cor: "" }
        : regraVidro ? { ...item, tipo_vidro: "" } : regraCor ? { ...item, cor: "" } : item;
      const produtoUnitario = ajustarProduto(produtoBase, itemAjustado);
      const instalacaoUnitaria = instalacao ? (regraAplicada?.instalacao_centavos ?? rule.instalacao_centavos) : 0;
      const subtotal = (produtoUnitario + instalacaoUnitaria) * item.quantidade;
      total += subtotal;
      detalhes.push({
        categoria: item.categoria, modelo: item.modelo, quantidade: item.quantidade,
        metodo: "estimativa_m2",
        area_m2: areaM2, produto_base_centavos: produtoBase, produto_unitario_centavos: produtoUnitario,
        instalacao_unitaria_centavos: instalacaoUnitaria, subtotal_centavos: subtotal,
      });
    }
    return { total, detalhes, tipo: todosPorComposicao ? "composicao" : algumPorComposicao ? "misto" : "estimativa" };
  }

  app.get("/api/catalogo/precos", async (_req, res) => {
    const rows = await db.all(
      `SELECT categoria,modelo,descricao,precos_cores_json,precos_vidros_json,precos_combinacoes_json,preco_m2_centavos,preco_minimo_centavos,instalacao_centavos
       FROM precos_orcamento WHERE ativo = 1 ORDER BY categoria,modelo`,
    );
    res.json({ precos: rows.map((row) => ({
      ...row,
      precos_cores: JSON.parse(row.precos_cores_json || "{}"),
      precos_vidros: JSON.parse(row.precos_vidros_json || "{}"),
      precos_combinacoes: JSON.parse(row.precos_combinacoes_json || "{}"),
      precos_cores_json: undefined,
      precos_vidros_json: undefined,
      precos_combinacoes_json: undefined,
    })), ajustes: AJUSTES_PRECO, referencia: REFERENCIA_PRECOS });
  });

  app.get("/api/orcamentos/acesso", exigirLogin, async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ acesso: await acessoOrcamentos(req.session.usuario.id) });
  });

  app.post("/api/orcamentos/previa", exigirLogin, changesLimit, async (req, res) => {
    const dados = validarOrcamento(req.body);
    const calculo = await calcularEstimativa(dados.itens, dados.instalacao);
    res.set("Cache-Control", "no-store");
    res.json({ total_centavos: calculo.total, tipo_calculo: calculo.tipo,
      detalhes: calculo.detalhes.map(detalhePublico) });
  });

  app.post("/api/orcamentos", exigirLogin, changesLimit, async (req, res) => {
    const dados = validarOrcamento(req.body);
    const usuarioId = req.session.usuario.id;
    const estimativa = await calcularEstimativa(dados.itens, dados.instalacao);
    const acesso = await acessoOrcamentos(usuarioId);
    const reserva = await reservarUso(usuarioId, acesso);
    let result;
    try {
      result = await db.run(
        `INSERT INTO orcamentos
         (usuario_id,nome,email,telefone,cidade,bairro,itens_json,instalacao,observacoes,estimativa_centavos,estimativa_detalhes_json,tipo_calculo)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [usuarioId, dados.nome, dados.email, dados.telefone, dados.cidade, dados.bairro,
          JSON.stringify(dados.itens), dados.instalacao ? 1 : 0, dados.observacoes || null,
          estimativa.total, estimativa.total == null ? null : JSON.stringify(estimativa.detalhes), estimativa.tipo],
      );
    } catch (error) {
      await db.run(
        "DELETE FROM usos_orcamento WHERE id = ? AND usuario_id = ? AND orcamento_id IS NULL",
        [reserva.id, usuarioId],
      );
      throw error;
    }
    await db.run(
      "UPDATE usos_orcamento SET orcamento_id = ? WHERE id = ? AND usuario_id = ? AND orcamento_id IS NULL",
      [result.lastID, reserva.id, usuarioId],
    );
    const codigo = `MDE-${new Date().getFullYear()}-${String(result.lastID).padStart(6, "0")}`;
    await db.run("UPDATE orcamentos SET codigo = ? WHERE id = ?", [codigo, result.lastID]);
    res.status(201).json({
      mensagem: "Solicitação de orçamento registrada com sucesso.",
      orcamento: { codigo, status: "recebido", estimativa_centavos: estimativa.total, tipo_calculo: estimativa.tipo,
        estimativa_detalhes: estimativa.detalhes.map(detalhePublico) },
    });
  });

  app.get("/api/orcamentos", exigirLogin, async (req, res) => {
    const rows = await db.all(
      `SELECT codigo,nome,email,telefone,cidade,bairro,itens_json,instalacao,observacoes,estimativa_centavos,estimativa_detalhes_json,tipo_calculo,status,criado_em,atualizado_em,propostas_json,proposta_versao
       FROM orcamentos WHERE usuario_id = ? AND removido_em IS NULL ORDER BY id DESC LIMIT 50`,
      [req.session.usuario.id],
    );
    res.json({ orcamentos: rows.map((row) => ({
      codigo: row.codigo,
      nome: row.nome,
      email: row.email,
      telefone: row.telefone,
      cidade: row.cidade,
      bairro: row.bairro,
      itens: JSON.parse(row.itens_json),
      instalacao: Boolean(row.instalacao),
      observacoes: row.observacoes,
      estimativa_centavos: row.estimativa_centavos,
      estimativa_detalhes: row.estimativa_detalhes_json ? JSON.parse(row.estimativa_detalhes_json).map(detalhePublico) : [],
      tipo_calculo: row.tipo_calculo,
      status: row.status,
      criado_em: row.criado_em,
      atualizado_em: row.atualizado_em,
      propostas: propostas(row),
      proposta_versao: row.proposta_versao,
    })) });
  });

  app.delete("/api/orcamentos/:codigo", exigirLogin, changesLimit, async (req, res) => {
    const row = await db.get("SELECT id,status FROM orcamentos WHERE codigo=? AND usuario_id=? AND removido_em IS NULL",
      [req.params.codigo, req.session.usuario.id]);
    if (!row) throw fail(404, "Orçamento não encontrado.");
    if (["aprovado", "concluido"].includes(row.status)) {
      throw fail(409, "Este orçamento já foi aprovado e não pode ser removido. Fale com a empresa se precisar cancelar o serviço.");
    }
    await db.run(`UPDATE orcamentos SET status='cancelado', removido_em=CURRENT_TIMESTAMP,
      atualizado_em=CURRENT_TIMESTAMP WHERE id=? AND removido_em IS NULL`, [row.id]);
    res.json({ mensagem: "Orçamento removido da sua conta. O uso não foi devolvido." });
  });
}

module.exports = { initOrcamentos, validarOrcamento };
