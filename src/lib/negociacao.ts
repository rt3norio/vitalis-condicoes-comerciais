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

type Recurso = "fornecedores" | "lojas" | "condicoes";
type SnapshotGuardado = Omit<Snapshot, "em"> & { em?: Partial<Record<Recurso, string>> };

// Cadastros quase não mudam; condições vigentes mudam a qualquer hora
const VALIDADE_MS: Record<Recurso, number> = { fornecedores: 10 * 60_000, lojas: 10 * 60_000, condicoes: 60_000 };

// Consulta ao ERP por HTTP (S30). Cada recurso que deu certo fica salvo na hora: se o próximo falhar (503),
// a nova tentativa só busca o que falta. `forcar` ignora a validade (reconferência antes do envio).
export async function obterSnapshot(sid: string, forcar: Recurso[] = []): Promise<Snapshot> {
  const sess = await db.select().from(s.sessoes).where(eq(s.sessoes.id, sid)).get();
  const atual: SnapshotGuardado = (sess?.erpSnapshot as SnapshotGuardado | null) ?? { fornecedores: [], lojas: [], condicoes: [], em: {} };
  atual.em ??= {};
  const agora = Date.now();
  for (const r of ["fornecedores", "lojas", "condicoes"] as const) {
    const quando = atual.em[r] ? new Date(atual.em[r]!).getTime() : 0;
    if (!forcar.includes(r) && agora - quando < VALIDADE_MS[r]) continue;
    const resp = r === "fornecedores" ? await erp.fornecedores(sid) : r === "lojas" ? await erp.lojas(sid) : await erp.condicoesVigentes(sid);
    if (resp.status !== 200) {
      const e = resp.body as { error?: string; message?: string };
      throw new FalhaErp(`GET /${r}: ${resp.status} ${e?.error ?? ""} ${e?.message ?? ""}`.trim(), resp.status, resp.retryAfter);
    }
    (atual as Record<string, unknown>)[r] = (resp.body as { itens: unknown[] }).itens;
    atual.em[r] = new Date().toISOString();
    await db.update(s.sessoes).set({ erpSnapshot: atual, erpSnapshotEm: new Date() }).where(eq(s.sessoes.id, sid));
  }
  return { fornecedores: atual.fornecedores, lojas: atual.lojas, condicoes: atual.condicoes, em: new Date(atual.em.condicoes ?? Date.now()) };
}

// Última consulta, sem chamar o ERP (para telas)
export async function snapshotSalvo(sid: string): Promise<Snapshot | null> {
  const sess = await db.select().from(s.sessoes).where(eq(s.sessoes.id, sid)).get();
  const g = sess?.erpSnapshot as SnapshotGuardado | null | undefined;
  if (!g || !g.em?.condicoes || !g.em?.fornecedores || !g.em?.lojas) return null;
  return { fornecedores: g.fornecedores, lojas: g.lojas, condicoes: g.condicoes, em: new Date(g.em.condicoes) };
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
