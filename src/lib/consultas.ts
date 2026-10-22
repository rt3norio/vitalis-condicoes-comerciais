// Leituras para as telas (sem efeito colateral).
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { STATUS, type Status } from "./dominio/tipos";

export async function listarNegociacoes(sid: string) {
  const negs = await db.select().from(s.negociacoes).where(eq(s.negociacoes.sessionId, sid)).orderBy(desc(s.negociacoes.recebidoEm));
  const ids = negs.map((n) => n.id);
  const conds = ids.length
    ? await db.select({ id: s.condicoes.id, n: s.condicoes.negociacaoId, ordem: s.condicoes.ordem, aprov: s.condicoes.aprovadaEm }).from(s.condicoes).where(inArray(s.condicoes.negociacaoId, ids)).orderBy(s.condicoes.ordem)
    : [];
  const fs = ids.length
    ? await db
        .select({ n: s.farois.negociacaoId, condicaoId: s.farois.condicaoId, codigo: s.farois.codigo, cor: s.farois.cor, titulo: s.farois.titulo, detalhe: s.farois.detalhe })
        .from(s.farois)
        .where(inArray(s.farois.negociacaoId, ids))
    : [];
  const tarefasAbertas = ids.length
    ? await db
        .select({ n: s.tarefas.negociacaoId, tipo: s.tarefas.tipo, erro: s.tarefas.ultimoErro, prox: s.tarefas.proximaEm, tent: s.tarefas.tentativas })
        .from(s.tarefas)
        .where(and(inArray(s.tarefas.negociacaoId, ids), inArray(s.tarefas.status, ["pendente", "executando"])))
    : [];
  const linhas = negs.map((n) => ({
    ...n,
    nCondicoes: conds.filter((c) => c.n === n.id).length,
    nAprovadas: conds.filter((c) => c.n === n.id && c.aprov).length,
    cores: {
      verde: fs.filter((f) => f.n === n.id && f.cor === "verde").length,
      amarelo: fs.filter((f) => f.n === n.id && f.cor === "amarelo").length,
      vermelho: fs.filter((f) => f.n === n.id && f.cor === "vermelho").length,
    },
    tarefa: tarefasAbertas.find((t) => t.n === n.id) ?? null,
    faixas: conds.filter((c) => c.n === n.id).map((c) => fs.filter((f) => f.condicaoId === c.id)),
  }));
  const contagem = Object.fromEntries(STATUS.map((st) => [st, negs.filter((n) => n.status === st).length])) as Record<Status, number>;
  return { linhas, contagem, total: negs.length };
}

export async function usoErpUltimoMinuto(sid: string) {
  const r = await db
    .select({ st: s.erpChamadas.status })
    .from(s.erpChamadas)
    .where(and(eq(s.erpChamadas.sessionId, sid), gt(s.erpChamadas.em, new Date(Date.now() - 60_000))));
  return r.filter((x) => x.st !== 429).length;
}

export async function linhaDoTempo(negId: number) {
  const ts = await db.select().from(s.tentativas).where(eq(s.tentativas.negociacaoId, negId)).orderBy(desc(s.tentativas.inicio));
  const tarefas = await db.select().from(s.tarefas).where(eq(s.tarefas.negociacaoId, negId));
  const evs = await db.select().from(s.eventos).where(eq(s.eventos.negociacaoId, negId)).orderBy(desc(s.eventos.em));
  // uma lista só, mais recente primeiro: tarefas do sistema + ações de pessoas
  const itens = [
    ...ts.map((t) => ({ chave: `t${t.id}`, em: t.inicio, quem: "Sistema", cor: t.resultado === "ok" ? "verde" : t.resultado === "transitorio" ? "amarelo" : "vermelho", tarefa: tarefas.find((x) => x.id === t.tarefaId)?.tipo ?? "?", n: t.n, http: t.httpStatus, texto: t.mensagem })),
    ...evs.map((e) => ({ chave: `e${e.id}`, em: e.em, quem: e.por, cor: "pessoa", tarefa: null, n: null, http: null, texto: e.descricao })),
  ].sort((x, y) => y.em.getTime() - x.em.getTime());
  return { tentativas: ts.map((t) => ({ ...t, tipo: tarefas.find((x) => x.id === t.tarefaId)?.tipo ?? "?" })), tarefas, itens };
}

export async function estadoErp(sid: string) {
  const conds = (await db.select().from(s.erpCondicoes).where(eq(s.erpCondicoes.sessionId, sid))).map((r) => r.dados).sort((a, b) => a.cod_condicao.localeCompare(b.cod_condicao));
  const chamadas = await db.select().from(s.erpChamadas).where(eq(s.erpChamadas.sessionId, sid)).orderBy(desc(s.erpChamadas.em)).limit(40);
  return { conds, chamadas };
}
