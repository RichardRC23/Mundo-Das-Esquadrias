# Mercado Pago e preparação do Apple Pay

## Situação atual

Implementado localmente, com testes simulados e sem movimentar dinheiro:

- Checkout Pro via Preferences API para 1 orçamento de R$ 5,99 ou até 10 por R$ 9,90. Pagamento único, sem renovação automática; orçamento gratuito preservado.
- Webhook assinado, consulta direta do pagamento, verificação do titular local, recebedor, ambiente, moeda e valor. A URL de retorno não comprova pagamento.
- Créditos e histórico gravados atomicamente. Repetições não duplicam créditos. Reembolso (inclusive parcial) e contestação bloqueiam o saldo restante daquele pagamento, sem apagar orçamentos anteriores.
- Consulta autenticada das últimas 20 tentativas na página de orçamento; botão para verificar pagamentos pendentes. A confirmação consulta até os 10 pagamentos mais recentes da referência; cada webhook também processa seu pagamento individualmente.
- Preparação da rota pública **somente** para o arquivo oficial de associação do domínio Apple. Não é uma integração de cobrança Apple Pay.

**Ainda não houve teste com a API real, cadastro das contas, publicação de domínio ou ativação de cobranças.** Nenhum token, certificado ou arquivo de domínio fictício deve ser colocado em produção. A integração Stripe existente continua disponível; não houve migração de clientes/cartões do Stripe para o Mercado Pago.

## Primeiro passo: conta e ambiente de testes

1. Crie sua conta de vendedor no Mercado Pago e uma aplicação em “Suas integrações”. Escolha Checkout Pro **via Preferences API** para este código.
2. Crie vendedor e comprador de teste brasileiros. Use a credencial do vendedor de teste e o ID dessa mesma conta; não use sua conta real para simular compras. Confirme o procedimento na [documentação de contas de teste](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/test/accounts).
3. Disponibilize uma instalação de homologação em HTTPS público para receber notificações. `localhost` não é acessível pelo Mercado Pago. Use banco separado dos clientes reais (`DATA_DIR`), sessão e credenciais próprias. Não publique `.env`, bancos ou certificados.
4. No painel de Webhooks dessa aplicação/conta, selecione o tópico **Pagamentos (`payment`)** e a URL `https://SEU-DOMINIO/api/webhooks/mercadopago`. Copie a assinatura secreta do painel para o `.env`, sem enviá-la pelo chat.
5. Preencha localmente (não substitua o `.env` inteiro):

```dotenv
PAYMENT_PROVIDER=mercadopago
APP_ORIGIN=https://SEU-DOMINIO-DE-HOMOLOGACAO
MP_ENVIRONMENT=test
MP_ACCESS_TOKEN=
MP_COLLECTOR_ID=
MP_WEBHOOK_SECRET=
APPLE_PAY_DOMAIN_VERIFICATION=0
# DATA_DIR deve apontar para uma pasta privada de homologação, fora de site/.
```

`MP_COLLECTOR_ID` é o ID numérico do vendedor, não o ID da aplicação. A integração confere a identidade em `/users/me` e a tag `test_user`. Não deduza o ambiente somente pelo prefixo do token. O checkout permanece bloqueado se faltarem credencial, assinatura, recebedor ou HTTPS. Reinicie o servidor após alterar variáveis.

O checkout recebe os valores do servidor, não do navegador. O Mercado Pago coleta os dados de pagamento. Os meios efetivamente oferecidos — Pix, cartões, boleto etc. — dependem da conta, elegibilidade, produto e ambiente; valide cada meio no painel e na homologação. Este código não promete débito ou Apple Pay em todas as compras. Salvar uma preferência Pix/cartão no perfil não cadastra cartão nem autoriza cobranças.

## Antes de produção

- Teste compra aprovada, recusada, pendente, retorno sem login, fechamento da página antes da confirmação, notificação repetida, indisponibilidade temporária, reembolso e contestação.
- Pix/boleto pendentes não liberam créditos; confira a chegada da aprovação pelo webhook, mesmo sem o cliente retornar ao site.
- Configure produção com vendedor real, credencial real, segredo próprio, domínio HTTPS, `MP_ENVIRONMENT=production`, `NODE_ENV=production`. Configure o proxy confiável apenas conforme sua hospedagem. Não copie o banco de testes para produção. Créditos Mercado Pago de teste não são aceitos fora do modo de testes configurado.
- Confirme preço e disponibilidade dos meios no ambiente real antes de divulgar. Qualquer cobrança real de homologação deve ser autorizada pelo responsável.
- Monitore entregas de webhooks no painel. Falhas retornam erro para reenvio pelo provedor. Se as tentativas se esgotarem, reenvie pelo painel ou use “Verificar pagamento” na conta titular. Não há processo agendado de reconciliação completa.
- Faça backup completo de `data/` antes da publicação. As migrações são aditivas. Não remova vínculos de pagamento ao restaurar banco.

