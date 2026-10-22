// Schema SQLite (docs/desenho.md §2). Toda tabela de dados carrega session_id (S18).
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Extracao, Verificacao } from "../lib/agentes/schemas";
import type { ErpCondicao } from "../lib/dominio/dataset";
import type { CampoCondicao, Farol, Proveniencia, Status, TipoCondicao } from "../lib/dominio/tipos";

const agora = () => new Date();
const ts = (nome: string) => integer(nome, { mode: "timestamp_ms" });

export const sessoes = sqliteTable("sessoes", {
  id: text("id").primaryKey(),
  criadaEm: ts("criada_em").notNull().$defaultFn(agora),
  ultimoAcesso: ts("ultimo_acesso").notNull().$defaultFn(agora),
  emailsColados: integer("emails_colados").notNull().default(0),
  // última consulta ao ERP (fornecedores, lojas, condições vigentes) feita por HTTP; reusada por até 60 s
  erpSnapshot: text("erp_snapshot", { mode: "json" }).$type<Record<string, unknown> | null>(),
  erpSnapshotEm: ts("erp_snapshot_em"),
});

export const negociacoes = sqliteTable(
  "negociacoes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id").notNull(),
    status: text("status").$type<Status>().notNull().default("recebido"),
    origem: text("origem").$type<"dataset" | "colado" | "eml" | "gerado">().notNull(),
    chaveDataset: text("chave_dataset"),
    messageId: text("message_id").notNull(),
    remetente: text("remetente").notNull(),
    dominio: text("dominio").notNull().default(""),
    assunto: text("assunto").notNull(),
    recebidoEm: ts("recebido_em").notNull(),
    corpo: text("corpo").notNull(),
    bruto: text("bruto").notNull(),
    anexos: text("anexos", { mode: "json" }).$type<{ nome: string; texto: string }[]>().notNull().default([]),
    leituraAtualId: integer("leitura_atual_id"),
    forcarLeituraIa: integer("forcar_leitura_ia", { mode: "boolean" }).notNull().default(false),
    instrucoesSuspeitas: text("instrucoes_suspeitas", { mode: "json" }).$type<{ trecho: string; motivo: string }[]>().notNull().default([]),
    resumo: text("resumo"),
    rascunhoFornecedor: text("rascunho_fornecedor"),
    memorando: text("memorando"),
    textosOrigem: text("textos_origem").$type<"ia" | "padrao">(),
    conferidos: text("conferidos", { mode: "json" }).$type<{ por: string; em: string; farois: string[] } | null>(), // obsoleto (S31 antigo)
    // ciência por item amarelo: chave "CODIGO#condicaoId" → quando e sobre qual texto do farol (vale enquanto o texto não muda)
    ciencias: text("ciencias", { mode: "json" }).$type<Record<string, { em: string; detalhe: string; por?: string }>>().notNull().default({}),
    motivoSaida: text("motivo_saida"),
    // matrícula de quem recusou/escalou; null = o próprio sistema (ex.: texto suspeito)
    encerradoPor: text("encerrado_por"),
    alertaRevisao: text("alerta_revisao"),
    atualizadoEm: ts("atualizado_em").notNull().$defaultFn(agora),
  },
  (t) => [index("neg_sessao_status").on(t.sessionId, t.status)],
);

export const leituras = sqliteTable("leituras", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  negociacaoId: integer("negociacao_id").notNull(),
  origem: text("origem").$type<"ia" | "cache" | "referencia_manual">().notNull(),
  modeloExtrator: text("modelo_extrator"),
  modeloVerificador: text("modelo_verificador"),
  saidaExtrator: text("saida_extrator", { mode: "json" }).$type<Extracao>().notNull(),
  saidaVerificador: text("saida_verificador", { mode: "json" }).$type<Verificacao | null>(),
  criadaEm: ts("criada_em").notNull().$defaultFn(agora),
});

