const ROTULOS = Object.freeze({
  materiais: "Materiais",
  mao_obra: "Mão de obra de fabricação",
  instalacao: "Instalação",
});

function partesDoItem(detail = {}) {
  const quantidade = Number.isSafeInteger(detail.quantidade) && detail.quantidade > 0 ? detail.quantidade : 1;
  const partes = detail.partes_venda_unitarias_centavos;
  if (partes && typeof partes === "object") {
    const normalizadas = {
      materiais: (partes.materiais || 0) + (partes.frete || 0),
      mao_obra: (partes.mao_obra || 0) + (partes.outros || 0),
      instalacao: partes.instalacao || 0,
    };
    const linhas = Object.entries(ROTULOS).filter(([chave]) => Number.isSafeInteger(normalizadas[chave]) && normalizadas[chave] > 0)
      .map(([chave, rotulo]) => ({ chave, rotulo, valor_centavos: normalizadas[chave] * quantidade }));
    if (linhas.reduce((soma, linha) => soma + linha.valor_centavos, 0) === detail.subtotal_centavos) return linhas;
  }

  const produto = detail.produto_unitario_centavos;
  const instalacao = detail.instalacao_unitaria_centavos;
  if (Number.isSafeInteger(produto) && Number.isSafeInteger(instalacao)
    && (produto + instalacao) * quantidade === detail.subtotal_centavos) {
    return [
      { chave: "produto_servico", rotulo: "Produto/serviço (estimado)", valor_centavos: produto * quantidade },
      { chave: "instalacao", rotulo: "Instalação (estimada)", valor_centavos: instalacao * quantidade },
    ].filter((linha) => linha.valor_centavos > 0);
  }
  if (Number.isSafeInteger(detail.subtotal_centavos)) {
    return [{ chave: "sem_separacao", rotulo: "Produto e serviços (sem separação)", valor_centavos: detail.subtotal_centavos }];
  }
  return [];
}

function detalhePublico(detail) {
  return {
    categoria: detail.categoria,
    modelo: detail.modelo,
    quantidade: detail.quantidade,
    metodo: detail.metodo,
    subtotal_centavos: detail.subtotal_centavos,
    partes: partesDoItem(detail),
  };
}

module.exports = { partesDoItem, detalhePublico };