## Apple Pay: o que falta e por quê

O [Mercado Pago exige contato comercial para habilitar Apple Pay](https://www.mercadopago.com.br/developers/pt/docs/apple-pay/overview). O fluxo documentado é separado do Checkout Pro, via integração Apple Pay/Checkout Transparente. Ter iPhone ou habilitar esta variável não o ativa.

Antes de desenvolver/homologar a cobrança Apple Pay:

1. Obtenha confirmação do Mercado Pago de elegibilidade/habilitação comercial da sua conta e acesso ao produto correspondente.
2. Tenha conta Apple Developer, Merchant ID e domínio próprio com HTTPS. Confirme custos/requisitos antes de contratar.
3. Siga o [procedimento oficial de certificados](https://www.mercadopago.com.br/developers/pt/docs/apple-pay/obtain-apple-developer-certificates): gerar as solicitações CSR pelo Mercado Pago, emitir certificados Merchant Identity/Payment Processing no Apple Developer e enviá-los ao Mercado Pago. Essas chamadas não são executadas automaticamente pelo site.
4. Baixe o arquivo de associação fornecido pela Apple. Salve **somente esse arquivo** em `data/apple-pay/domain-association.txt`. Configure `APPLE_PAY_DOMAIN_VERIFICATION=1` após definir `APP_ORIGIN` HTTPS. O servidor expõe os caminhos exatos `/.well-known/apple-developer-merchantid-domain-association` e o equivalente `.txt`; a pasta privada não é publicada. Confira o conteúdo e conclua a verificação no Apple Developer. Isso prepara a prova de domínio, mas não comprova que a Apple aprovou a verificação.
5. Com a conta habilitada, implementar e testar sessão de lojista, tokenização, criação de Orders, idempotência de cobrança, webhook de Orders e botão nativo em dispositivo compatível, conforme a [integração web oficial](https://www.mercadopago.com.br/developers/pt/docs/apple-pay/attached-model-integration/web-integration).

O endpoint atual aceita **apenas `payment`**, não `order`. Não aponte notificações Apple Pay/Orders para ele. `apple_pay_disponivel` permanece falso e não há botão de cobrança Apple Pay. Certificados genuínos/verificação/homologação não podem ser simulados como concluídos.

## Notas técnicas e segurança

- HMAC SHA-256 usa `data.id` da query, `x-request-id` e `ts`. Query duplicada, assinatura inválida ou divergência com o corpo são rejeitadas. Replays legítimos consultam o estado atual e não repetem o crédito; não há corte de tempo que descarte reenvios atrasados.
- `/api/webhooks/mercadopago` é a única exceção à sessão/CSRF do navegador; exige assinatura própria. As rotas de clientes continuam exigindo sessão e CSRF.
- A API usa host fixo `api.mercadopago.com`, HTTPS, timeout e não segue redirecionamentos com credenciais. URLs de checkout têm lista restrita de hosts.
- `mp_checkouts` guarda referência aleatória, titular, produto, ambiente, recebedor e preferência. `mp_recebimentos` guarda somente chave, referência, status e data, não o corpo completo do pagamento nem dados de cartão.
- Por compatibilidade, `creditos_orcamento.stripe_session_id` também guarda a referência prefixada `mp:AMBIENTE:RECEBEDOR:ID`. Não é um ID Stripe para esses registros. `compras.pagamento_referencia` é único; `creditos_orcamento.revogado` impede novos usos.
- Triggers SQLite mantêm recebimento, compra e crédito na mesma transação. Falha de banco gera erro/reenvio, sem confirmação parcial. Atualizações mais antigas não substituem estados mais recentes.
- Reembolso/contestação bloqueiam permanentemente esse lote; uma disputa revertida exige revisão administrativa antes de reativar saldo. Não há reembolso automático nem apagamento dos serviços já solicitados. O painel Mercado Pago continua sendo o local de gestão financeira.

Referências: [Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/create-payment-preference), [webhooks](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/additional-content/notifications/webhooks).
