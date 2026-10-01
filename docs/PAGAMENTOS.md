# Pagamentos, assinaturas e contratos

## Mercado Pago e Apple Pay — atualização de 30/09/2026

As novas compras podem usar Mercado Pago Checkout Pro, com confirmação automática por webhooks assinados. Veja o [guia de configuração e pendências](MERCADO_PAGO.md). O Apple Pay **não está integrado para cobrança**: há somente preparação da verificação de domínio. Conta, autorização comercial, certificados e implementação/homologação do fluxo Apple Pay ainda são necessários. O restante deste documento descreve a integração Stripe preservada e os dados da conta.

A área do cliente distingue três informações: compras/serviços e contratos cadastrados pela empresa, assinaturas recorrentes existentes na Stripe e uma preferência de pagamento informada pelo cliente. As listas começam vazias. Não há compras, cartões, assinaturas nem contratos de demonstração misturados com contas reais.

## O que funciona sem uma conta Stripe

- Consultar e atualizar o perfil, a foto e a preferência Pix/boleto/cartão.
- Consultar os próprios pedidos e contratos quando houver registros reais no banco.
- Baixar PDFs de contratos disponibilizados pela empresa, com autenticação e verificação do titular em cada solicitação.
- Ver mensagens claras quando não houver registros ou quando o gerenciamento financeiro não estiver disponível.

A preferência é apenas uma informação. Selecionar cartão não cadastra um cartão; selecionar Pix não gera QR Code; selecionar boleto não emite boleto. A mudança não modifica cobranças nem autoriza débitos.

## Ativar gerenciamento de cartões e assinaturas

