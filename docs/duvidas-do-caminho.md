# Dúvidas e decisões tomadas no caminho

Registro do que surgiu durante a construção do protótipo (21/10, 21:40–22:15), decidido sem perguntar conforme combinado. Cada item: o que surgiu, o que fiz, se precisa de você.

## Precisa de você

| # | O que surgiu | O que fiz | O que preciso |
|---|---|---|---|
| C1 | ~~Sem chave do OpenRouter~~ **Resolvido 22:40:** chave em `web/.env.local` (fora do git). Cache real gerado para os 4 e-mails (Extrator, Verificador e Redator, GLM-5.3). | — | Trocar a chave depois do case (ficou registrada na conversa). |
| C4 | P1 (data real): os 4 e-mails nascem com POL-06b vermelho. | Para destravar, a pessoa edita o início na tela (vira verde "ajustado na revisão"). Foi assim que testei a Beta (início 22/10). | Decidir P1: é aceitável o operador mudar a data sem novo aceite do fornecedor? Para o vídeo, é a única forma de chegar a "Enviado". |
| C15 | Deploy no Fly. | `Dockerfile` e `fly.toml` prontos (máquina sempre ligada, volume `/data`, região gru). Não testei o build da imagem (Docker não verificado aqui) e não implantei. | Conta Fly + autorização para `fly deploy`. Custo estimado US$ 4–7/mês. |
| C14 | O hook GateGuard do ECC bloqueou 34 escritas/comandos pedindo justificativa. | Respondi cada um. Custou tempo de construção. | Decidir se mantém; dá para isentar a pasta com `GATEGUARD_EXEMPT_GLOBS`. |
| C24 | ~~Custo de IA por visitante~~ **Resolvido conforme você:** dataset nunca chama a IA ao vivo (usa a saída salva, inclusive do Redator); reiniciar não gasta. *Desde D20: os textos para enviar são gerados ao vivo quando a pessoa clica em "Gerar texto".* IA ao vivo só em e-mail gerado/colado ou "reler ao vivo". | — | — |
| C25 | Build da imagem Docker não verificado: Docker Desktop está desligado nesta máquina. | `pnpm build` de produção passa local; o Dockerfile desliga o agendador no build. | Ligar o Docker Desktop (ou deixar o Fly montar a imagem no deploy). |

## Decidido por mim (vetável)

| # | O que surgiu | O que fiz |
|---|---|---|
| C2 | AI SDK 7 marca `generateObject` como obsoleto (S12). | `generateText` + `Output.object({ schema })`, o substituto oficial. Mesma validação Zod. |
| C3 | Next 16 vem com `cacheComponents: true`. | Mantive. Partes por sessão ficam em `<Suspense>` com `connection()`. |
| C5 | Aprovação é por condição (cada uma na sua alçada, §5), mas a conferência dos amarelos é uma só para a negociação. | Uma caixa "Conferi os N itens" por negociação; registra quem, quando e quais faróis. |
| C6 | Conferência feita e depois alguém edita um campo. | Qualquer edição apaga a conferência (precisa conferir de novo). |
| C7 | Categoria aparece amarela duas vezes (LEI-02 leitura e CAD-03 cadastro) para o mesmo fato. | Mantive: são perguntas diferentes (o que o fornecedor disse × qual código do ERP). Pode parecer redundante para o usuário. |
| C8 | Falha de IA para sempre custaria crédito. | 5 tentativas → falha permanente. "IA não configurada" não conta (não gasta nada). |
| C9 | Cada leitura fazia 3 GETs no ERP; com 20% de 503, só 51% das tentativas passavam e a Alfa ficou presa. | Cada GET que dá certo fica salvo; a próxima tentativa só busca o que falta. Cadastros valem 10 min, condições 60 s. Reconferência antes do envio sempre consulta de novo condições e fornecedores. |
| C10 | Redator falhando travaria o funil por um texto. | Depois de 3 falhas usa texto padrão (rotulado "padrão, sem IA"). |
| C11 | Sem Verificador (sem chave), LEI-08 ficaria verde por omissão. | LEI-08 fica amarelo: "Verificador não executado". |
| C12 | Pacote volta para revisão (reconferência ou erro 422). | Aprovações das condições afetadas são desfeitas; a nova aprovação gera nova `Idempotency-Key`. |
| C16 | Sessões nunca expiram; o banco cresce a cada visitante. | Não tratei. Para a avaliação (dezenas de acessos) não pesa. |
| C17 | Escalado/Recusado podem voltar? | "Reabrir para revisão" permitido, exceto quando LEI-09 (instrução suspeita) está vermelho (S33). |
| C18 | E-mail colado sem cabeçalho padrão. | Aceito "From:/Subject:" e "De:/Assunto:"; sem cabeçalho vira "E-mail colado" sem remetente (POL-10 fica amarelo). |
| C19 | Limite de 10/min por sessão é dividido entre todas as tarefas da sessão. | Numa sessão nova, as primeiras leituras podem pegar 429; a fila respeita o `Retry-After` e segue. |
| C20 | P8 (sobreposição entre tipos). | Apliquei a leitura proposta: só entre condições do mesmo tipo (desconto × desconto). |
| C21 | Substituição quando a nova começa antes da antiga. | ERP simulado encerra a antiga (status ENCERRADA) se a véspera cair antes do início dela. |
| C22 | Rodada só via tarefas criadas antes dela: cada etapa levava 1 min. | A rodada repassa a fila até 4 vezes enquanto houver tarefa pronta. |
| C23 | Agendador em `pnpm dev` não recarrega com HMR. | Precisa reiniciar o servidor de desenvolvimento após mudar a fila. Em produção não se aplica. |
| C26 | Depois de envio parcial, a pessoa poderia desaprovar/editar uma condição já gravada no ERP (a edição nunca seria enviada). | Condição com código do ERP fica travada: não edita nem desaprova. |
| C27 | `next build` também carrega o instrumentation. | Agendador não sobe na fase de build (`NEXT_PHASE`) nem com `AGENDADOR=off`. |
| C28 | GLM-5.3 gastava ~4.500 tokens raciocinando e truncava o JSON. | `reasoning: { effort: "low" }` + `maxOutputTokens` 12 mil. |
| C29 | Teste real da IA mostrou: ano chutado (sem data do e-mail), categoria da verba errada, "instrução suspeita" que era só pressão comercial. | Data do e-mail vai no material; prompt da categoria ajustado; campo `dirigida_ao_sistema` obrigatório e o código só considera `true`; categoria de reserva por regra (outra condição do e-mail ou histórico do fornecedor). |
| C30 | Numa de 4 leituras o Extrator devolveu percentual vazio num e-mail com "18%" escrito. | Não repetiu em 3 novas leituras. Testei o Verificador com o valor apagado de propósito: discordou citando o trecho. É o papel dele (LEI-08). |
| C31 | Com IA real, a verba da Gama também vem com divergência (R$ 8.000 no corpo × R$ 2.000 por loja na planilha). | Fica vermelho até a pessoa escolher — é a pendência P2 aparecendo na tela, como deveria. |
| C32 | Botão "Gerar novos e-mails" chama a IA na hora (até 1 min), não como tarefa da fila. | É ferramenta da demo, fora do funil; os e-mails gerados entram no funil como tarefas normais. Limite: 3 gerações × 3 e-mails por sessão. |
| C33 | Após o servidor ter sido encerrado por falta de memória, não o subi de novo. | Testei a IA e as regras por scripts (sem servidor). A tela nova (botão Gerar) **não foi vista no navegador**. |
