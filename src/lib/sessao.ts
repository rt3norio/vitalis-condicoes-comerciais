// Sessão anônima por cookie (S18). Cada sessão tem seu ERP simulado e sua caixa com os 4 e-mails.
import { eq, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, garantirMigracao, schema as s } from "@/db";
import { capturaErp, emailsDataset } from "./dominio/dataset";

export const COOKIE_SESSAO = "vitalis_sid";

export async function sessaoAtual(): Promise<string> {
  const sid = (await cookies()).get(COOKIE_SESSAO)?.value;
  if (!sid) throw new Error("Sessão ausente (proxy não criou o cookie)");
  await garantirSessao(sid);
  return sid;
}

export async function garantirSessao(sid: string) {
  await garantirMigracao();
  const existe = await db.select({ id: s.sessoes.id }).from(s.sessoes).where(eq(s.sessoes.id, sid)).get();
  if (existe) {
    await db.update(s.sessoes).set({ ultimoAcesso: new Date() }).where(eq(s.sessoes.id, sid));
    return;
  }
  await semear(sid);
}

async function semear(sid: string) {
  await db.insert(s.sessoes).values({ id: sid }).onConflictDoNothing();
  await db.insert(s.erpFornecedores).values(capturaErp.fornecedores.map((f) => ({ sessionId: sid, codFornecedor: f.cod_fornecedor, dados: f })));
  await db.insert(s.erpLojas).values(capturaErp.lojas.map((l) => ({ sessionId: sid, codLoja: l.cod_loja, dados: l })));
  await db.insert(s.erpCondicoes).values(capturaErp.condicoes.map((c) => ({ sessionId: sid, codCondicao: c.cod_condicao, dados: c })));
  for (const e of emailsDataset) {
    const [neg] = await db
      .insert(s.negociacoes)
      .values({
        sessionId: sid,
        origem: "dataset",
        chaveDataset: e.chave,
        messageId: e.messageId,
        remetente: e.remetente,
        dominio: e.dominio,
        assunto: e.assunto,
        recebidoEm: new Date(e.data),
        corpo: e.corpo,
        bruto: e.bruto,
        anexos: e.anexos,
      })
      .returning({ id: s.negociacoes.id });
    await db.insert(s.tarefas).values({ sessionId: sid, negociacaoId: neg.id, tipo: "ler_email" });
  }
}

export async function reiniciarSessao(sid: string) {
  await garantirMigracao();
  const negs = (await db.select({ id: s.negociacoes.id }).from(s.negociacoes).where(eq(s.negociacoes.sessionId, sid))).map((n) => n.id);
  if (negs.length) {
    await db.delete(s.condicoes).where(inArray(s.condicoes.negociacaoId, negs));
    await db.delete(s.leituras).where(inArray(s.leituras.negociacaoId, negs));
    await db.delete(s.farois).where(inArray(s.farois.negociacaoId, negs));
    await db.delete(s.tentativas).where(inArray(s.tentativas.negociacaoId, negs));
  }
  await db.delete(s.tarefas).where(eq(s.tarefas.sessionId, sid));
  await db.delete(s.negociacoes).where(eq(s.negociacoes.sessionId, sid));
  for (const t of [s.erpFornecedores, s.erpLojas, s.erpCondicoes, s.erpIdempotencia, s.erpChamadas]) await db.delete(t).where(eq(t.sessionId, sid));
  await db.delete(s.sessoes).where(eq(s.sessoes.id, sid));
  await semear(sid);
}
