# Mundo das Esquadrias

## Abrir o site

Na pasta principal, execute `npm.cmd start` no Windows (ou `npm start`). Abra http://localhost:3000 e mantenha o terminal aberto. Para reiniciar ao salvar arquivos do servidor, use `npm.cmd run dev`.

O link do menu exibe **Logar/Cadastrar** quando não há sessão e **Minha conta** depois do login. O perfil está em `/perfil.html`; visitantes são encaminhados ao login e voltam ao perfil após entrar.

O botão **Solicitar Orçamento** abre `/orcamento.html`, um formulário guiado para alumínio, vidro, medidas, acabamentos e instalação. A solicitação recebe um protocolo, fica salva no banco e pode ser continuada pelo WhatsApp. O formulário não inventa preço: o valor final depende da validação técnica e de uma tabela comercial que ainda deverá ser cadastrada.

Clientes autenticados acompanham seus protocolos em **Minha conta → Orçamentos**. A situação exibida é atualizada pela empresa no painel administrativo.

## Painel administrativo e preços

O painel está em `/admin.html` e exige uma conta marcada como administradora no banco. Contas comuns recebem acesso negado e nunca conseguem consultar contatos de outros clientes. Para promover uma conta existente, execute localmente:

`npm.cmd run admin:promote -- email-da-conta@exemplo.com`

O comando não cria usuário nem altera senha; apenas concede a função administrativa à conta encontrada. Não coloque o e-mail do administrador no código público.

No painel é possível consultar solicitações, alterar a situação do atendimento e cadastrar preços por categoria e modelo. Cada regra usa preço por metro quadrado, valor mínimo do item e instalação por unidade. O formulário só apresenta estimativa quando todos os modelos do pedido possuem uma regra ativa. Os valores devem ser cadastrados pela empresa com sua tabela comercial real.

Para testar com Live Server, deixe o Node rodando e abra `http://localhost:5500/site/index.html` (ou `/index.html` se o Live Server usa `site` como raiz). O arquivo `api.js` reconhece a porta 5500 e usa o Node na porta 3000, mantendo o mesmo hostname para os cookies. Em produção, o site e a API devem usar o mesmo domínio HTTPS.

## Área do cliente

- Perfil editável, foto JPG/PNG/WebP de até 2 MB, recodificada para WebP e acessível somente pelo titular.
- Compras, contratos e documentos isolados por conta. As listas não contêm vendas de demonstração.
- Preferência Pix/boleto/cartão persistida. É uma preferência, não emissão de cobrança.
- Integração opcional com portal Stripe para cadastrar/trocar cartões e gerenciar assinaturas existentes. Veja [configuração e limites](docs/PAGAMENTOS.md).

Não existe painel administrativo nem checkout de novas compras/planos neste estágio. Compras e contratos precisam ser alimentados com registros reais da empresa; assinaturas e faturas são consultadas do cliente Stripe vinculado quando o provedor está configurado. Assinar um contrato eletronicamente requer uma integração adicional de assinatura.

## Instalação nova e dados

Use Node 24 LTS e `npm.cmd install`. Copie `.env.example` para `.env` somente em instalação nova e defina uma `SESSION_SECRET` aleatória. Não substitua o `.env` existente. `node server.js` continua funcionando como antes.

Na primeira inicialização a aplicação acrescenta as colunas de foto/preferência e as tabelas de compras/contratos/pagamentos ao banco existente, preservando os usuários. Faça backup da pasta `data` e do `.env` antes de publicar ou migrar de máquina. Os arquivos de dados não são servidos como estáticos.

Para criar uma cópia consistente dos bancos desta instalação em `data/backups/`, execute `node scripts/backup.cjs`. O comando não sobrescreve backups anteriores. PDFs em `data/contratos/` e o `.env` devem ser guardados separadamente; o script copia apenas os dois bancos SQLite.

O `.env`, os bancos em `data` e `node_modules` foram retirados do índice do Git e continuam disponíveis somente na instalação local. O `.gitignore` impede que voltem a novos commits. Como o `.env` já apareceu em versões anteriores, repositórios que tenham sido publicados ainda exigem rotação dos segredos e, se necessário, limpeza planejada do histórico remoto; apagar o arquivo local não corrige o histórico e impediria o servidor de iniciar.

## Verificação

`npm.cmd test` executa testes com bancos temporários separados, sem Stripe real. Cobrem login, sessão, CSRF, acesso entre contas, perfil, foto, contratos, orçamentos, administração, preços e preferência de pagamento. A prévia visual de desenvolvimento `node test/preview.cjs` roda em 3100 com dados fictícios isolados; não use esse script para publicar o site.

O armazenamento de sessões usa a mesma versão atual do `sqlite3` declarada pelo projeto, sem uma segunda cópia antiga. Execute `npm.cmd audit` e os testes antes de cada publicação.
