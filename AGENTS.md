# Mundo das Esquadrias — preferências de trabalho

## Modelo e economia de tokens

- O usuário prioriza economia e quer orientação antes de cada nova tarefa de implementação. Indique, em uma frase, o modelo exato, o nível de raciocínio recomendado e o motivo. Não repita isso em cada mensagem da mesma tarefa.
- Preferência inicial do usuário: **GPT-5.6 Sol, Médio**. Não confundir com GPT-6 Sol. Para pequenas alterações bem definidas de texto, HTML ou CSS, sugerir Baixo, se disponível.
- Recomendar Alto quando a complexidade ou o risco concreto justificar, especialmente em alterações delicadas de autenticação, pagamentos e dados. Não elevar apenas pelo nome da funcionalidade.
- Sugerir **GPT-6 Astra** para problemas realmente difíceis, como falhas persistentes entre vários componentes ou decisões arquiteturais complexas. Explicar o ganho esperado antes de recomendar a troca. Extremo/Ultra não são padrão nem consequência automática da escolha do Astra.
- O usuário muda o seletor do aplicativo. Não trocar modelos automaticamente, nem afirmar que a configuração ativa mudou sem confirmação verificável. Estas são preferências de orientação, não configurações do motor.

## Execução enxuta

- Responder em português, com concisão, e trabalhar no escopo solicitado.
- Evitar agentes adicionais por padrão, releituras amplas e repetição de código já disponível. Usar paralelismo apenas quando o benefício justificar o consumo extra.
- Preservar testes proporcionais ao risco, segurança e dados locais; economia não justifica omitir validações importantes.
- Não prometer percentuais de economia nem tratar preços da API como consumo exato do plano do aplicativo.