export const condicoes = sqliteTable("condicoes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  negociacaoId: integer("negociacao_id").notNull(),
  ordem: integer("ordem").notNull(),
  tipo: text("tipo").$type<TipoCondicao>().notNull(),
  titulo: text("titulo").notNull(),
  codFornecedor: text("cod_fornecedor"),
  codCategoria: text("cod_categoria"),
  lojas: text("lojas", { mode: "json" }).$type<string[]>().notNull().default([]),
  percentual: real("percentual"),
  valor: real("valor"),
  dataInicio: text("data_inicio"),
  dataFim: text("data_fim"),
  contrapartida: text("contrapartida").notNull().default(""),
  campanhaSazonal: integer("campanha_sazonal", { mode: "boolean" }).notNull().default(false),
  codCondicaoSubstituida: text("cod_condicao_substituida"),
  proveniencia: text("proveniencia", { mode: "json" }).$type<Partial<Record<CampoCondicao, Proveniencia>>>().notNull().default({}),
  notas: text("notas", { mode: "json" }).$type<string[]>().notNull().default([]),
  aprovador: text("aprovador", { mode: "json" }).$type<{ matricula: string; nome: string; cargo: string } | null>(),
  aprovadaEm: ts("aprovada_em"),
  idempotencyKey: text("idempotency_key"),
  erpCodCondicao: text("erp_cod_condicao"),
  erpResposta: text("erp_resposta", { mode: "json" }).$type<unknown>(),
  enviadaEm: ts("enviada_em"),
});

export const farois = sqliteTable("farois", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  negociacaoId: integer("negociacao_id").notNull(),
  condicaoId: integer("condicao_id"), // null = farol da negociação (LEI-09)
  codigo: text("codigo").notNull(),
  grupo: text("grupo").$type<Farol["grupo"]>().notNull(),
  cor: text("cor").$type<Farol["cor"]>().notNull(),
  titulo: text("titulo").notNull(),
  detalhe: text("detalhe").notNull(),
  ref: text("ref"),
  acao: text("acao").$type<Farol["acao"]>(),
  calculadoEm: ts("calculado_em").notNull().$defaultFn(agora),
});

export type TipoTarefa = "ler_email" | "verificar" | "redigir" | "enviar_erp";

export const tarefas = sqliteTable(
  "tarefas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id").notNull(),
    negociacaoId: integer("negociacao_id").notNull(),
    tipo: text("tipo").$type<TipoTarefa>().notNull(),
    status: text("status").$type<"pendente" | "executando" | "concluida" | "falhou">().notNull().default("pendente"),
    tentativas: integer("tentativas").notNull().default(0),
    proximaEm: ts("proxima_em").notNull().$defaultFn(agora),
    leaseAte: ts("lease_ate"),
    ultimoErro: text("ultimo_erro"),
    criadaEm: ts("criada_em").notNull().$defaultFn(agora),
    atualizadaEm: ts("atualizada_em").notNull().$defaultFn(agora),
  },
  (t) => [index("tarefa_fila").on(t.status, t.proximaEm)],
);

export const tentativas = sqliteTable("tentativas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tarefaId: integer("tarefa_id").notNull(),
  negociacaoId: integer("negociacao_id").notNull(),
  n: integer("n").notNull(),
  inicio: ts("inicio").notNull(),
  fim: ts("fim").notNull(),
  resultado: text("resultado").$type<"ok" | "transitorio" | "permanente">().notNull(),
  httpStatus: integer("http_status"),
  mensagem: text("mensagem").notNull(),
});

// ---------- ERP simulado ----------
export const erpFornecedores = sqliteTable(
  "erp_fornecedores",
  {
    sessionId: text("session_id").notNull(),
    codFornecedor: text("cod_fornecedor").notNull(),
    dados: text("dados", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.codFornecedor] })],
);

export const erpLojas = sqliteTable(
  "erp_lojas",
  {
    sessionId: text("session_id").notNull(),
    codLoja: text("cod_loja").notNull(),
    dados: text("dados", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.codLoja] })],
);

export const erpCondicoes = sqliteTable(
  "erp_condicoes",
  {
    sessionId: text("session_id").notNull(),
    codCondicao: text("cod_condicao").notNull(),
    dados: text("dados", { mode: "json" }).$type<ErpCondicao>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.codCondicao] })],
);

export const erpIdempotencia = sqliteTable(
  "erp_idempotencia",
  {
    sessionId: text("session_id").notNull(),
    chave: text("chave").notNull(),
    resposta: text("resposta", { mode: "json" }).$type<{ status: number; body: unknown }>().notNull(),
    criadaEm: ts("criada_em").notNull().$defaultFn(agora),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.chave] })],
);

export const erpChamadas = sqliteTable(
  "erp_chamadas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id").notNull(),
    em: ts("em").notNull().$defaultFn(agora),
    metodo: text("metodo").notNull(),
    caminho: text("caminho").notNull(),
    status: integer("status").notNull(),
    erro: text("erro"),
  },
  (t) => [index("erp_chamadas_sessao").on(t.sessionId, t.em)],
);

export const lease = sqliteTable("lease", {
  nome: text("nome").primaryKey(),
  dono: text("dono"),
  ate: ts("ate"),
  ultimaRodadaEm: ts("ultima_rodada_em"),
});
