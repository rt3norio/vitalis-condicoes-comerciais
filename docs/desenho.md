# Desenho da solução (para aprovação)

Base: `decisoes-stack.md` (S1–S38) e `pendencias-negocio.md` (P1–P12). Nada aqui decide regra de negócio pendente; onde uma pendência afeta o desenho, está marcado.

## 1. Funil

Unidade = **negociação** (1 e-mail = 1 linha). Dentro dela, N **condições** (desconto, verba...).

```
 1 Recebido ──ler_email──▶ 2 Verificação ──verificar──▶ 3 Revisão humana ──aprovar──▶ 4 Aguardando envio ──enviar_erp──▶ 5 Enviado
                               │                            │  └─recusar──▶ Recusado                │
                               └─texto suspeito──▶ Escalado ◀──escalar──┘                        └─erro permanente / pacote mudou──▶ volta para 3
```

| Status | Quem move | Para onde |
|---|---|---|
| 1 Recebido | tarefa `ler_email` (Agente Extrator; dataset usa saída salva) | 2, criando as N condições |
| 2 Verificação | tarefa `verificar` (Agente Verificador + faróis por regra) | 3; ou **Escalado** se LEI-09 vermelho (S33) |
| 3 Revisão humana | pessoa | 4 (todas as condições aprovadas, S25), Recusado ou Escalado |
| 4 Aguardando envio | tarefa `enviar_erp` | 5; ou volta a 3 (S27) |
| 5 Enviado | — | fim |
| Recusado / Escalado | — | fim (escalado pode ser reaberto manualmente) |

Tarefa `redigir` (Agente Redator) roda à parte depois de `verificar` e escreve só o resumo; falha dela não trava o funil. Resposta ao fornecedor e memorando são gerados na tela, quando a pessoa clica em "Gerar texto" (D20).

Toda tarefa: independente, falhável, executada só pelo agendador (rodada a cada 60 s ou "processar agora"). Falha transitória → `proxima_em` e tenta na próxima rodada; permanente → registra e para.

## 2. Tabelas (SQLite / Drizzle)

Todas as tabelas de dados têm `session_id` (S18).

| Tabela | Campos principais |
|---|---|
| `sessoes` | id, criada_em, ultimo_acesso |
| `negociacoes` | id, session_id, status, origem (`dataset`/`colado`/`eml`), message_id, remetente, assunto, recebido_em, corpo, anexos (json), leitura_atual_id, resumo, rascunho_fornecedor, memorando, conferidos (json: quem, quando, ids dos faróis amarelos), motivo_saida, atualizado_em |
| `leituras` | id, negociacao_id, origem (`cache`/`ao_vivo`), modelo, saida_extrator (json), saida_verificador (json), criada_em |
| `condicoes` | id, negociacao_id, ordem, tipo, cod_fornecedor, cod_categoria, lojas (json), percentual, valor, data_inicio, data_fim, contrapartida, cod_condicao_substituida, proveniencia (json por campo: trecho, certeza, alternativas, editado_por), aprovador (json), aprovada_em, idempotency_key, erp_cod_condicao, erp_resposta (json), enviada_em |
| `farois` | id, condicao_id (ou negociacao_id p/ LEI-09), codigo, grupo, cor, titulo, detalhe, ref_politica, calculado_em |
| `tarefas` | id, session_id, negociacao_id, tipo (`ler_email`/`verificar`/`redigir`/`enviar_erp`), status (`pendente`/`executando`/`concluida`/`falhou`), tentativas, proxima_em, lease_ate, ultimo_erro, criada_em, atualizada_em |
| `tentativas` | id, tarefa_id, n, inicio, fim, resultado (`ok`/`transitorio`/`permanente`), http_status, erro, detalhe (json) |
| `erp_fornecedores`, `erp_lojas`, `erp_condicoes` | cópia por sessão da captura de 30/09 08:15 (`mock_erp/respostas`) |
| `erp_idempotencia` | session_id, chave, resposta (json), criada_em (24 h) |
| `erp_chamadas` | session_id, em, metodo, caminho, status — base do limite 10/min e do log |
| `lease` | nome, dono, ate — impede duas rodadas simultâneas (S20) |

Estático (arquivo, não tabela): `extrato_erp.csv` (export de ontem), política (tetos/alçadas em código), lista de aprovadores (P9, premissa), e-mails do dataset, saídas salvas da IA (S36).

## 3. Catálogo de faróis

🟢 verde · 🟡 amarelo (não trava; entra em "Conferi os N itens", S31) · 🔴 vermelho (trava) · ⚪ cinza (só em Política: não aplicável)

**Leitura — IA** (por condição, exceto LEI-09)

