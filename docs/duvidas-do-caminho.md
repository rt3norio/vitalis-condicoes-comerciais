# Dúvidas e decisões tomadas no caminho

O que surgiu durante a construção do protótipo (21/10, das 21:40 às 22:15) e foi decidido sem perguntar, como combinado.

## Precisa de você

| # | O que surgiu | O que fiz | O que preciso |
|---|---|---|---|
| C1 | ~~Sem chave do OpenRouter~~ Resolvido às 22:40: chave em `web/.env.local` (fora do git). Cache real gerado para os 4 e-mails (Extrator, Verificador e Redator, GLM-5.3). | — | Trocar a chave depois do case (ela ficou registrada na conversa). |
| C4 | P1 (data real): os 4 e-mails nascem com POL-06b vermelho. | Para destravar, a pessoa edita o início na tela (o farol vira verde "ajustado na revisão"). Foi assim que testei a Beta (início 22/10). | Decidir P1: é aceitável o operador mudar a data sem novo aceite do fornecedor? Para o vídeo, é a única forma de chegar a "Enviado". |
| C15 | Deploy no Fly. | `Dockerfile` e `fly.toml` prontos (máquina sempre ligada, volume `/data`, região gru). Não testei o build da imagem (o Docker não foi verificado aqui) e não implantei. | Conta Fly + autorização para `fly deploy`. Custo estimado de US$ 4 a 7/mês. |
| C14 | O hook GateGuard do ECC bloqueou 34 escritas/comandos pedindo justificativa. | Respondi a cada um, o que custou tempo de construção. | Decidir se mantém; dá para isentar a pasta com `GATEGUARD_EXEMPT_GLOBS`. |
| C24 | ~~Custo de IA por visitante~~ Resolvido conforme você pediu: o dataset nunca chama a IA ao vivo (usa a saída salva, inclusive a do Redator), e reiniciar não gasta. *Desde D20, os textos para enviar são gerados ao vivo quando a pessoa clica em "Gerar texto".* Fora isso, a IA ao vivo só roda em e-mail gerado/colado ou em "reler ao vivo". | — | — |
| C25 | O build da imagem Docker não foi verificado: o Docker Desktop está desligado nesta máquina. | O build de produção (`pnpm build`) passa localmente; o Dockerfile desliga o agendador no build. | Ligar o Docker Desktop (ou deixar o Fly montar a imagem no deploy). |

## Decidido por mim (vetável)

