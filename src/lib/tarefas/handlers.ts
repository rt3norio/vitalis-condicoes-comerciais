// O que cada tarefa faz. Cada uma lê o estado do banco, faz uma coisa e grava o resultado + próximo passo.
import { and, eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { db, schema as s } from "@/db";
import type { TipoTarefa } from "@/db/schema";
import referencia from "../../../data/leituras-referencia.json";
import { extrair, IaIndisponivel, iaConfigurada, redigir, verificar, MODELOS, type MaterialEmail } from "../agentes/agentes";
import type { Extracao, Redacao, Verificacao } from "../agentes/schemas";
import { fmtBRL, fmtData, fmtPct } from "../dominio/datas";
import { alcada } from "../dominio/politica";
import { CATEGORIA_LABEL, type Categoria, type Farol } from "../dominio/tipos";
import { classificar, erp } from "../erp/cliente";
import { carregar, FalhaErp, obterSnapshot, paraCondicao, recalcularFarois, type LinhaNegociacao } from "../negociacao";
import { condicoesDaLeitura } from "../regras/condicoes-da-leitura";
import { montarPayload } from "../regras/farois";
import { enfileirar, Permanente, Transitoria, type Resultado, type Tarefa } from "./fila";

const MAX_TENTATIVAS_IA = 5;

// Saídas reais da IA salvas para os 4 e-mails do dataset (S36). Gerado por `pnpm gerar-cache-ia` com chave.
const CAMINHO_CACHE = path.join(process.cwd(), "data", "leituras-ia-cache.json");
type ItemCache = { extrator: Extracao; verificador: Verificacao | null; modeloExtrator: string; modeloVerificador: string | null };
function cacheIa(): Record<string, ItemCache> {
  try {
    return JSON.parse(fs.readFileSync(CAMINHO_CACHE, "utf8"));
  } catch {
    return {};
  }
}

const material = (n: LinhaNegociacao): MaterialEmail => ({ corpo: n.corpo, remetente: n.remetente, assunto: n.assunto, anexos: n.anexos });

function erroIa(e: unknown, t: Tarefa): never {
  if (e instanceof IaIndisponivel) throw new Transitoria(`${e.message}. Tenta de novo em 5 min.`, 300);
  const msg = e instanceof Error ? e.message : String(e);
  if (t.tentativas >= MAX_TENTATIVAS_IA) throw new Permanente(`IA falhou ${t.tentativas} vezes: ${msg.slice(0, 300)}`);
  throw new Transitoria(`IA falhou: ${msg.slice(0, 300)}`);
}

function erroErp(e: unknown): never {
  if (e instanceof FalhaErp) {
    if (classificar(e.status) === "permanente") throw new Permanente(e.message, e.status);
    throw new Transitoria(e.message, e.retryAfter, e.status);
  }
  throw e;
}

// ---------- 1 → 2: ler e-mail ----------
async function lerEmail(t: Tarefa): Promise<Resultado> {
  const dados = await carregar(t.sessionId, t.negociacaoId);
  if (!dados) throw new Permanente("negociação não existe mais");
  const { neg } = dados;
  if (neg.status !== "recebido") return { mensagem: `Ignorada: negociação já está em ${neg.status}.` };

  let origem: "ia" | "cache" | "referencia_manual";
  let saida: Extracao;
  let verificador: Verificacao | null = null;
  let modeloExtrator: string | null = null;
  let modeloVerificador: string | null = null;
  const doCache = neg.chaveDataset && !neg.forcarLeituraIa ? cacheIa()[neg.chaveDataset] : undefined;
  if (doCache) {
    origem = "cache";
    saida = doCache.extrator;
    verificador = doCache.verificador;
    modeloExtrator = doCache.modeloExtrator;
    modeloVerificador = doCache.modeloVerificador;
  } else if (neg.chaveDataset && !neg.forcarLeituraIa && !iaConfigurada()) {
    origem = "referencia_manual"; // C1: sem chave, leitura de referência rotulada como manual
    saida = (referencia as unknown as Record<string, Extracao>)[neg.chaveDataset];
  } else {
    try {
      const r = await extrair(material(neg));
      saida = r.saida;
      modeloExtrator = r.modelo;
      origem = "ia";
    } catch (e) {
      erroIa(e, t);
    }
  }

  let snap;
  try {
    snap = await obterSnapshot(t.sessionId);
  } catch (e) {
    erroErp(e);
  }
  const novas = condicoesDaLeitura(saida, neg.dominio, snap.fornecedores, snap.lojas);
  const [leitura] = await db
    .insert(s.leituras)
    .values({ negociacaoId: neg.id, origem, modeloExtrator, modeloVerificador, saidaExtrator: saida, saidaVerificador: verificador })
    .returning({ id: s.leituras.id });
  await db.delete(s.condicoes).where(eq(s.condicoes.negociacaoId, neg.id));
  await db.delete(s.farois).where(eq(s.farois.negociacaoId, neg.id));
  if (novas.length) await db.insert(s.condicoes).values(novas.map((c) => ({ ...c, negociacaoId: neg.id })));
  await db
    .update(s.negociacoes)
    .set({ status: "verificacao", leituraAtualId: leitura.id, instrucoesSuspeitas: saida.instrucoes_suspeitas, forcarLeituraIa: false, atualizadoEm: new Date() })
    .where(eq(s.negociacoes.id, neg.id));
  await enfileirar(t.sessionId, neg.id, "verificar");
  const rotulo = { ia: `IA (${modeloExtrator})`, cache: `saída salva da IA (${modeloExtrator})`, referencia_manual: "leitura de referência manual (IA não configurada)" }[origem];
  return { mensagem: `Lido por ${rotulo}: ${novas.length} condição(ões).` };
}

// ---------- 2 → 3 (ou Escalado): verificar ----------
async function verificarTarefa(t: Tarefa): Promise<Resultado> {
  const dados = await carregar(t.sessionId, t.negociacaoId);
  if (!dados || !dados.leitura) throw new Permanente("negociação ou leitura não encontrada");
  const { neg, leitura } = dados;
  if (neg.status !== "verificacao") return { mensagem: `Ignorada: negociação em ${neg.status}.` };

  let msgVerif = "Verificador não executado (IA não configurada).";
  if (leitura.saidaVerificador) msgVerif = `Verificação salva (${leitura.modeloVerificador}).`;
  else if (iaConfigurada()) {
    try {
      const r = await verificar(material(neg), leitura.saidaExtrator);
      await db.update(s.leituras).set({ saidaVerificador: r.saida, modeloVerificador: r.modelo }).where(eq(s.leituras.id, leitura.id));
      // o Verificador também procura instrução suspeita: soma às do Extrator
      const todas = [...neg.instrucoesSuspeitas, ...r.saida.instrucoes_suspeitas.filter((x) => !neg.instrucoesSuspeitas.some((y) => y.trecho === x.trecho))];
      await db.update(s.negociacoes).set({ instrucoesSuspeitas: todas }).where(eq(s.negociacoes.id, neg.id));
      msgVerif = `Verificador (${r.modelo}): ${r.saida.checagens.filter((c) => c.veredito !== "concorda").length} ponto(s) de dúvida/discordância.`;
    } catch (e) {
      erroIa(e, t);
    }
  }

  let snap;
  try {
    snap = await obterSnapshot(t.sessionId);
  } catch (e) {
    erroErp(e);
  }
  const { negociacao } = await recalcularFarois(t.sessionId, neg.id, snap);
  const suspeita = negociacao.find((f) => f.codigo === "LEI-09" && f.cor === "vermelho");
  if (suspeita) {
    await db
      .update(s.negociacoes)
      .set({ status: "escalado", motivoSaida: "E-mail contém instrução dirigida ao sistema (S33). Escalado à Diretoria Comercial (premissa P12).", atualizadoEm: new Date() })
      .where(eq(s.negociacoes.id, neg.id));
  } else {
    await db.update(s.negociacoes).set({ status: "revisao", atualizadoEm: new Date() }).where(eq(s.negociacoes.id, neg.id));
  }
  await enfileirar(t.sessionId, neg.id, "redigir");
  return { mensagem: `${msgVerif} Faróis calculados. → ${suspeita ? "Escalado" : "Revisão humana"}.` };
}

// ---------- textos (Redator) ----------
type FarolLinha = typeof s.farois.$inferSelect;

function textosPadrao(neg: LinhaNegociacao, conds: (typeof s.condicoes.$inferSelect)[], fs: FarolLinha[]): Redacao {
  const vermelhos = fs.filter((f) => f.cor === "vermelho");
  const escalar = neg.status === "escalado" || fs.some((f) => f.acao === "escalar");
  const lista = conds
    .map((c) => `${c.titulo}: ${c.tipo === "DESCONTO_PERCENTUAL" ? fmtPct(c.percentual) : fmtBRL(c.valor)}${c.codCategoria ? ` em ${CATEGORIA_LABEL[c.codCategoria as Categoria]}` : ""}, ${fmtData(c.dataInicio)}–${fmtData(c.dataFim)}`)
    .join("; ");
  const resumo = vermelhos.length
    ? `${conds.length} condição(ões): ${lista}. Travado por ${[...new Set(vermelhos.map((f) => f.titulo.toLowerCase()))].slice(0, 3).join(", ")}.`
    : `${conds.length} condição(ões): ${lista}. Sem bloqueios; confira os itens amarelos e aprove na alçada indicada.`;
  const primeiro = neg.remetente.replace(/<.*>/, "").trim().split(" ")[0] || "";
  const rascunho = vermelhos.length
    ? `Olá, ${primeiro}! Recebemos a proposta e ela está em análise. Para seguirmos, precisamos confirmar alguns pontos; retornamos em breve com o que faltar.`
    : `Olá, ${primeiro}! Recebemos a proposta e ela está em aprovação interna. Avisamos assim que estiver cadastrada.`;
  const memorando = escalar
    ? `Para: Diretoria Comercial\nAssunto: decisão necessária — ${neg.assunto}\n\n${lista}.\n\nMotivo: ${[neg.motivoSaida, ...fs.filter((f) => f.acao === "escalar").map((f) => f.detalhe)].filter(Boolean).join(" ")}\n\nOrigem: ${neg.messageId}`
    : null;
  return { resumo, rascunho_fornecedor: rascunho, memorando_diretoria: memorando };
}

async function redigirTarefa(t: Tarefa): Promise<Resultado> {
  const dados = await carregar(t.sessionId, t.negociacaoId);
  if (!dados) throw new Permanente("negociação não encontrada");
  const { neg, conds, farois } = dados;
  let r: Redacao;
  let origem: "ia" | "padrao" = "padrao";
  if (iaConfigurada()) {
    try {
      const resumoFarois = conds.map((c) => ({
        condicao: c.titulo,
        valor: c.tipo === "DESCONTO_PERCENTUAL" ? fmtPct(c.percentual) : fmtBRL(c.valor),
        alcada: alcada(c.tipo, c.percentual, c.valor).label,
        vermelhos: farois.filter((f) => f.condicaoId === c.id && f.cor === "vermelho").map((f) => `${f.codigo} ${f.titulo}: ${f.detalhe}`),
        amarelos: farois.filter((f) => f.condicaoId === c.id && f.cor === "amarelo").map((f) => `${f.codigo} ${f.titulo}`),
      }));
      r = (await redigir({ status: neg.status, motivo: neg.motivoSaida, fornecedor_remetente: neg.remetente, assunto: neg.assunto, condicoes: resumoFarois })).saida;
      origem = "ia";
    } catch (e) {
      // texto não é essencial: depois de 3 tentativas usa o padrão em vez de travar
      if (t.tentativas < 3 && !(e instanceof IaIndisponivel)) erroIa(e, t);
      r = textosPadrao(neg, conds, farois);
    }
  } else r = textosPadrao(neg, conds, farois);
  await db
    .update(s.negociacoes)
    .set({ resumo: r.resumo, rascunhoFornecedor: r.rascunho_fornecedor, memorando: r.memorando_diretoria, textosOrigem: origem })
    .where(eq(s.negociacoes.id, neg.id));
  return { mensagem: origem === "ia" ? `Textos escritos pelo Redator (${MODELOS.redator()}).` : "Textos padrão (sem IA)." };
}

// ---------- 4 → 5: enviar ao ERP ----------
async function enviarErp(t: Tarefa): Promise<Resultado> {
  const dados = await carregar(t.sessionId, t.negociacaoId);
  if (!dados) throw new Permanente("negociação não encontrada");
  const { neg, conds } = dados;
  if (neg.status !== "aguardando_envio") return { mensagem: `Ignorada: negociação em ${neg.status}.` };
  const pendentes = conds.filter((c) => !c.erpCodCondicao);
  const gravadas = conds.filter((c) => c.erpCodCondicao);

  // S27: antes do 1º POST do pacote, reconfere tudo com o ERP ao vivo
  if (!gravadas.length) {
    let snap;
    try {
      snap = await obterSnapshot(t.sessionId, 0, ["condicoes", "fornecedores"]);
    } catch (e) {
      erroErp(e);
    }
    const { porCondicao } = await recalcularFarois(t.sessionId, neg.id, snap);
    const problemas = [...porCondicao.entries()].flatMap(([id, fs]) => fs.filter((f) => f.cor === "vermelho").map((f) => ({ id, f })));
    if (problemas.length) {
      await voltarParaRevisao(neg.id, `Reconferência com o ERP ao vivo antes do envio: ${problemas.map((p) => `${p.f.codigo} ${p.f.detalhe}`).join(" | ")}. Nada foi enviado.`, problemas.map((p) => p.id));
      return { mensagem: `Reconferência encontrou ${problemas.length} problema(s); voltou para revisão sem enviar.` };
    }
  }

  const feitos: string[] = [];
  for (const c of pendentes) {
    if (!c.aprovador || !c.idempotencyKey) throw new Permanente(`Condição ${c.ordem} sem aprovação registrada.`);
    const payload = montarPayload(paraCondicao(c), c.aprovador, neg.messageId);
    const r = await erp.criarCondicao(t.sessionId, payload, c.idempotencyKey);
    const classe = classificar(r.status);
    const b = r.body as { cod_condicao?: string; error?: string; message?: string; campos?: { campo: string; erro: string }[] };
    if (classe === "ok") {
      await db.update(s.condicoes).set({ erpCodCondicao: b.cod_condicao ?? null, erpResposta: r.body, enviadaEm: new Date() }).where(eq(s.condicoes.id, c.id));
      feitos.push(`${c.titulo} → ${b.cod_condicao}`);
      continue;
    }
    const detalhe = `${r.status} ${b?.error ?? ""} ${b?.message ?? ""}${b?.campos?.length ? ` (${b.campos.map((x) => `${x.campo}: ${x.erro}`).join("; ")})` : ""}`.trim();
    if (classe === "transitorio") {
      const prefixo = feitos.length ? `Gravadas: ${feitos.join(", ")}. ` : "";
      throw new Transitoria(`${prefixo}${c.titulo}: ${detalhe}. Tenta de novo na próxima rodada com a mesma Idempotency-Key.`, r.retryAfter, r.status);
    }
    await db.update(s.condicoes).set({ erpResposta: r.body }).where(eq(s.condicoes.id, c.id));
    const parcial = [...gravadas.map((g) => `${g.titulo} → ${g.erpCodCondicao}`), ...feitos];
    await voltarParaRevisao(
      neg.id,
      `${parcial.length ? `GRAVADO PARCIALMENTE (${parcial.join(", ")}). ` : ""}ERP recusou "${c.titulo}": ${detalhe}.`,
      [c.id],
    );
    throw new Permanente(`ERP recusou ${c.titulo}: ${detalhe}`, r.status);
  }
  await db.update(s.negociacoes).set({ status: "enviado", alertaRevisao: null, atualizadoEm: new Date() }).where(eq(s.negociacoes.id, neg.id));
  return { mensagem: `Enviado ao ERP: ${feitos.join(", ") || "nada pendente"}.`, httpStatus: 201 };
}

async function voltarParaRevisao(negId: number, alerta: string, condicoesAfetadas: number[]) {
  await db.update(s.negociacoes).set({ status: "revisao", alertaRevisao: alerta, conferidos: null, atualizadoEm: new Date() }).where(eq(s.negociacoes.id, negId));
  // condição com problema precisa ser reaprovada; nova aprovação gera nova Idempotency-Key
  for (const id of condicoesAfetadas)
    await db
      .update(s.condicoes)
      .set({ aprovador: null, aprovadaEm: null, idempotencyKey: null })
      .where(and(eq(s.condicoes.id, id), eq(s.condicoes.negociacaoId, negId)));
}

export const HANDLERS: Record<TipoTarefa, (t: Tarefa) => Promise<Resultado>> = {
  ler_email: lerEmail,
  verificar: verificarTarefa,
  redigir: redigirTarefa,
  enviar_erp: enviarErp,
};