| ID | Requisito | 🟢 | 🟡 | 🔴 |
|---|---|---|---|---|
| LEI-01 | Fornecedor identificado | escrito | deduzido (assinatura/domínio) | ausente |
| LEI-02 | Categoria | — | sempre deduzida do nome comercial | ausente |
| LEI-03 | Lojas | escritas / "toda a rede" | — | ausentes |
| LEI-04 | Valor (% ou R$) | escrito | — | ausente ou divergente corpo × anexo |
| LEI-05 | Início | escrito | deduzido (ano implícito) | ausente |
| LEI-06 | Fim | escrito | sugerido, aceito pelo operador | ausente |
| LEI-07 | Contrapartida | escrita | deduzida | ausente (só vermelho em verba) |
| LEI-08 | Verificador concorda | concorda em todos os campos | dúvida em algum campo | discorda em algum campo |
| LEI-09 | Texto suspeito no e-mail | nenhum | — | "Texto suspeito" → Escalado, sem liberação; tela não cita o trecho (D13) |

**Cadastro — regra fixa vs ERP**

| ID | Requisito | 🟢 | 🟡 | 🔴 |
|---|---|---|---|---|
| CAD-01 | Fornecedor no ERP | código exato | inferido por nome/domínio | não encontrado |
| CAD-02 | Lojas no ERP | código exato / REDE | inferidas por nome (ex.: "Méier" → LOJA-107) | alguma não encontrada ou inativa |
| CAD-03 | Categoria no ERP | código do enum | inferida do nome comercial | sem correspondência |

**Política POL-COM-004 — regra fixa, um farol por regra**

| ID | Regra | 🟢 | 🟡 | 🔴 | ⚪ |
|---|---|---|---|---|---|
| POL-04 | Teto por categoria | ≤ teto | — | acima do teto (Alfa: conflito com nota (*) → ação "Escalar") | verba |
| POL-05 | Alçada | mostra alçada exigida | — | vedado (> 25%) | — |
| POL-06a | Vigência ≤ 12 meses | ok | — | excede | — |
| POL-06b | Início não anterior ao cadastro | ok | — | início < hoje (ver P1) | — |
| POL-07 | Verba com contrapartida | descrita | — | ausente | desconto |
| POL-08 | Fornecedor ativo | ativo | — | inativo/bloqueado | — |
| POL-09 | Sem sobreposição | nenhuma | ERP mudou depois do extrato | sobreposição sem decisão de substituir | — |
| POL-10 | Formalizada por e-mail do fornecedor | remetente do domínio do fornecedor | domínio não confere | sem origem | — |

**Contrato do ERP — regra fixa**

| ID | Requisito | 🟢 | 🔴 |
|---|---|---|---|
| ERP-01 | Payload no schema `condicao_post` | válido | inválido (lista campos) |

Aprovar uma condição exige: nenhum 🔴, caixa de conferência marcada se houver 🟡, aprovador com alçada ≥ POL-05. Pacote vai a 4 quando todas aprovadas (S25).

## 4. Telas

**`/` — Painel**
- Topo: data de operação, ERP "N/10 chamadas no último minuto", "próxima rodada em m:ss" + **Processar agora**, **Novo e-mail**. **Reiniciar demo** fica no cabeçalho de todas as telas (D16).
- Botões-filtro com contagem: Todos · Recebido · Verificação · Revisão · Aguardando envio · Enviado · Recusado · Escalado.
- Tabela única: fornecedor · assunto · recebido em · condições (aprovadas/total) · status · andamento. Sem faróis (D17): ficam na negociação. Clique abre a negociação.

**`/negociacoes/[id]` — Negociação**
- Esquerda: e-mail original com trechos usados destacados; anexo em tabela.
- Direita, por condição: campos editáveis com farol de Leitura; faróis de Cadastro, Política e ERP agrupados; resumo do Redator.
- Rodapé: caixa "Conferi os N itens deduzidos", seletor de aprovador, **Aprovar** / **Recusar** / **Escalar**. Textos para enviar abaixo do e-mail original, com **Gerar texto** e **Copiar** (D19, D20).
- Linha do tempo das tarefas e tentativas (S34).

**`/erp` — ERP simulado (apoio à demo)**: condições gravadas e log de chamadas da sessão.

## 5. Rotas e módulos

- ERP simulado (Route Handlers, HTTP real, S30): `GET /api/v1/fornecedores`, `GET /api/v1/lojas`, `GET /api/v1/condicoes?status=`, `POST /api/v1/condicoes`. Sessão vem de header/cookie.
- Ações da tela (Server Actions): editar campo, conferir, aprovar, recusar, escalar, novo e-mail, processar agora, reiniciar demo.
- `src/lib/regras/` motor de faróis (puro, testado) · `src/lib/agentes/` Extrator, Verificador, Redator (AI SDK + Zod) · `src/lib/erp/` cliente HTTP do ERP · `src/lib/tarefas/` processador da rodada · `src/db/` schema Drizzle · `instrumentation.ts` timer de 60 s.

## 6. Riscos para a demo

- **P1 (data real):** com hoje = 22/10, POL-06b fica 🔴 nos 4 e-mails do dataset; nenhum chega a "Enviado" sem alguém editar o início. Precisa ser resolvido antes do vídeo.
- **GLM via OpenRouter:** qualidade da extração em português informal não testada; trocar modelo é só variável (S8).
- **Máquina única no Fly:** sem redundância; aceitável para o case.