| # | O que surgiu | O que fiz |
|---|---|---|
| C2 | O AI SDK 7 marca `generateObject` como obsoleto (S12). | Usei `generateText` + `Output.object({ schema })`, o substituto oficial, com a mesma validação Zod. |
| C3 | O Next 16 vem com `cacheComponents: true`. | Mantive. As partes por sessão ficam em `<Suspense>` com `connection()`. |
| C5 | A aprovação é por condição (cada uma na sua alçada, §5), mas a conferência dos amarelos é uma só para a negociação. | Uma caixa "Conferi os N itens" por negociação, que registra quem, quando e quais faróis. |
| C6 | A conferência é feita e depois alguém edita um campo. | Qualquer edição apaga a conferência (é preciso conferir de novo). |
| C7 | A categoria aparece amarela duas vezes (LEI-02 leitura e CAD-03 cadastro) para o mesmo fato. | Mantive, porque são perguntas diferentes (o que o fornecedor disse × qual código do ERP). Pode parecer redundante para o usuário. |
| C8 | Repetir para sempre uma chamada de IA que falha custaria crédito. | Depois de 5 tentativas, a falha vira permanente. "IA não configurada" não conta, porque não gasta nada. |
| C9 | Cada leitura fazia 3 GETs no ERP; com 20% de 503, só 51% das tentativas passavam, e a Alfa ficou presa. | Cada GET que dá certo fica salvo, e a próxima tentativa só busca o que falta. Cadastros valem 10 min; condições, 60 s. A reconferência antes do envio sempre consulta de novo condições e fornecedores. |
| C10 | Se o Redator falhasse, o funil travaria por causa de um texto. | Depois de 3 falhas, usa o texto padrão (rotulado "padrão, sem IA"). |
| C11 | Sem Verificador (sem chave), LEI-08 ficaria verde por omissão. | LEI-08 fica amarelo: "Verificador não executado". |
| C12 | O pacote volta para revisão (reconferência ou erro 422). | As aprovações das condições afetadas são desfeitas, e a nova aprovação gera uma nova `Idempotency-Key`. |
| C16 | As sessões nunca expiram, e o banco cresce a cada visitante. | Não tratei. Para a avaliação, com dezenas de acessos, isso não pesa. |
| C17 | Escalado/Recusado podem voltar? | "Reabrir para revisão" é permitido, exceto quando LEI-09 (instrução suspeita) está vermelho (S33). |
| C18 | E-mail colado sem cabeçalho padrão. | Aceito "From:/Subject:" e "De:/Assunto:". Sem cabeçalho, vira "E-mail colado" sem remetente (POL-10 fica amarelo). |
| C19 | O limite de 10/min por sessão é dividido entre todas as tarefas da sessão. | Numa sessão nova, as primeiras leituras podem pegar 429; a fila respeita o `Retry-After` e segue. |
| C20 | P8 (sobreposição entre tipos). | Apliquei a leitura proposta: só entre condições do mesmo tipo (desconto × desconto). |
| C21 | Substituição quando a nova começa antes da antiga. | O ERP simulado encerra a antiga (status ENCERRADA) se a véspera cair antes do início dela. |
| C22 | A rodada só via as tarefas criadas antes dela, então cada etapa levava 1 min. | A rodada repassa a fila até 4 vezes enquanto houver tarefa pronta. |
| C23 | O agendador em `pnpm dev` não recarrega com HMR. | É preciso reiniciar o servidor de desenvolvimento depois de mudar a fila. Em produção, isso não se aplica. |
| C26 | Depois de um envio parcial, a pessoa poderia desaprovar/editar uma condição já gravada no ERP (a edição nunca seria enviada). | A condição com código do ERP fica travada e não pode ser editada nem desaprovada. |
| C27 | `next build` também carrega o instrumentation. | O agendador não sobe na fase de build (`NEXT_PHASE`) nem com `AGENDADOR=off`. |
| C28 | O GLM-5.3 gastava ~4.500 tokens raciocinando e truncava o JSON. | `reasoning: { effort: "low" }` + `maxOutputTokens` 12 mil. |
| C29 | O teste real da IA mostrou ano chutado (sem a data do e-mail), categoria da verba errada e uma "instrução suspeita" que era só pressão comercial. | A data do e-mail vai no material; o prompt da categoria foi ajustado; o campo `dirigida_ao_sistema` é obrigatório e o código só considera `true`; há categoria de reserva por regra (outra condição do e-mail ou histórico do fornecedor). |
| C30 | Em uma de 4 leituras, o Extrator devolveu percentual vazio num e-mail com "18%" escrito. | Não se repetiu em 3 novas leituras. Testei o Verificador com o valor apagado de propósito, e ele discordou citando o trecho, que é o papel dele (LEI-08). |
| C31 | Com IA real, a verba da Gama também vem com divergência (R$ 8.000 no corpo × R$ 2.000 por loja na planilha). | Fica vermelho até a pessoa escolher. É a pendência P2 aparecendo na tela, como deveria. |
| C32 | O botão "Gerar novos e-mails" chama a IA na hora (até 1 min), fora da fila de tarefas. | É uma ferramenta da demo, fora do funil; os e-mails gerados entram no funil como tarefas normais. Limite: 3 gerações × 3 e-mails por sessão. |
| C33 | Depois que o servidor foi encerrado por falta de memória, não o subi de novo. | Testei a IA e as regras por scripts, sem servidor. A tela nova (botão Gerar) **não foi vista no navegador**. |
