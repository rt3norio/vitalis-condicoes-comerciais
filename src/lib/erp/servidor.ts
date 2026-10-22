// ERP simulado: reproduz o contrato de data/dataset/mock_erp/README.md. Estado por sessão no SQLite.
// Comportamento do ambiente: 10 req/min por cliente (somando endpoints) e ~1 em 5 chamadas com 503.
import { and, eq, gt } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { addDias } from "../dominio/datas";
import type { ErpCondicao } from "../dominio/dataset";
import { validarPayload } from "../regras/contrato-erp";

const LIMITE_POR_MINUTO = 10;
const JANELA_MS = 60_000;
const instabilidade = () => Number(process.env.ERP_INSTABILIDADE ?? "0.2");

export type RespostaErp = { status: number; body: unknown; headers?: Record<string, string> };

const erro = (status: number, error: string, message: string, extra: Record<string, unknown> = {}): RespostaErp => ({
  status,
  body: { error, message, ...extra },
});

async function registrar(sid: string, metodo: string, caminho: string, r: RespostaErp) {
  const e = (r.body as { error?: string } | null)?.error ?? null;
  await db.insert(s.erpChamadas).values({ sessionId: sid, metodo, caminho, status: r.status, erro: e });
  return r;
}

// Limite por janela deslizante. 429 não conta para a janela.
async function verificarLimite(sid: string): Promise<RespostaErp | null> {
  const desde = new Date(Date.now() - JANELA_MS);
  const chamadas = await db
    .select({ em: s.erpChamadas.em, status: s.erpChamadas.status })
    .from(s.erpChamadas)
    .where(and(eq(s.erpChamadas.sessionId, sid), gt(s.erpChamadas.em, desde)))
    .orderBy(s.erpChamadas.em);
  const validas = chamadas.filter((c) => c.status !== 429);
  if (validas.length < LIMITE_POR_MINUTO) return null;
  const retry = Math.max(1, Math.ceil((validas[0].em.getTime() + JANELA_MS - Date.now()) / 1000));
  return { ...erro(429, "RATE_LIMIT_EXCEEDED", "Limite de requisições excedido"), headers: { "Retry-After": String(retry) } };
}

async function porta(sid: string, metodo: string, caminho: string): Promise<RespostaErp | null> {
  const lim = await verificarLimite(sid);
  if (lim) return registrar(sid, metodo, caminho, lim);
  if (Math.random() < instabilidade()) return registrar(sid, metodo, caminho, erro(503, "SERVICE_UNAVAILABLE", "Sistema em manutenção"));
  return null;
}

export async function erpGet(sid: string, recurso: "fornecedores" | "lojas" | "condicoes", status?: string | null): Promise<RespostaErp> {
  const caminho = `/${recurso}${status ? `?status=${status}` : ""}`;
  const bloqueio = await porta(sid, "GET", caminho);
  if (bloqueio) return bloqueio;
  const consultado_em = new Date().toISOString();
  let itens: unknown[];
  if (recurso === "fornecedores") itens = (await db.select().from(s.erpFornecedores).where(eq(s.erpFornecedores.sessionId, sid))).map((r) => r.dados);
  else if (recurso === "lojas") itens = (await db.select().from(s.erpLojas).where(eq(s.erpLojas.sessionId, sid))).map((r) => r.dados);
  else
    itens = (await db.select().from(s.erpCondicoes).where(eq(s.erpCondicoes.sessionId, sid)))
      .map((r) => r.dados)
      .filter((c) => !status || c.status === status);
  return registrar(sid, "GET", caminho, { status: 200, body: { consultado_em, ...(status ? { filtro: { status } } : {}), total: itens.length, itens } });
}

export async function erpPostCondicao(sid: string, idempotencyKey: string | null, body: unknown): Promise<RespostaErp> {
  const caminho = "/condicoes";
  const bloqueio = await porta(sid, "POST", caminho);
  if (bloqueio) return bloqueio;
  if (!idempotencyKey) return registrar(sid, "POST", caminho, erro(400, "MISSING_IDEMPOTENCY_KEY", "Header Idempotency-Key é obrigatório"));

  const anterior = await db
    .select()
    .from(s.erpIdempotencia)
    .where(and(eq(s.erpIdempotencia.sessionId, sid), eq(s.erpIdempotencia.chave, idempotencyKey)))
    .get();
  if (anterior && Date.now() - anterior.criadaEm.getTime() < 24 * 3600_000) return registrar(sid, "POST", caminho, anterior.resposta);

  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const lojas = new Set((await db.select({ c: s.erpLojas.codLoja }).from(s.erpLojas).where(eq(s.erpLojas.sessionId, sid))).map((r) => r.c));
  const erros = validarPayload(b, lojas);
  let resp: RespostaErp;
  if (erros.length) resp = erro(422, "VALIDATION_ERROR", "Payload inválido", { campos: erros });
  else {
    const forn = await db
      .select()
      .from(s.erpFornecedores)
      .where(and(eq(s.erpFornecedores.sessionId, sid), eq(s.erpFornecedores.codFornecedor, String(b.cod_fornecedor))))
      .get();
    if (!forn || (forn.dados as { status?: string }).status !== "ATIVO") resp = erro(422, "SUPPLIER_NOT_ACTIVE", "Fornecedor não possui cadastro ativo");
    else resp = await gravar(sid, b);
  }
  await db.insert(s.erpIdempotencia).values({ sessionId: sid, chave: idempotencyKey, resposta: { status: resp.status, body: resp.body } }).onConflictDoNothing();
  return registrar(sid, "POST", caminho, resp);
}

async function gravar(sid: string, b: Record<string, unknown>): Promise<RespostaErp> {
  const existentes = await db.select({ c: s.erpCondicoes.codCondicao, d: s.erpCondicoes.dados }).from(s.erpCondicoes).where(eq(s.erpCondicoes.sessionId, sid));
  const maior = Math.max(10, ...existentes.map((e) => Number(e.c.slice(5)) || 0));
  const cod = `COND-${String(maior + 1).padStart(3, "0")}`;
  const agora = new Date().toISOString();
  const nova: ErpCondicao = {
    cod_condicao: cod,
    cod_fornecedor: String(b.cod_fornecedor),
    cod_categoria: String(b.cod_categoria),
    tipo: b.tipo as ErpCondicao["tipo"],
    lojas: b.lojas as string[],
    data_inicio: String(b.data_inicio),
    data_fim: String(b.data_fim),
    status: "VIGENTE",
    criado_em: agora,
    ultima_alteracao: agora,
    ...(b.percentual != null ? { percentual: Number(b.percentual) } : { valor: Number(b.valor) }),
    ...(b.contrapartida ? { contrapartida: String(b.contrapartida) } : {}),
  };
  await db.insert(s.erpCondicoes).values({ sessionId: sid, codCondicao: cod, dados: nova });
  if (b.cod_condicao_substituida) {
    const velha = existentes.find((e) => e.c === b.cod_condicao_substituida);
    if (velha) {
      const d = { ...velha.d, data_fim: addDias(String(b.data_inicio), -1), ultima_alteracao: agora, alterado_por: "API" };
      if (d.data_fim < d.data_inicio) d.status = "ENCERRADA";
      await db.update(s.erpCondicoes).set({ dados: d }).where(and(eq(s.erpCondicoes.sessionId, sid), eq(s.erpCondicoes.codCondicao, velha.c)));
    }
  }
  return { status: 201, body: { cod_condicao: cod, status: "VIGENTE", criado_em: agora } };
}
