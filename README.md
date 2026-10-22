# Vitalis · Condições comerciais

Protótipo do case AI Builder (Pareto): e-mail do fornecedor → agentes de IA → conferência humana → condição gravada no ERP.

## Rodar local

```bash
pnpm install
cp .env.example .env.local   # opcional: OPENROUTER_API_KEY para a IA rodar de verdade
pnpm dev                     # http://localhost:3000
pnpm test                    # faróis (Cadastro/Política) e contrato do ERP
```

Banco: SQLite em `.data/app.db` (criado e migrado sozinho). Sem chave de IA, os 4 e-mails do dataset usam uma leitura de referência feita à mão, rotulada assim na tela.

Com chave, gere o cache real da IA para os 4 e-mails: `pnpm gerar-cache-ia` (grava `data/leituras-ia-cache.json`, já incluído no repositório). Reiniciar a demo usa esse cache e não chama a IA.

E-mails de teste: `pnpm gerar-exemplos 6` escreve e-mails fictícios em `data/exemplos/` (para colar/subir pela tela) e mostra como cada um seria lido. Na tela, o botão **Gerar novos e-mails (IA)** faz o mesmo direto no funil.

## Como funciona

Cada e-mail é uma **negociação** que passa por um funil. Toda etapa é uma **tarefa** gravada no banco e executada em segundo plano por um agendador (a cada 60 s, ou "Processar agora"). Falha transitória (IA fora, ERP 503/429) fica registrada e tenta de novo na próxima rodada.

```
Recebido ──ler_email──▶ Verificação ──verificar──▶ Revisão humana ──aprovar──▶ Aguardando envio ──enviar_erp──▶ Enviado
                                  └─ instrução suspeita ─▶ Escalado        └─ recusar / escalar
```

| Etapa | Quem faz | IA? |
|---|---|---|
| Ler e-mail | Agente Extrator: campos + trecho de origem + certeza | Sim |
| Nome → código do ERP | Regra fixa (`src/lib/regras/resolver.ts`) | Não |
| Conferir leitura | Agente Verificador, independente | Sim |
| Faróis de Cadastro, Política, Contrato | Regra fixa (`src/lib/regras/farois.ts`) | Não |
| Resumo e rascunhos | Agente Redator (texto padrão se a IA falhar) | Sim |
| Aprovar | Pessoa com alçada | Não |
| Enviar ao ERP | Tarefa HTTP com Idempotency-Key | Não |

Faróis: 🟢 ok · 🟡 deduzido/atenção (exige "Dar ciência" em cada item) · 🔴 trava · ⚪ não se aplica (só Política). Catálogo em `docs/desenho.md`.

ERP simulado: `/api/v1/{fornecedores,lojas,condicoes}`, mesmo contrato do `mock_erp` (10 req/min, ~20% de 503, idempotência). Cada sessão do navegador tem o seu.

## Estrutura

- `src/lib/regras/` motor de faróis, resolução de nomes, contrato do ERP (puro, testado)
- `src/lib/agentes/` prompts, schemas Zod e chamadas dos 3 agentes (AI SDK + OpenRouter)
- `src/lib/tarefas/` fila, handlers e agendador
- `src/lib/erp/` ERP simulado (servidor) e cliente HTTP
- `src/db/` schema Drizzle (SQLite/libsql) · `drizzle/` migrações
- `src/app/` telas e Server Actions

## Documentação (`docs/`)

- `entrega-pdf.md` rascunho do PDF de entrega (10 seções)
- `registro-alteracoes.md` toda mudança e decisão, com o porquê
- `desenho.md` funil, faróis, telas · `decisoes-stack.md` stack e arquitetura
- `pendencias-negocio.md` dúvidas de negócio · `duvidas-do-caminho.md` dúvidas surgidas na construção

## Deploy (Fly.io)

Preparado em `Dockerfile` e `fly.toml` (máquina sempre ligada, volume em `/data`). Ainda não implantado.

## Dentro e fora do escopo

Dentro: funil completo, 3 agentes, faróis, aprovação por alçada, envio resiliente ao ERP simulado, novo e-mail colado/.eml.
Fora: caixa de entrada real (IMAP), autenticação, envio de e-mail ao fornecedor, ERP real, limpeza de sessões antigas.