O projeto oferece integração opcional com o [Customer Portal da Stripe](https://docs.stripe.com/customer-management/integrate-customer-portal). Depois de configurar a conta, o cliente confirma sua senha e é encaminhado ao portal para atualizar os cartões salvos, consultar faturas e gerenciar assinaturas conforme as opções habilitadas pela empresa. Os dados do cartão são coletados pela Stripe.

1. Crie a conta comercial da empresa na Stripe e comece pelo modo de teste. A ativação da conta e dos recursos depende do provedor.
2. No painel Stripe, configure o Customer Portal de teste: atualização de métodos de pagamento, histórico de faturas e, se desejado, cancelamento/alteração das assinaturas existentes. Para permitir troca de planos, cadastre os produtos e preços permitidos.
3. No arquivo `.env` do servidor, preencha as variáveis abaixo. Não coloque chaves em `site/`, JavaScript do navegador, Git ou mensagens.

```dotenv
# Endereço do Node, sem caminho ou barra final.
APP_ORIGIN=http://localhost:3000

# Copie a chave secreta sk_test_... diretamente do painel Stripe para seu .env.
STRIPE_SECRET_KEY=

# IDs de preços únicos: 1 orçamento por R$ 5,99 e pacote de 10 por R$ 9,90.
STRIPE_QUOTE_SINGLE_PRICE_ID=price_...
STRIPE_QUOTE_PACK_PRICE_ID=price_...

# Opcional: ID bpc_... de uma configuração específica do portal.
# Deixe vazio para usar a configuração padrão salva no painel.
STRIPE_PORTAL_CONFIGURATION=
```

4. Crie na Stripe dois preços de pagamento único: **R$ 5,99** para 1 orçamento e **R$ 9,90** para o pacote de até 10. Copie os identificadores `price_...` para as variáveis correspondentes. O servidor rejeita preços diferentes, outra moeda ou preços recorrentes.
5. Reinicie `node server.js`. Acesse o perfil, escolha gerenciar pagamentos e confirme a senha. Esse POST cria um cliente Stripe para a conta autenticada se ainda não existir vínculo; abrir o perfil nunca cria clientes nem cobranças.
6. Faça a validação no ambiente de teste antes de inserir uma chave de produção. Configurações do portal de teste e de produção são independentes. Use a [documentação de testes da Stripe](https://docs.stripe.com/testing) para os dados de teste.
7. Para produção, use HTTPS, `NODE_ENV=production`, `APP_ORIGIN` com o domínio real e a configuração de portal correspondente. A chave permanece apenas no servidor.

O servidor pode usar uma chave restrita `rk_...` se ela tiver as permissões necessárias para consultar a própria conta, clientes, métodos de pagamento, faturas, assinaturas e produtos, além de criar clientes e sessões de portal. Uma chave inválida ou falta de permissão gera erro explícito; não mostra dados vazios como se a consulta tivesse funcionado.

## Como vincular cobranças reais

Cada conta local é vinculada a um ID de cliente Stripe em `payment_customers`. O vínculo é isolado pela conta Stripe e pelo modo teste/produção, e sua titularidade é confirmada por metadados criados pelo servidor. O e-mail não é usado como autorização nem como chave de associação automática. Atualizar e-mail no perfil não transfere dados financeiros.

Ao criar uma assinatura ou fatura no painel da Stripe, a empresa deve utilizar o cliente que o sistema já criou para aquele usuário. É possível encontrá-lo no painel pelos metadados `mundo_usuario_id` e `mundo_instalacao`, ou pelo vínculo no banco local. Não cadastre outra pessoa nem conecte manualmente IDs recebidos pelo navegador. Clientes Stripe antigos exigem uma migração administrativa com verificação da titularidade.

O site oferece **1 orçamento adicional por R$ 5,99** ou um **pacote para até 10 orçamentos por R$ 9,90**, ambos em pagamento único. Quando os créditos terminarem, o cliente pode comprar novamente. A compra abre o Stripe Checkout e os dados do cartão não passam pelo servidor da empresa. O crédito só é liberado quando o servidor consulta a sessão e confirma pagamento, titularidade, valor, moeda e produto; o simples retorno à página de sucesso não libera a cota. O projeto não contém carrinho, emissão própria de Pix/boleto nem assinatura eletrônica de contrato.

## Dados locais de compras e contratos

As tabelas são criadas automaticamente. O painel é somente de consulta para o cliente; ainda não existe painel administrativo para inserir vendas ou documentos. O responsável pelo sistema pode integrar os registros reais da empresa usando consultas parametrizadas e o `usuario_id` correto.

`compras`: `id`, `usuario_id`, `titulo`, `descricao`, `status`, `valor_centavos`, `moeda`, `criado_em`.

`contratos`: os mesmos campos, mais `assinado_em` e `documento_arquivo`. `assinado_em` é a data de uma assinatura já realizada fora deste fluxo; gravar esse campo não realiza uma assinatura digital.

- `usuario_id` é obrigatório e identifica o único cliente autorizado a consultar o registro.
- `valor_centavos` é inteiro (por exemplo, 12500 equivale a R$ 125,00) ou nulo quando não aplicável. `moeda` usa `brl` por padrão.
- `criado_em` usa data SQLite UTC por padrão; datas importadas devem preservar o fuso.
- Estados locais úteis incluem `pendente`, `em_andamento`, `concluido`, `cancelado`, `assinado` e `aguardando_assinatura`. Devem refletir o serviço/contrato real.
- PDFs ficam em `data/contratos/`, fora da pasta pública. `documento_arquivo` armazena somente um nome como `contrato-123.pdf`, nunca um caminho ou URL. Nomes aceitos usam letras ASCII, números, ponto, hífen e sublinhado e terminam em `.pdf`.
- Cada download exige login e consulta a propriedade do contrato antes de enviar o arquivo. A pasta `data` não deve ser publicada como arquivo estático.
- Faturas Stripe finalizadas também aparecem em compras. Evite importar a mesma fatura como compra local para não duplicar o histórico. Pedidos locais e faturas são registros distintos.

## Endpoints e limites

- `GET /api/conta`: listas e preferências da sessão atual; nunca aceita ID de usuário/cliente fornecido pelo navegador. Retorna `compras`, `contratos`, `assinaturas`, `pagamentos`, `limites` e `tem_mais`.
- `PUT /api/pagamentos/preferencia`: JSON `{ "metodo": "pix" }`, `"boleto"`, `"cartao"` ou `null` para limpar. Salva somente a preferência do usuário autenticado.
- `POST /api/pagamentos/portal`: JSON `{ "senha_atual": "..." }`; exige senha correta, proteção de origem/CSRF do servidor e limite de tentativas. Retorna URL temporária do portal. Sem Stripe configurada, retorna 503.
- `POST /api/pagamentos/orcamentos/checkout`: cria uma sessão autenticada de pagamento único para `individual` ou `pacote10`.
- `POST /api/pagamentos/orcamentos/confirmar`: consulta a sessão paga no Stripe e concede os créditos de forma idempotente.
- `GET /api/orcamentos/acesso`: informa a cota da conta atual. A primeira solicitação é gratuita; depois são consumidos os créditos comprados.
- `DELETE /api/orcamentos/:codigo`: remove o orçamento da visão do titular, sem devolver o uso e sem apagar o histórico administrativo.
- `GET /api/contratos/:id/documento`: arquivo apenas para o titular autenticado.

O resumo exibe no máximo os 100 registros mais recentes de cada lista e informa `tem_mais` quando houver outros. Consultas financeiras vêm da Stripe a cada carregamento; detalhes adicionais de faturas/assinaturas ficam no portal. Assinaturas com múltiplos itens, preço variável ou cobrança por uso não recebem um valor de renovação estimado incorretamente no painel. O próximo período é informativo e pode diferir da data de uma cobrança efetiva.

No fluxo legado **Stripe**, ainda não há webhooks: a cota é liberada somente após a confirmação autenticada consultar a sessão paga na Stripe, nunca apenas pelo redirecionamento de sucesso. Para conciliação automática nesse provedor, falta implementar [webhooks assinados da Stripe](https://docs.stripe.com/webhooks). O fluxo Mercado Pago já possui webhook próprio e persistência idempotente; não utiliza o endpoint da Stripe.

## Preservação do vínculo financeiro

Faça backup de `usuarios`, `payment_customers` e `payment_settings` juntos. `payment_settings.namespace` diferencia instalações e participa da idempotência na criação de clientes. Não apague esse namespace nem copie apenas parte do vínculo para outro banco. Rotacionar uma chave da mesma conta preserva o vínculo, mas mudar conta Stripe ou modo exige vínculos separados. Restaurações parciais de banco precisam de reconciliação administrativa; uma chave de idempotência do provedor não substitui o backup permanente.

Referências de implementação: [sessões do portal](https://docs.stripe.com/api/customer_portal/sessions/create), [métodos de pagamento](https://docs.stripe.com/api/payment_methods/list), [assinaturas](https://docs.stripe.com/api/subscriptions/list), [faturas](https://docs.stripe.com/api/invoices/list), [idempotência](https://docs.stripe.com/api/idempotent_requests).
