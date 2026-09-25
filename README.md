# Mundo das Esquadrias

## Abrir o site

Na pasta principal, execute `npm.cmd start` no Windows (ou `npm start`). Abra http://localhost:3000 e mantenha o terminal aberto. Para reiniciar ao salvar arquivos do servidor, use `npm.cmd run dev`.

O link do menu exibe **Logar/Cadastrar** quando não há sessão e **Minha conta** depois do login. O perfil está em `/perfil.html`; visitantes são encaminhados ao login e voltam ao perfil após entrar.

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

`npm.cmd test` executa testes com bancos temporários separados, sem Stripe real. Cobrem login, sessão, CSRF, acesso entre contas, perfil, foto, contratos e preferência de pagamento. A prévia visual de desenvolvimento `node test/preview.cjs` roda em 3100 com dados fictícios isolados; não use esse script para publicar o site.

O armazenamento de sessões usa a mesma versão atual do `sqlite3` declarada pelo projeto, sem uma segunda cópia antiga. Execute `npm.cmd audit` e os testes antes de cada publicação.
