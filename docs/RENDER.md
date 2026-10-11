# Publicação no Render

O `render.yaml` mantém a infraestrutura separada do código da aplicação e não contém credenciais. Ele cria um Web Service Node na região de Virginia, usa o menor plano pago atual compatível com disco e monta 1 GB persistente em `/opt/render/project/src/data`.

## Criar o serviço

1. No painel do Render, selecione **New > Blueprint**.
2. Conecte o repositório `RichardRC23/Mundo-Das-Esquadrias` e a branch `main`.
3. Confirme o Blueprint encontrado em `render.yaml` e revise o valor mensal mostrado pelo Render antes de criar os recursos.
4. Aguarde o deploy e abra o endereço `https://mundo-das-esquadrias.onrender.com` exibido pelo serviço. Se o Render atribuir outro nome, use o endereço exibido por ele.
5. Confira `https://ENDERECO.onrender.com/api/health`. A resposta esperada é `{"status":"ok"}`.

O Render fornece `RENDER_EXTERNAL_HOSTNAME`, e o servidor o converte automaticamente para a origem HTTPS. Não é necessário cadastrar `APP_ORIGIN` no Render. Se um domínio próprio for usado depois, configure `APP_ORIGIN=https://DOMINIO` e faça um novo deploy.

## Ativar o Mercado Pago em testes

No serviço, abra **Environment** e adicione estas três variáveis como segredos:

```dotenv
MP_ACCESS_TOKEN=ACCESS_TOKEN_DO_VENDEDOR_DE_TESTE
MP_COLLECTOR_ID=USER_ID_NUMERICO_DO_MESMO_VENDEDOR_DE_TESTE
MP_WEBHOOK_SECRET=ASSINATURA_SECRETA_DO_WEBHOOK_DE_TESTE
```

Não coloque esses valores no GitHub, em arquivos do site ou em mensagens. `MP_ACCESS_TOKEN` e `MP_COLLECTOR_ID` precisam pertencer ao mesmo vendedor de teste.

No painel da aplicação **Mundo das Esquadrias** no Mercado Pago:

1. Abra **Webhooks > Configurar notificações** no modo de testes.
2. Cadastre `https://ENDERECO.onrender.com/api/webhooks/mercadopago`.
3. Selecione o evento **Pagamentos** e salve.
4. Copie a assinatura secreta gerada diretamente para `MP_WEBHOOK_SECRET` no Render.
5. Salve as variáveis e aguarde o novo deploy.

Use uma conta compradora de teste em uma janela anônima. Valide pagamento aprovado, recusado e pendente, além do retorno ao site e da liberação de créditos após a confirmação do webhook.

## Produção

Somente depois dos testes completos:

1. Ative as credenciais produtivas na aplicação do Mercado Pago.
2. Cadastre o mesmo caminho de webhook na aba de produção e use a nova assinatura secreta.
3. Troque `MP_ACCESS_TOKEN`, `MP_COLLECTOR_ID` e `MP_WEBHOOK_SECRET` pelos valores produtivos.
4. Altere `MP_ENVIRONMENT` para `production` e faça um novo deploy.

O disco contém usuários, sessões, orçamentos, compras e estados de pagamento. Mantenha uma única instância enquanto o projeto usar SQLite e faça backups regulares da pasta persistente.
