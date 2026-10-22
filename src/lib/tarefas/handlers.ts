// O que cada tarefa faz. Cada uma lê o estado do banco, faz uma coisa e grava o resultado + próximo passo.
import { and, eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { db, schema as s } from "@/db";
import type { TipoTarefa } from "@/db/schema";
import referencia from "../../../data/leituras-referencia.json";
import { extrair, FalhaIa, IaIndisponivel, iaConfigurada, redigir, verificar, MODELOS, type MaterialEmail, type RegistroIa } from "../agentes/agentes";
import { dadosRedator } from "../agentes/entrada-redator";
import { resumoPadrao } from "../agentes/textos-padrao";
import { soDirigidas, type Extracao, type Redacao, type Verificacao } from "../agentes/schemas";
import { classificar, erp } from "../erp/cliente";
import { carregar, FalhaErp, obterSnapshot, paraCondicao, recalcularFarois, type LinhaNegociacao } from "../negociacao";
import { extrato } from "../dominio/dataset";
import { condicoesDaLeitura } from "../regras/condicoes-da-leitura";
import { montarPayload, MOTIVO_TEXTO_SUSPEITO } from "../regras/farois";
import { enfileirar, Permanente, Transitoria, type Resultado, type Tarefa } from "./fila";

const MAX_TENTATIVAS_IA = 5;

// Saídas reais da IA salvas para os 4 e-mails do dataset (S36). Gerado por `pnpm gerar-cache-ia` com chave.
const CAMINHO_CACHE = path.join(process.cwd(), "data", "leituras-ia-cache.json");
type ItemCache = {
  extrator: Extracao;
  verificador: Verificacao | null;
  redator?: Redacao;
  statusRedator?: string;
  modeloExtrator: string;
  modeloVerificador: string | null;
  modeloRedator?: string;
  geradoEm?: string;
  chamadas?: Partial<Record<"extrator" | "verificador" | "redator", RegistroIa>>;
};
function cacheIa(): Record<string, ItemCache> {
  try {
    return JSON.parse(fs.readFileSync(CAMINHO_CACHE, "utf8"));
  } catch {
    return {};
  }
}

const material = (n: LinhaNegociacao): MaterialEmail => ({
  corpo: n.corpo,
  remetente: n.remetente,
  assunto: n.assunto,
  data: n.recebidoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  anexos: n.anexos,
});

// Dataset nunca chama a IA ao vivo por visitante: usa a saída salva (ou a referência manual). IA ao vivo só
// para e-mail novo (gerado/colado) ou quando alguém pede "reler ao vivo".
const usaSalvo = (n: LinhaNegociacao) => !!n.chaveDataset && !n.forcarLeituraIa;

// Auditoria da IA (D14): guarda cada chamada (ao vivo ou saída salva) ligada à tarefa e à tentativa
async function registrarIa(t: Tarefa, registro: RegistroIa | undefined, origem: "ia" | "cache", geradoEm: string | null = null) {
  if (!registro) return;
  await db.insert(s.chamadasIa).values({ negociacaoId: t.negociacaoId, tarefaId: t.id, tentativa: t.tentativas, origem, geradoEm, registro });
}

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
  const doCache = usaSalvo(neg) ? cacheIa()[neg.chaveDataset!] : undefined;
  if (doCache) {
    origem = "cache";
    saida = doCache.extrator;
    verificador = doCache.verificador;
    modeloExtrator = doCache.modeloExtrator;
    modeloVerificador = doCache.modeloVerificador;
    await registrarIa(t, doCache.chamadas?.extrator, "cache", doCache.geradoEm ?? null);
  } else if (usaSalvo(neg)) {
    origem = "referencia_manual"; // C1: sem chave, leitura de referência rotulada como manual
    saida = (referencia as unknown as Record<string, Extracao>)[neg.chaveDataset!];
  } else {
    try {
      const r = await extrair(material(neg));
      await registrarIa(t, r.registro, "ia");
      saida = r.saida;
      modeloExtrator = r.modelo;
      origem = "ia";
    } catch (e) {
      if (e instanceof FalhaIa) await registrarIa(t, e.registro, "ia");
      erroIa(e, t);
    }
  }

  let snap;
  try {
    snap = await obterSnapshot(t.sessionId);
  } catch (e) {
    erroErp(e);
  }
  const novas = condicoesDaLeitura(saida, neg.dominio, snap.fornecedores, snap.lojas, [...snap.condicoes, ...extrato]);
  const [leitura] = await db
    .insert(s.leituras)
    .values({ negociacaoId: neg.id, origem, modeloExtrator, modeloVerificador, saidaExtrator: saida, saidaVerificador: verificador })
    .returning({ id: s.leituras.id });
  await db.delete(s.condicoes).where(eq(s.condicoes.negociacaoId, neg.id));
  await db.delete(s.farois).where(eq(s.farois.negociacaoId, neg.id));
  if (novas.length) await db.insert(s.condicoes).values(novas.map((c) => ({ ...c, negociacaoId: neg.id })));
  await db
    .update(s.negociacoes)
    .set({ status: "verificacao", leituraAtualId: leitura.id, instrucoesSuspeitas: soDirigidas(saida.instrucoes_suspeitas), forcarLeituraIa: false, atualizadoEm: new Date() })
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
  if (leitura.saidaVerificador) {
    msgVerif = `Verificação salva (${leitura.modeloVerificador}).`;
    if (leitura.origem === "cache") {
      const c = cacheIa()[neg.chaveDataset!];
      await registrarIa(t, c?.chamadas?.verificador, "cache", c?.geradoEm ?? null);
    }
  } else if (iaConfigurada() && leitura.origem === "ia") {
    try {
      const r = await verificar(material(neg), leitura.saidaExtrator);
      await registrarIa(t, r.registro, "ia");
      await db.update(s.leituras).set({ saidaVerificador: r.saida, modeloVerificador: r.modelo }).where(eq(s.leituras.id, leitura.id));
      // o Verificador também procura texto suspeito: soma ao que o Extrator achou
      const todas = [...neg.instrucoesSuspeitas, ...soDirigidas(r.saida.instrucoes_suspeitas).filter((x) => !neg.instrucoesSuspeitas.some((y) => y.trecho === x.trecho))];
      await db.update(s.negociacoes).set({ instrucoesSuspeitas: todas }).where(eq(s.negociacoes.id, neg.id));
      msgVerif = `Verificador (${r.modelo}): ${r.saida.checagens.filter((c) => c.veredito !== "concorda").length} ponto(s) de dúvida/discordância.`;
    } catch (e) {
      if (e instanceof FalhaIa) await registrarIa(t, e.registro, "ia");
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
      .set({ status: "escalado", motivoSaida: MOTIVO_TEXTO_SUSPEITO, atualizadoEm: new Date() })
      .where(eq(s.negociacoes.id, neg.id));
  } else {
    await db.update(s.negociacoes).set({ status: "revisao", atualizadoEm: new Date() }).where(eq(s.negociacoes.id, neg.id));
  }
  await enfileirar(t.sessionId, neg.id, "redigir");
  return { mensagem: `${msgVerif} Faróis calculados. → ${suspeita ? "Escalado" : "Revisão humana"}.` };
}

// ---------- resumo (Redator); os textos para enviar são sob demanda na tela (D20) ----------

async function redigirTarefa(t: Tarefa): Promise<Resultado> {
  const dados = await carregar(t.sessionId, t.negociacaoId);
  if (!dados) throw new Permanente("negociação não encontrada");
  const { neg, conds, farois, leitura } = dados;
  let r: Redacao;
  let origem: "ia" | "padrao" = "padrao";
  let deCache = false;
  const salvo = usaSalvo(neg) ? cacheIa()[neg.chaveDataset!] : undefined;
  // texto salvo só vale para a leitura salva: depois de "reler ao vivo" ele descreveria outra leitura
  if (salvo?.redator && leitura?.origem === "cache" && neg.status === (salvo.statusRedator ?? "revisao")) {
    // primeiro texto do dataset: saída salva do Redator, sem chamar a IA
    r = salvo.redator;
    origem = "ia";
    deCache = true;
    await registrarIa(t, salvo.chamadas?.redator, "cache", salvo.geradoEm ?? null);
  } else if (iaConfigurada() && leitura?.origem === "ia") {
    // Redator ao vivo só quando a leitura também foi ao vivo (e-mail novo ou "reler ao vivo")
    try {
      const red = await redigir(dadosRedator(neg, conds, farois));
      await registrarIa(t, red.registro, "ia");
      r = red.saida;
      origem = "ia";
    } catch (e) {
      if (e instanceof FalhaIa) await registrarIa(t, e.registro, "ia");
      // texto não é essencial: depois de 3 tentativas usa o padrão em vez de travar
      if (t.tentativas < 3 && !(e instanceof IaIndisponivel)) erroIa(e, t);
      r = { resumo: resumoPadrao(conds, farois) };
    }
  } else r = { resumo: resumoPadrao(conds, farois) };
  await db
    .update(s.negociacoes)
    .set({ resumo: (Array.isArray(r.resumo) ? r.resumo : [r.resumo]).join("\n"), textosOrigem: origem })
    .where(eq(s.negociacoes.id, neg.id));
  const msg = deCache ? `Resumo do Redator: saída salva (${salvo?.modeloRedator ?? "IA"}), sem chamada nova.` : origem === "ia" ? `Resumo escrito pelo Redator (${MODELOS.redator()}).` : "Resumo padrão (sem IA).";
  return { mensagem: msg };
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
      snap = await obterSnapshot(t.sessionId, ["condicoes", "fornecedores"]);
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
  await db.update(s.negociacoes).set({ status: "revisao", alertaRevisao: alerta, atualizadoEm: new Date() }).where(eq(s.negociacoes.id, negId));
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

