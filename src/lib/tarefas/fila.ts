// Fila de tarefas (S19, S22). Toda operação é uma tarefa independente e falhável. Uma rodada pega as
// pendentes cujo horário chegou, executa, registra a tentativa e agenda a próxima se a falha for transitória.
import { and, eq, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { db, garantirMigracao, schema as s } from "@/db";
import type { TipoTarefa } from "@/db/schema";

export class Transitoria extends Error {
  constructor(
    msg: string,
    public esperarSeg: number | null = null,
    public httpStatus: number | null = null,
  ) {
    super(msg);
  }
}
export class Permanente extends Error {
  constructor(
    msg: string,
    public httpStatus: number | null = null,
  ) {
    super(msg);
  }
}

export type Tarefa = typeof s.tarefas.$inferSelect;
export type Resultado = { mensagem: string; httpStatus?: number | null };
type Handler = (t: Tarefa) => Promise<Resultado>;

const INTERVALO_RODADA_MS = 60_000;

export async function enfileirar(sessionId: string, negociacaoId: number, tipo: TipoTarefa) {
  // não duplica tarefa igual ainda aberta
  const aberta = await db
    .select({ id: s.tarefas.id })
    .from(s.tarefas)
    .where(and(eq(s.tarefas.negociacaoId, negociacaoId), eq(s.tarefas.tipo, tipo), inArray(s.tarefas.status, ["pendente", "executando"])))
    .get();
  if (aberta) return aberta.id;
  const [t] = await db.insert(s.tarefas).values({ sessionId, negociacaoId, tipo }).returning({ id: s.tarefas.id });
  return t.id;
}

// Trava da rodada (S20): impede duas rodadas simultâneas (timer + "processar agora", ou recarga em dev)
async function pegarLease(dono: string, duracaoMs: number) {
  const agora = new Date();
  await db.insert(s.lease).values({ nome: "rodada" }).onConflictDoNothing();
  const r = await db
    .update(s.lease)
    .set({ dono, ate: new Date(agora.getTime() + duracaoMs) })
    .where(and(eq(s.lease.nome, "rodada"), or(isNull(s.lease.ate), lt(s.lease.ate, agora))))
    .returning({ nome: s.lease.nome });
  return r.length > 0;
}
async function soltarLease(dono: string) {
  await db.update(s.lease).set({ ate: null, ultimaRodadaEm: new Date() }).where(and(eq(s.lease.nome, "rodada"), eq(s.lease.dono, dono)));
}

export async function proximaRodadaEm(): Promise<Date | null> {
  const l = await db.select().from(s.lease).where(eq(s.lease.nome, "rodada")).get();
  return l?.ultimaRodadaEm ? new Date(l.ultimaRodadaEm.getTime() + INTERVALO_RODADA_MS) : null;
}

export async function rodada(handlers: Record<TipoTarefa, Handler>, opts: { sessionId?: string; limite?: number } = {}) {
  await garantirMigracao();
  const dono = crypto.randomUUID();
  if (!(await pegarLease(dono, 5 * 60_000))) return { executadas: 0, ocupada: true };
  let executadas = 0;
  try {
    // até 4 passadas: uma tarefa criada nesta rodada (ex.: verificar depois de ler) já roda nela
    for (let passada = 0; passada < 4; passada++) {
      const agora = new Date();
      const filtros = [
        or(eq(s.tarefas.status, "pendente"), and(eq(s.tarefas.status, "executando"), lt(s.tarefas.leaseAte, agora))),
        lte(s.tarefas.proximaEm, agora),
      ];
      if (opts.sessionId) filtros.push(eq(s.tarefas.sessionId, opts.sessionId));
      const fila = await db
        .select()
        .from(s.tarefas)
        .where(and(...filtros))
        .orderBy(s.tarefas.proximaEm, s.tarefas.id)
        .limit(opts.limite ?? 30);
      if (!fila.length) break;
      for (const t of fila) {
        await executar(t, handlers[t.tipo]);
        executadas++;
      }
    }
  } finally {
    await soltarLease(dono);
  }
  return { executadas, ocupada: false };
}

async function executar(t: Tarefa, handler: Handler) {
  const inicio = new Date();
  const n = t.tentativas + 1;
  await db.update(s.tarefas).set({ status: "executando", leaseAte: new Date(Date.now() + 3 * 60_000), tentativas: n, atualizadaEm: inicio }).where(eq(s.tarefas.id, t.id));
  const registrar = (resultado: "ok" | "transitorio" | "permanente", mensagem: string, httpStatus: number | null = null) =>
    db.insert(s.tentativas).values({ tarefaId: t.id, negociacaoId: t.negociacaoId, n, inicio, fim: new Date(), resultado, httpStatus, mensagem });
  try {
    const r = await handler({ ...t, tentativas: n });
    await registrar("ok", r.mensagem, r.httpStatus ?? null);
    await db.update(s.tarefas).set({ status: "concluida", leaseAte: null, ultimoErro: null, atualizadaEm: new Date() }).where(eq(s.tarefas.id, t.id));
  } catch (e) {
    if (e instanceof Permanente) {
      await registrar("permanente", e.message, e.httpStatus);
      await db.update(s.tarefas).set({ status: "falhou", leaseAte: null, ultimoErro: e.message, atualizadaEm: new Date() }).where(eq(s.tarefas.id, t.id));
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    const esperar = e instanceof Transitoria && e.esperarSeg ? e.esperarSeg * 1000 : INTERVALO_RODADA_MS;
    await registrar("transitorio", msg, e instanceof Transitoria ? e.httpStatus : null);
    await db
      .update(s.tarefas)
      .set({ status: "pendente", leaseAte: null, ultimoErro: msg, proximaEm: new Date(Date.now() + esperar), atualizadaEm: new Date() })
      .where(eq(s.tarefas.id, t.id));
  }
}
