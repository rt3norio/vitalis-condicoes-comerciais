# Registro de alterações e decisões

Para o PDF (principalmente seções 04, 05, 06 e 08). Cada item: **o que era → o que mudou → por quê → onde entra no PDF**. Ordem cronológica. Decisões de base em `decisoes-stack.md` (S1–S38) e `pendencias-negocio.md` (P1–P12); dúvidas resolvidas sozinho em `duvidas-do-caminho.md` (C1–C33).

## 1. Definição da stack e arquitetura (21/10, 18h–21h30)

| # | O que era | O que mudou | Por quê | PDF |
|---|---|---|---|---|
| A1 | Protótipo em JS puro feito sem alinhamento | Descartado como base; só referência | Decisões precisam ser revisadas antes de construir | 08 |
| A2 | Hospedagem Vercel + Neon | **Fly.io + SQLite em volume** | Cron grátis da Vercel só roda 1×/dia; fila precisa rodar a cada minuto; Fly mantém a máquina ligada, menos peças | 04, 08 |
| A3 | Envio ao ERP "na hora" | **Tudo é tarefa** em fila no banco, executada por agendador a cada 60 s | ERP instável (503, limite 10/min); operação não é crítica em tempo real; cada tentativa fica registrada | 03, 04, 08 |
| A4 | Revisão humana "opcional" | **Obrigatória**, com saídas aprovar / recusar / escalar | Política exige alçada e aprovador identificado (§5, §10) | 03, 08 |
| A5 | Kanban | **Tabela única** com botões de status como filtro | Pedido do usuário; uma visão só | 06 |
| A6 | Linha = condição | **Linha = negociação (e-mail)** com condições dentro; pacote sobe junto | Premissa P11 (desconto e verba do mesmo e-mail são um pacote) | 01, 08 |
| A7 | Envio parcial sem tratamento | Reconfere tudo com o ERP ao vivo antes do 1º envio; erro permanente volta à revisão; transitório tenta de novo | ERP não tem transação entre POSTs | 08 |
| A8 | Cores livres | **Semáforo** 🟢🟡🔴, cinza só em Política (não se aplica); um farol por regra da política | Operador decide de relance; política auditável regra a regra | 06 |

## 2. Construção (21/10 21h40 – 22/10)

| # | O que era | O que mudou | Por quê | PDF |
|---|---|---|---|---|
| B1 | — | Motor de faróis em código (Leitura, Cadastro, Política, Contrato ERP), 21 testes | Regra de negócio previsível; IA só onde há texto livre | 05 |
| B2 | — | ERP simulado por HTTP de verdade (`/api/v1/*`), mesmo contrato do mock (429, 503, idempotência) | Provar que "chega ao ERP no formato que ele aceita"; trocar para SAP = trocar endereço | 04 |
| B3 | Sem chave de IA | Leitura de referência manual **rotulada como manual** | Nunca apresentar dado feito à mão como saída de IA | 05 |
| B4 | Leitura dependia de 3 GETs no mesmo instante (51% de sucesso com 20% de 503) | Cada GET bem-sucedido fica salvo; cadastros valem 10 min, condições 60 s | Teste mostrou a Alfa presa em "Recebido" por 503 seguidos | 08 |
| B5 | Uma rodada só pegava tarefas criadas antes dela | Rodada repassa a fila até 4 vezes | Cada etapa levava 1 min; avaliador esperaria demais | 08 |
| B6 | Condição já gravada podia ser editada/desaprovada | Travada depois de gravada no ERP | Edição nunca chegaria ao ERP | 08 |

## 3. IA real (22/10 madrugada, chave OpenRouter, GLM-5.3)

