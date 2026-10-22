# Decisões de stack

| # | Tema | Decisão | Status |
|---|------|---------|--------|
| S1 | Framework | Next.js, App Router + TypeScript | Decidido |
| S2 | UI | Tailwind + shadcn/ui | Decidido |
| S3 | ERP simulado | Route Handlers (`/api/erp/*`) com estado em tabela no banco, isolado por sessão | Decidido |
| S4 | Banco | SQLite em volume persistente do Fly (uma máquina) | Decidido (substitui Neon/Vercel) |
| S5 | ORM | Drizzle | Decidido |
| S6 | Protótipo `app/` (JS puro) | Só referência; não copiar código | Decidido |
| S7 | Agentes | Extrator + Verificador + Redator. Política, alçada e gravação no ERP ficam sem IA | Decidido |
| S8 | Modelos | GLM nos 3 agentes por enquanto (`z-ai/glm-5.3`), configurável por agente via `MODEL_*` | Decidido |
| S9 | Provedor LLM | OpenRouter | Decidido |
| S10 | Leitura dos 4 e-mails na demo | Rodar os agentes de verdade uma vez e salvar a saída como cache; botão para reler ao vivo | Decidido |
| S11 | Hospedagem | Fly.io (sai Vercel). Deploy só quando o usuário mandar | Decidido |
| S12 | Integração LLM | Vercel AI SDK + provider OpenRouter + Zod (`generateObject`) | Decidido |
| S13 | Testes | Vitest no motor de regras e no contrato do ERP | Decidido |
| S14 | Versionamento / CI | Git + GitHub, sem CI | Decidido |
| S15 | Pacotes | pnpm | Decidido |
| S16 | Node | 24.x LTS, fixado em `package.json` / `.nvmrc` | Decidido |
| S17 | Repositório | GitHub privado: https://github.com/rt3norio/vitalis-condicoes-comerciais (pasta `web/`, branch `main`) | Decidido |
| S18 | Isolamento do ERP | Cookie anônimo de sessão; tabelas com `session_id`, semeadas com a captura de 30/09; botão "reiniciar demo" | Decidido |
| S19 | Envio ao ERP | Assíncrono. O estado fica no banco (enviado?, quando, tentativas, última/próxima tentativa, erro, `Idempotency-Key`, resposta). Um processo periódico pega os pendentes, tenta, registra a falha e tenta de novo na execução seguinte | Decidido |
| S20 | Agendador | Timer de 60 s dentro do processo do Next, iniciado em `instrumentation.ts`, chamando `processarEnvios()`. Uma trava (lease) no banco evita execução dupla. Máquina Fly sempre ligada (`auto_stop_machines = "off"`) | Decidido |
| S22 | Modelo de execução | Tudo é tarefa: independente, autônoma, tratada como falhável e executada em background pelo agendador, sem disparo imediato, porque o tempo não é crítico. Funil de status: 1 Recebido → 2 Verificação → 3 Revisão humana (opcional) → 4 Aguardando envio → 5 Enviado | Decidido (detalhes do funil em revisão) |
| S23 | Revisão humana | Obrigatória para todo item. Saídas: aprovar (→ Aguardando envio), recusar, escalar à Diretoria | Decidido |
| S24 | Interface | Uma tabela única, sem kanban; um botão por status (com contagem) filtra essa mesma tabela. Cada requisito é definido, identificado e tem um marcador de semáforo (verde, amarelo, vermelho) para o operador decidir de relance. Não há cinza: o requisito que não se aplica ao tipo da condição não aparece (ex.: §7, contrapartida só em verba) | Decidido |
| S25 | Condições do mesmo e-mail | Premissa (pendência de negócio P11): são vinculadas. Só sobem juntas, depois que todas forem aprovadas | Premissa (confirmar com a área) |
| S26 | Linha da tabela | Negociação (1 e-mail = 1 pacote). A linha expande para as condições, cada uma com seus marcadores. O status da linha é o da condição mais atrasada | Decidido |
| S27 | Falhas no envio | Erro transitório (503, 429, timeout): tenta de novo na rodada seguinte, sem limite, respeitando `Retry-After`. Erro permanente (400, 422): para. Antes do 1º POST do pacote, reconfere todas as condições (schema, fornecedor ativo, sobreposição via `GET /condicoes` ao vivo); se alguma falhar, nada é enviado e o pacote volta à revisão. Se mesmo assim o envio ficar parcial, o pacote volta à revisão marcado "gravado parcialmente", e a condição já gravada nunca é reenviada | Decidido |
| S28 | Primeira visita | Uma sessão nova semeia os 4 e-mails em "Recebido". Aviso "processamento roda a cada minuto; próxima rodada em m:ss" e botão "processar agora", que só antecipa a mesma rodada do agendador | Decidido |
| S29 | Entrada de e-mail novo | Botão "Novo e-mail": colar texto ou subir `.eml` (+ anexo opcional). Cria uma linha em "Recebido", com leitura sempre ao vivo. Há limite de tamanho e de quantidade por sessão. Caixa de entrada real (IMAP) fica para a fase 2 | Decidido |
| S30 | Cliente do ERP | A tarefa de envio chama o ERP simulado por HTTP de verdade (`fetch` para `ERP_BASE_URL/api/v1/...`, headers e códigos do contrato). O módulo cliente é isolado; trocar para o ERP real é trocar a base URL e a autenticação. O limite de 10 req/min é contado por sessão (cada sessão = um cliente) | Decidido |
| S31 | Semântica do semáforo | 🟢 escrito no e-mail / regra atendida. 🟡 deduzido ou atenção (categoria inferida, loja mapeada por nome, fim sugerido, ERP mudou após o extrato). 🔴 viola regra ou falta dado, e sempre trava. Amarelo não trava sozinho, mas cada item amarelo exige "Dar ciência" (botão por item) antes de aprovar; a ciência vale para o texto do item e cai se uma edição o mudar. *Substituiu em 22/10 a caixa única "Conferi os N itens" (registro-alteracoes D8).* | Decidido (revisado) |
| S32 | Grupos de requisitos e faróis | Leitura (IA: Extrator + Verificador): farol por campo. Cadastro (regra fixa vs ERP): farol por item, com 🟢 encontrado exato, 🟡 inferido (ex.: nome → código) e 🔴 não encontrado no ERP. Política (regra fixa, POL-COM-004): um farol por regra (§4, §5, §6, §7, §8, §9, §10), e aqui o cinza é permitido para o que não se aplica (ex.: §7 em desconto). Contrato ERP (regra fixa, schema). O Redator não pinta farol, e a IA nunca opina sobre política ou alçada | Decidido (grupos/donos assumidos da opção A, sem objeção) |
| S33 | Instrução suspeita no e-mail | 🔴 no grupo Leitura ("e-mail contém instrução dirigida ao sistema"). Não há liberação na tela: a negociação vai direto para "Escalado". A defesa estrutural continua (IA sem campo de status/aprovação; payload montado por código; aprovação humana obrigatória). A condição morre e só segue com um novo contato do fornecedor, como e-mail novo (D18, validar com negócio) | Decidido |
| S34 | Histórico | Linha do tempo por negociação: cada tarefa e tentativa (o quê, quando, nº, resultado, erro), lida da tabela de tentativas | Premissa (vetável) |
| S35 | Redator | Gera o resumo da negociação, o rascunho de resposta ao fornecedor e o memorando à Diretoria (quando escala). A pessoa só copia; nada é enviado por e-mail | Premissa (vetável) |
| S36 | Cache da IA | A tarefa de leitura dos 4 e-mails do dataset usa a saída real salva; "reler ao vivo" cria uma nova tarefa | Premissa (vetável) |
| S37 | Escopo dos testes | Vitest só em faróis de Cadastro/Política e no contrato do ERP | Premissa (vetável) |
| S38 | PDF e vídeo | Bloco 4, após 15h de 22/10; seções 01 a 05 do PDF escritas em paralelo ao código | Premissa (vetável) |
| S21 | Driver SQLite | `@libsql/client` (`drizzle-orm/libsql`), arquivo `file:` no volume. Sem compilação nativa | Decidido |

## Descartado

- Vercel (hospedagem, Neon via Marketplace, Cron, Workflows, Queues): o plano Hobby só tem cron diário, e a complexidade não compensa.
