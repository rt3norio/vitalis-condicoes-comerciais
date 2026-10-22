// Carrega uma negociação com suas condições e recalcula faróis. Usado pelas tarefas e pelas telas.
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { ErpCondicao, ErpFornecedor, ErpLoja } from "./dominio/dataset";
import { extrato } from "./dominio/dataset";
import { hoje } from "./dominio/datas";
import type { Categoria, ChecagemVerificador, Condicao, Farol } from "./dominio/tipos";
import { erp } from "./erp/cliente";
import { calcularFarois, farolInstrucaoSuspeita, type ContextoFarois } from "./regras/farois";

export type LinhaCondicao = typeof s.condicoes.$inferSelect;
export type LinhaNegociacao = typeof s.negociacoes.$inferSelect;

export const paraCondicao = (r: LinhaCondicao): Condicao => ({
  id: r.id,
  ordem: r.ordem,
  tipo: r.tipo,
  titulo: r.titulo,
  codFornecedor: r.codFornecedor,
  codCategoria: r.codCategoria as Categoria | null,
  lojas: r.lojas,
  percentual: r.percentual,
  valor: r.valor,
  dataInicio: r.dataInicio,
  dataFim: r.dataFim,
  contrapartida: r.contrapartida,
  campanhaSazonal: r.campanhaSazonal,
  codCondicaoSubstituida: r.codCondicaoSubstituida,
  proveniencia: r.proveniencia,
  notas: r.notas,
});

export type Snapshot = { fornecedores: ErpFornecedor[]; lojas: ErpLoja[]; condicoes: ErpCondicao[]; em: Date };

export class FalhaErp extends Error {
  constructor(
    msg: string,
    public status: number,
    public retryAfter: number | null,
  ) {
    super(msg);
  }
}

// Consulta ao ERP por HTTP (S30). Reusa a última consulta da sessão por até `maxIdadeMs`.
export async function obterSnapshot(sid: string, maxIdadeMs = 60_000, forcar: ("condicoes" | "fornecedores")[] = []): Promise<Snapshot> {
  const sess = await db.select().from(s.sessoes).where(eq(s.sessoes.id, sid)).get();
  const atual = sess?.erpSnapshot as Omit<Snapshot, "em"> | null | undefined;
  const fresco = atual && sess?.erpSnapshotEm && Date.now() - sess.erpSnapshotEm.getTime() < maxIdadeMs;
  if (atual && fresco && !forcar.length) return { ...atual, em: sess!.erpSnapshotEm! };

  const precisa = atual && fresco ? forcar : (["fornecedores", "lojas", "condicoes"] as const);
  const novo = { fornecedores: atual?.fornecedores ?? [], lojas: atual?.lojas ?? [], condicoes: atual?.condicoes ?? [] } as Omit<Snapshot, "em">;
  for (const r of precisa) {
    const resp = r === "fornecedores" ? await erp.fornecedores(sid) : r === "lojas" ? await erp.lojas(sid) : await erp.condicoesVigentes(sid);
    if (resp.status !== 200) {
      const e = resp.body as { error?: string; message?: string };
      throw new FalhaErp(`GET /${r}: ${resp.status} ${e?.error ?? ""} ${e?.message ?? ""}`.trim(), resp.status, resp.retryAfter);
    }
    (novo as Record<string, unknown>)[r] = (resp.body as { itens: unknown[] }).itens;
  }
  const em = new Date();
  await db.update(s.sessoes).set({ erpSnapshot: novo, erpSnapshotEm: em }).where(eq(s.sessoes.id, sid));
  return { ...novo, em };
}

// Última consulta, sem chamar o ERP (para telas)
export async function snapshotSalvo(sid: string): Promise<Snapshot | null> {
  const sess = await db.select().from(s.sessoes).where(eq(s.sessoes.id, sid)).get();
  if (!sess?.erpSnapshot || !sess.erpSnapshotEm) return null;
  return { ...(sess.erpSnapshot as Omit<Snapshot, "em">), em: sess.erpSnapshotEm };
}

export async function carregar(sid: string, negId: number) {
  const neg = await db.select().from(s.negociacoes).where(and(eq(s.negociacoes.id, negId), eq(s.negociacoes.sessionId, sid))).get();
  if (!neg) return null;
  const conds = await db.select().from(s.condicoes).where(eq(s.condicoes.negociacaoId, negId)).orderBy(s.condicoes.ordem);
  const leitura = neg.leituraAtualId ? await db.select().from(s.leituras).where(eq(s.leituras.id, neg.leituraAtualId)).get() : undefined;
  const fs = await db.select().from(s.farois).where(eq(s.farois.negociacaoId, negId));
  return { neg, conds, leitura, farois: fs };
}

export function contexto(neg: LinhaNegociacao, snap: Snapshot, irmas: Condicao[], verificador: ChecagemVerificador[] | null): ContextoFarois {
  return {
    fornecedores: snap.fornecedores,
    lojas: snap.lojas,
    condicoesErp: snap.condicoes,
    extrato,
    hoje: hoje(),
    dominioRemetente: neg.dominio,
    origemRef: neg.messageId,
    irmas,
    verificador,
  };
}

// Recalcula e grava os faróis da negociação. Determinístico: pode rodar a qualquer momento.
export async function recalcularFarois(sid: string, negId: number, snap?: Snapshot): Promise<{ porCondicao: Map<number, Farol[]>; negociacao: Farol[] }> {
  const dados = await carregar(sid, negId);
  if (!dados) throw new Error(`negociação ${negId} não encontrada`);
  const snapshot = snap ?? (await snapshotSalvo(sid)) ?? (await obterSnapshot(sid));
  const irmas = dados.conds.map(paraCondicao);
  const verif = dados.leitura?.saidaVerificador ? (dados.leitura.saidaVerificador.checagens as ChecagemVerificador[]) : null;
  const ctx = contexto(dados.neg, snapshot, irmas, verif);
  const porCondicao = new Map<number, Farol[]>();
  const linhas: (typeof s.farois.$inferInsert)[] = [];
  for (const c of irmas) {
    const fs = calcularFarois(c, ctx);
    porCondicao.set(c.id, fs);
    for (const f of fs) linhas.push({ negociacaoId: negId, condicaoId: c.id, ...f, ref: f.ref ?? null, acao: f.acao ?? null });
  }
  const negFarois = [farolInstrucaoSuspeita(dados.neg.instrucoesSuspeitas)];
  for (const f of negFarois) linhas.push({ negociacaoId: negId, condicaoId: null, ...f, ref: f.ref ?? null, acao: f.acao ?? null });
  await db.delete(s.farois).where(eq(s.farois.negociacaoId, negId));
  if (linhas.length) await db.insert(s.farois).values(linhas);
  return { porCondicao, negociacao: negFarois };
}