| # | O que era | O que mudou | Por quê | PDF |
|---|---|---|---|---|
| C1 | Raciocínio longo do GLM truncava o JSON | `reasoning: low` + limite de saída maior | Erro real no 1º teste | 05 |
| C2 | Ano chutado (2025) na Gama | Data do e-mail passa a ir junto para a IA | O modelo não via o cabeçalho `Date:` | 05 |
| C3 | "Instrução suspeita" falsa na Alfa (pressão comercial) | Campo obrigatório `dirigida_ao_sistema`; o código só aceita `true` | Defesa estrutural contra falso positivo | 05 |
| C4 | Categoria da verba / Nutrivida não casava | Prompt pede a linha de produto; reserva por regra (outra condição do e-mail ou histórico do fornecedor) | Sem categoria o farol fica vermelho à toa | 05 |
| C5 | IA às vezes lista só a versão do anexo numa divergência | Divergência detectada por regra; o valor do corpo entra como opção | Gama 12% × 12,5% sumiu numa geração | 05, 08 |
| C6 | Custo de IA a cada visitante | **Dataset usa a saída salva da IA** (Extrator, Verificador, Redator); reiniciar não gasta | Pedido do usuário: o processo roda uma vez em segundo plano | 04 |
| C7 | — | Botão **Gerar novos e-mails (IA)** + script de exemplos | Testar cenários novos sem depender do dataset | 07 |
| C8 | — | Teste adversarial: valor apagado de propósito → Verificador discordou citando o trecho | Evidência de que a 2ª leitura independente funciona | 05 |
| C9 | Redator: texto salvo valia sempre que o status batia; depois de "reler ao vivo" num e-mail do exemplo caía no texto padrão | Texto salvo só quando a leitura também é a salva; Redator ao vivo só quando a leitura foi ao vivo (e-mail novo ou "reler ao vivo") | A auditoria (D14) deixaria visível um Redator "saída salva" descrevendo outra leitura; sem custo por visitante continua valendo | 05 |

## 4. Interface — iterações com o usuário (22/10)

