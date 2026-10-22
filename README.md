# Vitalis · Condições comerciais

Protótipo do case AI Builder (Pareto): e-mail do fornecedor → agentes de IA → conferência humana → condição gravada no ERP.

## Rodar local

```bash
pnpm install
cp .env.example .env.local   # opcional: OPENROUTER_API_KEY para a IA rodar de verdade
pnpm dev                     # http://localhost:3000
pnpm test                    # faróis (Cadastro/Política) e contrato do ERP
```

O banco é SQLite, em `.data/app.db`, criado e migrado sozinho. Sem chave de IA, os 4 e-mails do dataset usam uma leitura de referência feita à mão, e a tela avisa que é manual.

Com chave, `pnpm gerar-cache-ia` gera o cache real da IA para os 4 e-mails e grava `data/leituras-ia-cache.json`, que já está no repositório. Reiniciar a demo usa esse cache e não chama a IA.

Para e-mails de teste, `pnpm gerar-exemplos 6` escreve e-mails fictícios em `data/exemplos/` (para colar ou subir pela tela) e mostra como cada um seria lido. Na tela, o botão **Gerar novos e-mails (IA)** faz o mesmo direto no funil.

## Como funciona

Cada e-mail é uma negociação que passa por um funil. Cada etapa é uma tarefa gravada no banco e executada em segundo plano por um agendador, a cada 60 s ou quando alguém clica em "Processar agora". Uma falha transitória (IA fora, ERP 503/429) fica registrada, e a tarefa tenta de novo na rodada seguinte.

```
Recebido ──ler_email──▶ Verificação ──verificar──▶ Revisão humana ──aprovar──▶ Aguardando envio ──enviar_erp──▶ Enviado
                                  └─ instrução suspeita ─▶ Escalado        └─ recusar / escalar
```

| Etapa | Quem faz | IA? |
|---|---|---|
| Ler e-mail | Agente Extrator: campos, trecho de origem e certeza | Sim |
| Nome → código do ERP | Regra fixa (`src/lib/regras/resolver.ts`) | Não |
| Conferir leitura | Agente Verificador, que lê o e-mail de forma independente | Sim |
| Faróis de Cadastro, Política, Contrato | Regra fixa (`src/lib/regras/farois.ts`) | Não |
| Resumo e rascunhos | Agente Redator (texto padrão se a IA falhar) | Sim |
| Aprovar | Pessoa com alçada | Não |
| Enviar ao ERP | Tarefa HTTP com Idempotency-Key | Não |

Faróis: 🟢 ok · 🟡 deduzido/atenção (exige "Dar ciência" em cada item) · 🔴 trava · ⚪ não se aplica (só Política). O catálogo completo está em `docs/desenho.md`.

ERP simulado: `/api/v1/{fornecedores,lojas,condicoes}`, com o mesmo contrato do `mock_erp` (10 req/min, ~20% de 503, idempotência). Cada sessão do navegador tem o seu.

## Estrutura

- `src/lib/regras/`: motor de faróis, resolução de nomes e contrato do ERP (código puro, com testes)
- `src/lib/agentes/`: prompts, schemas Zod e chamadas dos 3 agentes (AI SDK + OpenRouter)
- `src/lib/tarefas/`: fila, handlers e agendador
- `src/lib/erp/`: ERP simulado (servidor) e cliente HTTP
- `src/db/`: schema Drizzle (SQLite/libsql) · `drizzle/`: migrações
- `src/app/`: telas e Server Actions

## Documentação (`docs/`)

- `resumo.md` (págs. 1 e 2, para leitura humana) + `entrega-pdf.md` (documento completo, 10 seções e anexos, para leitura por IA): fontes do PDF único de entrega, `docs/entrega.pdf`, gerado por `pnpm gerar-pdf`
- `registro-alteracoes.md`: cada mudança e decisão, com o porquê
- `desenho.md`: funil, faróis e telas · `decisoes-stack.md`: stack e arquitetura
- `pendencias-negocio.md`: dúvidas de negócio · `duvidas-do-caminho.md`: dúvidas que surgiram durante a construção

## Deploy (Fly.io)

`Dockerfile` e `fly.toml` estão prontos (máquina sempre ligada, volume em `/data`). O app ainda não foi implantado.

## Dentro e fora do escopo

Dentro: funil completo, 3 agentes, faróis, aprovação por alçada, envio resiliente ao ERP simulado, novo e-mail colado ou em .eml.
Fora: caixa de entrada real (IMAP), autenticação, envio de e-mail ao fornecedor, ERP real, limpeza de sessões antigas.