| # | O que era | O que mudou | Por quê | PDF |
|---|---|---|---|---|
| D1 | Resumo do Redator em prosa | **3 a 5 tópicos**: o que é, o que trava (um por problema), o que decidir | Pedido: mais fácil de ler | 06 |
| D2 | E-mail original sempre aberto à esquerda | **Recolhido** ("Ver e-mail original ▾"), com destaques ao abrir | Pedido: disponível, mas fora do caminho | 06 |
| D3 | Lista longa de faróis por grupo | **Faixa de 20 bolinhas em ordem fixa** (Leitura 8 · Cadastro 3 · Política 8 · ERP 1), detalhe recolhido; mesma faixa no painel | A pessoa aprende o padrão: cada posição é sempre a mesma regra. *Painel revisto em D17.* | 06 |
| D4 | Faróis só na lista | **Bolinha ao lado de cada campo** = pior cor dos faróis do campo, com "confira"/"resolver" | Mostrar onde está o problema, não só que existe | 06 |
| D5 | Bloqueio por código ("Trava: LEI-04, POL-06b") | Texto de negócio ("Início não anterior à data do cadastro: …") | Usuário não técnico | 06 |
| D6 | Dica do campo em prosa, via `title` | **Tooltip em tópicos** (bolinha + título + motivo), "confira ⓘ" sublinhado pontilhado | Pedido: tópicos e deixar claro que há dica | 06 |
| D7 | "Instrução dirigida ao sistema" | **"Texto suspeito encontrado"**: trecho citado, o que pedia, o que o sistema fez, o que fazer; escalado cita "texto suspeito"; etiqueta no painel | Pedido: cenário de injeção mais claro. *Revisto em D13.* | 05, 06 |
| D8 | Caixa única "Conferi os N itens amarelos" | **Botão "Dar ciência" em cada item amarelo**; aprovação só com todos cientes; ciência vale para o texto do item (se uma edição muda o item, pede ciência de novo) | Pedido: mostrar que a pessoa viu cada item específico; rastro por item | 06, 08 |
| D9 | "Dar ciência" só na lista abaixo dos faróis | **Botão "Dar ciência" também ao lado do "confira ⓘ" de cada campo**; dá ciência exatamente nos itens que o tooltip mostra ("(2)" quando mais de um); a lista continua como visão geral e para itens sem campo (ex.: Verificador) | Pedido: a pessoa vê o que está confirmando no mesmo lugar em que confirma | 06 |
| D10 | Aprovador escolhido num select em cada condição; tudo visível para todos | **Seletor "Quem você é" no topo** (sem login, é um case): Analista Comercial (Renata, sem alçada) + 4 aprovadores fictícios. Aprovação vira "Aprovar como {você}" e trava se o seu perfil não tem a alçada; ciência e escalonamento ficam no seu nome. **Escalado só aparece para Diretoria/Comitê e para quem escalou** (texto suspeito, escalado pelo sistema: só Diretoria/Comitê); só eles reabrem. Recusado continua visível a todos. | Pedido: aprovações no nome de quem está usando; escalado visível só para quem deve ver. *Premissas:* "só você vê" = destino do escalonamento + quem escalou; recusado como histórico aberto | 06, 08 |
| D11 | Tela da negociação mostrava tudo: faixa e lista de faróis, observações da IA, linha do tempo, textos e premissas | **Tela enxuta para decidir:** topo com resumo e e-mail recolhido; cada condição só com campos (bolinha, confira, Dar ciência), o que trava, substituir e Aprovar. Itens amarelos sem campo (ex.: Verificador) em "Também precisa de ciência". **No fim, recolhidos:** "Textos prontos para copiar" e "Detalhes para auditoria" (faróis completos, observações da IA, linha do tempo, premissas) | Pedido: o operador entra e vê o mínimo para decidir ou ajustar; dados de auditoria/debug ficam disponíveis no fim | 06 |
| D12 | Linha do tempo só com tarefas do sistema | **Linha do tempo com quem fez o quê:** mescla tarefas do sistema e ações de pessoas (ciência dada/desfeita, aprovação/desfazer, escolha entre divergências, sugestão aceita, edição de campo de → para, substituição, escalar/recusar, reabrir, reler com IA), cada uma com nome, cargo e hora. Nova tabela `eventos` (migração 0003) | Pedido: rastro completo das decisões humanas para auditoria | 06, 08 |
| D13 | Texto suspeito detalhado na tela (revê D7): trecho citado, "o que o texto pedia", "o que o sistema fez", trecho em vermelho no e-mail e legenda explicando | **Só marca e escala:** faixa "⚠ Texto suspeito · Escalado à Diretoria Comercial"; etiqueta no painel sem explicação; e-mail sem destaque vermelho; farol LEI-09 e motivo do escalonamento sem citar o trecho ("Texto suspeito no e-mail. Escalado à Diretoria Comercial."); Redator instruído a dizer só "texto suspeito", sem descrever o pedido (resumo e memorando regenerados) | Pedido: o processo de texto suspeito tem que ser singelo, sem expor nada. *Premissas:* o trecho continua no e-mail original (é o e-mail) e no retorno bruto da IA dentro da auditoria (D14), que é área de auditoria recolhida e, no caso escalado, só Diretoria/Comitê veem; a explicação da defesa fica no PDF (§05, §08), para quem avalia, não na tela. **Confirmado pelo usuário (22/10): a auditoria mantém o retorno bruto da IA, sem ocultar o trecho.** | 05, 06, 10 |
| D14 | IA auditável só pelo resultado final (campos e observações) | **Auditoria da IA rodada por rodada** em "Detalhes para auditoria": cada chamada de agente (Gerador, Extrator, Verificador, Redator) agrupada pela rodada (tarefa + tentativa), com: mensagem enviada ao modelo, instruções do agente (system prompt), parâmetros, **tools usadas** (lista vinda do SDK; hoje sempre "nenhuma": os agentes não têm ferramentas), raciocínio quando o provedor devolve, **retorno** (JSON) ou texto bruto e erro quando falha, tokens e tempo. Nova tabela `chamadas_ia` (migração 0004). Saída salva aparece como "saída salva" com a data em que foi gerada; ao vivo como "ao vivo". Cache dos 4 e-mails regenerado com GLM para guardar também a entrada de cada chamada (valores lidos iguais aos de antes; Gama trocou a ordem das 2 condições) | Pedido: ver os dados que a IA recebeu, as tools que usou e o retorno, rodada por rodada, na parte de debug. *Premissa:* falha do Gerador (botão) não fica registrada, porque não há negociação onde guardar | 05, 06, 08 |
| D15 | Clicar de novo na alternativa já escolhida gravava de novo e repetia o evento na linha do tempo | Clique no valor já escolhido não faz nada ("Valor já escolhido.") | Achado no teste da Gama: a linha do tempo ficava com eventos repetidos | 06 |
| D16 | "Reiniciar demo" discreto (botão fantasma) só no Painel; zerava o banco da sessão mas mantinha o perfil escolhido | **"↺ Reiniciar demo" no cabeçalho de todas as telas** (Painel, negociação, ERP). Zera tudo da sessão: os 4 e-mails voltam para Recebido; e-mails colados e gerados, ciências, aprovações, linha do tempo e auditoria da IA são apagados; ERP volta à captura de 30/09; limites da demo (colar, gerar) zeram; **perfil volta para Analista Comercial**. Confirmação lista o que será apagado; ao fim volta ao Painel (a negociação aberta deixa de existir). Usa a mesma trava da rodada: se uma rodada estiver em andamento, pede para tentar em segundos, para um envio ao ERP em voo não gravar condição na sessão recém-semeada | Pedido: "faltou o botão reiniciar pra poder limpar tudo e voltar e testar tudo do zero". *Premissas:* "do zero" = como a primeira visita, por isso o perfil também volta; a sessão (cookie) é a mesma, só semeada de novo; a saída salva da IA continua (reiniciar não gasta IA) | 06, 07 |
| D17 | Painel com coluna "Faróis" (uma faixa de 20 bolinhas por condição em cada linha) e legenda "Como ler as bolinhas" abaixo da tabela (revê D3 no painel) | **Tabela sem faróis:** fornecedor, assunto, recebido, condições (aprovadas/total), status (com a etiqueta "texto suspeito" quando houver) e andamento. Faróis só na tela da negociação (bolinha por campo; faixa completa em "Detalhes para auditoria"). A consulta do painel deixou de buscar os faróis | Pedido: "tira os faróis da tabela. é muita informação". O painel serve para escolher o que abrir; o status já diz o que depende da pessoa | 06 |
| D18 | Texto suspeito: escalado à Diretoria Comercial, sem dizer o que acontece depois com a condição | **Decisão de negócio do usuário: a condição está morta.** O escalonamento existe para validar o caso com o time de negócios (validação pendente, P12), mas a proposta que chegou com texto suspeito não segue no fluxo. Para o processo seguir, é preciso **um novo contato do fornecedor**, que entra no fluxo como e-mail novo, sem texto suspeito, e passa por todas as etapas normalmente (leitura, verificação, revisão, aprovação, ERP). O protótipo já se comporta assim, **sem mudança de código**: a negociação escalada por texto suspeito não tem reabertura na tela (nem para Diretoria/Comitê), não pode ser relida pela IA e nada é gravado no ERP; um e-mail novo do fornecedor vira negociação nova | Posição do usuário (22/10): "dado o cenário com texto suspeito, ele foi escalado, e deveria ser validado com o time de negócios, mas essa condição estaria, na minha opinião, morta. Precisaria que fizesse um outro contato, que entraria no fluxo corretamente, sem texto suspeito, para que o processo seguisse corretamente." | 08, 10 |

## 5. Ambiente

| # | Fato | Consequência |
|---|---|---|
| E1 | Máquina com pouca memória: o Claude Code encerra processos parados | Servidor roda em modo produção (`build` + `start`), mais leve que o de desenvolvimento |
| E2 | Hook GateGuard (plugin ECC) pede justificativa antes de cada escrita | Custo de tempo na construção; não afeta o produto |
| E3 | `docs/` ficava fora do repositório (sem versão) | Movida para dentro do repositório (`docs/`, 22/10, pedido do usuário): decisões e registro versionados junto com o código; fora da imagem Docker (`.dockerignore`) |
