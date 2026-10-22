"use server";
// Ações humanas (raia 3) e botões do painel. Cada ação valida a sessão e o status antes de mexer.
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db, schema as s } from "@/db";
import { gerarEmails, iaConfigurada } from "@/lib/agentes/agentes";
import { capturaErp, parseEml } from "@/lib/dominio/dataset";
import { hoje, isISO } from "@/lib/dominio/datas";
import { APROVADORES } from "@/lib/dominio/politica";
import { CATEGORIA_LABEL, CATEGORIAS, type CampoCondicao } from "@/lib/dominio/tipos";
import { carregar, paraCondicao, recalcularFarois } from "@/lib/negociacao";
import { podeAprovar } from "@/lib/regras/farois";
import { reiniciarSessao, sessaoAtual } from "@/lib/sessao";
import { processarRodada } from "@/lib/tarefas/agendador";
import { enfileirar } from "@/lib/tarefas/fila";

export type RespostaAcao = { ok: boolean; mensagem: string };
const ok = (mensagem: string): RespostaAcao => ({ ok: true, mensagem });
const falha = (mensagem: string): RespostaAcao => ({ ok: false, mensagem });

const LIMITE_EMAILS_POR_SESSAO = 5;
const LIMITE_CARACTERES = 20_000;

async function condicaoEditavel(condId: number) {
  const sid = await sessaoAtual();
  const c = await db.select().from(s.condicoes).where(eq(s.condicoes.id, condId)).get();
  if (!c) return { erro: "Condição não encontrada." } as const;
  const dados = await carregar(sid, c.negociacaoId);
  if (!dados) return { erro: "Negociação não encontrada." } as const;
  if (dados.neg.status !== "revisao") return { erro: "Só dá para editar na revisão humana." } as const;
  if (c.erpCodCondicao) return { erro: `Condição já gravada no ERP como ${c.erpCodCondicao}; não pode mais ser editada.` } as const;
  if (c.aprovadaEm) return { erro: "Condição já aprovada. Desfaça a aprovação para editar." } as const;
  return { sid, c, dados } as const;
}

// Qualquer mudança invalida a conferência dos amarelos
async function depoisDeEditar(sid: string, negId: number) {
  await db.update(s.negociacoes).set({ conferidos: null, atualizadoEm: new Date() }).where(eq(s.negociacoes.id, negId));
  await recalcularFarois(sid, negId);
  refresh();
}

const MAPA: Record<string, CampoCondicao> = {
  codFornecedor: "fornecedor",
  codCategoria: "categoria",
  lojas: "lojas",
  percentual: "valor",
  valor: "valor",
  dataInicio: "data_inicio",
  dataFim: "data_fim",
  contrapartida: "contrapartida",
};

export async function editarCampo(condId: number, campo: keyof typeof MAPA, valor: string | string[] | null): Promise<RespostaAcao> {
  const r = await condicaoEditavel(condId);
  if ("erro" in r) return falha(r.erro!);
  const { sid, c } = r;
  const set: Partial<typeof s.condicoes.$inferInsert> = {};
  if (campo === "percentual" || campo === "valor") {
    const n = valor == null || valor === "" ? null : Number(String(valor).replace(",", "."));
    if (n != null && !Number.isFinite(n)) return falha("Número inválido.");
    set[campo] = n;
  } else if (campo === "dataInicio" || campo === "dataFim") {
    if (valor && !isISO(valor)) return falha("Data inválida.");
    set[campo] = (valor as string) || null;
  } else if (campo === "lojas") set.lojas = Array.isArray(valor) ? valor : [];
  else if (campo === "codCategoria") {
    if (valor && !CATEGORIAS.includes(valor as never)) return falha("Categoria inválida.");
    set.codCategoria = (valor as string) || null;
  } else if (campo === "codFornecedor") set.codFornecedor = (valor as string) || null;
  else if (campo === "contrapartida") set.contrapartida = String(valor ?? "").slice(0, 500);
  else return falha("Campo desconhecido.");
  const pk = MAPA[campo];
  const prov = { ...c.proveniencia, [pk]: { ...(c.proveniencia[pk] ?? { certeza: "ausente", trecho: "" }), ajustado: true, sugestaoAceita: false } };
  await db.update(s.condicoes).set({ ...set, proveniencia: prov }).where(eq(s.condicoes.id, condId));
  await depoisDeEditar(sid, c.negociacaoId);
  return ok("Campo atualizado.");
}

export async function aceitarSugestao(condId: number, campo: "dataFim" | "dataInicio"): Promise<RespostaAcao> {
  const r = await condicaoEditavel(condId);
  if ("erro" in r) return falha(r.erro!);
  const { sid, c } = r;
  const pk = MAPA[campo];
  const sug = c.proveniencia[pk]?.sugestao;
  if (!sug || !isISO(sug.valor)) return falha("Sem sugestão para este campo.");
  const prov = { ...c.proveniencia, [pk]: { ...c.proveniencia[pk]!, ajustado: true, sugestaoAceita: true } };
  await db.update(s.condicoes).set({ [campo]: sug.valor, proveniencia: prov }).where(eq(s.condicoes.id, condId));
  await depoisDeEditar(sid, c.negociacaoId);
  return ok("Sugestão aplicada (continua amarela: é premissa).");
}

export async function escolherAlternativa(condId: number, valor: number): Promise<RespostaAcao> {
  const r = await condicaoEditavel(condId);
  if ("erro" in r) return falha(r.erro!);
  const { sid, c } = r;
  const prov = { ...c.proveniencia, valor: { ...c.proveniencia.valor!, ajustado: true } };
  await db
    .update(s.condicoes)
    .set({ [c.tipo === "DESCONTO_PERCENTUAL" ? "percentual" : "valor"]: valor, proveniencia: prov })
    .where(eq(s.condicoes.id, condId));
  await depoisDeEditar(sid, c.negociacaoId);
  return ok("Valor escolhido.");
}

export async function definirSubstituicao(condId: number, codCondicao: string | null): Promise<RespostaAcao> {
  const r = await condicaoEditavel(condId);
  if ("erro" in r) return falha(r.erro!);
  await db.update(s.condicoes).set({ codCondicaoSubstituida: codCondicao }).where(eq(s.condicoes.id, condId));
  await depoisDeEditar(r.sid, r.c.negociacaoId);
  return ok(codCondicao ? `Vai substituir ${codCondicao}.` : "Substituição desfeita.");
}

export async function conferirAmarelos(negId: number, matricula: string): Promise<RespostaAcao> {
  const sid = await sessaoAtual();
  const dados = await carregar(sid, negId);
  if (!dados || dados.neg.status !== "revisao") return falha("Negociação não está em revisão.");
  const ap = APROVADORES.find((a) => a.matricula === matricula);
  if (!ap) return falha("Escolha quem está conferindo.");
  const amarelos = dados.farois.filter((f) => f.cor === "amarelo").map((f) => `${f.codigo}${f.condicaoId ? `#${f.condicaoId}` : ""}`);
  await db
    .update(s.negociacoes)
    .set({ conferidos: { por: `${ap.nome} (${ap.matricula})`, em: new Date().toISOString(), farois: amarelos } })
    .where(eq(s.negociacoes.id, negId));
  refresh();
  return ok(`${amarelos.length} item(ns) deduzido(s) conferido(s) por ${ap.nome}.`);
}

export async function aprovarCondicao(condId: number, matricula: string): Promise<RespostaAcao> {
  const sid = await sessaoAtual();
  const c = await db.select().from(s.condicoes).where(eq(s.condicoes.id, condId)).get();
  if (!c) return falha("Condição não encontrada.");
  const dados = await carregar(sid, c.negociacaoId);
  if (!dados || dados.neg.status !== "revisao") return falha("Negociação não está em revisão.");
  const { porCondicao } = await recalcularFarois(sid, c.negociacaoId);
  const ap = APROVADORES.find((a) => a.matricula === matricula);
  const conferido = !!dados.neg.conferidos;
  const pa = podeAprovar(porCondicao.get(c.id) ?? [], ap, paraCondicao(c), conferido);
  if (!pa.ok) return falha(pa.motivo);
  await db
    .update(s.condicoes)
    .set({ aprovador: { matricula: ap!.matricula, nome: ap!.nome, cargo: ap!.cargo }, aprovadaEm: new Date(), idempotencyKey: crypto.randomUUID() })
    .where(eq(s.condicoes.id, condId));
  // S25 (premissa P11): pacote só sobe quando todas as condições estiverem aprovadas
  const todas = await db.select({ a: s.condicoes.aprovadaEm }).from(s.condicoes).where(eq(s.condicoes.negociacaoId, c.negociacaoId));
  if (todas.every((x) => x.a)) {
    await db.update(s.negociacoes).set({ status: "aguardando_envio", alertaRevisao: null, atualizadoEm: new Date() }).where(eq(s.negociacoes.id, c.negociacaoId));
    await enfileirar(sid, c.negociacaoId, "enviar_erp");
    refresh();
    return ok("Pacote aprovado. Entrou na fila de envio ao ERP (próxima rodada).");
  }
  refresh();
  return ok(`Aprovada por ${ap!.nome}. Falta aprovar as outras condições do e-mail.`);
}

export async function desfazerAprovacao(condId: number): Promise<RespostaAcao> {
  const sid = await sessaoAtual();
  const c = await db.select().from(s.condicoes).where(eq(s.condicoes.id, condId)).get();
  if (!c) return falha("Condição não encontrada.");
  const dados = await carregar(sid, c.negociacaoId);
  if (!dados || dados.neg.status !== "revisao") return falha("Só dá para desfazer na revisão.");
  if (c.erpCodCondicao) return falha(`Esta condição já está gravada no ERP como ${c.erpCodCondicao}; não dá para desfazer aqui.`);
  await db.update(s.condicoes).set({ aprovador: null, aprovadaEm: null, idempotencyKey: null }).where(eq(s.condicoes.id, condId));
  refresh();
  return ok("Aprovação desfeita.");
}

export async function encerrar(negId: number, destino: "recusado" | "escalado", motivo: string): Promise<RespostaAcao> {
  const sid = await sessaoAtual();
  const dados = await carregar(sid, negId);
  if (!dados || dados.neg.status !== "revisao") return falha("Negociação não está em revisão.");
  if (!motivo.trim()) return falha("Escreva o motivo.");
  await db.update(s.negociacoes).set({ status: destino, motivoSaida: motivo.trim().slice(0, 500), atualizadoEm: new Date() }).where(eq(s.negociacoes.id, negId));
  await enfileirar(sid, negId, "redigir");
  refresh();
  return ok(destino === "recusado" ? "Recusada." : "Escalada à Diretoria.");
}

export async function reabrir(negId: number): Promise<RespostaAcao> {
  const sid = await sessaoAtual();
  const dados = await carregar(sid, negId);
  if (!dados || !["escalado", "recusado"].includes(dados.neg.status)) return falha("Só reabre o que foi escalado ou recusado.");
  if (dados.farois.some((f) => f.codigo === "LEI-09" && f.cor === "vermelho")) return falha("Texto suspeito no e-mail: não pode ser reaberto na tela. Encaminhe à Diretoria Comercial.");
  await db.update(s.negociacoes).set({ status: "revisao", motivoSaida: null, atualizadoEm: new Date() }).where(eq(s.negociacoes.id, negId));
  await recalcularFarois(sid, negId);
  refresh();
  return ok("Reaberta para revisão.");
}

export async function relerComIa(negId: number): Promise<RespostaAcao> {
  const sid = await sessaoAtual();
  const dados = await carregar(sid, negId);
  if (!dados || !["recebido", "verificacao", "revisao"].includes(dados.neg.status)) return falha("Só relê antes da aprovação.");
  if (dados.conds.some((c) => c.aprovadaEm)) return falha("Há condição aprovada; desfaça antes de reler.");
  await db.update(s.negociacoes).set({ status: "recebido", forcarLeituraIa: true, conferidos: null, alertaRevisao: null, atualizadoEm: new Date() }).where(eq(s.negociacoes.id, negId));
  await enfileirar(sid, negId, "ler_email");
  refresh();
  return ok("Nova leitura ao vivo pela IA na próxima rodada.");
}

export async function novoEmail(form: FormData): Promise<RespostaAcao> {
  const sid = await sessaoAtual();
  const sess = await db.select().from(s.sessoes).where(eq(s.sessoes.id, sid)).get();
  if ((sess?.emailsColados ?? 0) >= LIMITE_EMAILS_POR_SESSAO) return falha(`Limite de ${LIMITE_EMAILS_POR_SESSAO} e-mails por sessão nesta demo.`);
  let texto = String(form.get("texto") ?? "");
  const arquivo = form.get("eml");
  let origem: "colado" | "eml" = "colado";
  if (arquivo instanceof File && arquivo.size) {
    if (arquivo.size > LIMITE_CARACTERES * 2) return falha("Arquivo grande demais.");
    texto = await arquivo.text();
    origem = "eml";
  }
  const anexo = form.get("anexo");
  const anexos = anexo instanceof File && anexo.size ? [{ nome: anexo.name, texto: (await anexo.text()).slice(0, 8_000) }] : [];
  texto = texto.trim();
  if (texto.length < 30) return falha("Cole o e-mail inteiro (mínimo 30 caracteres).");
  if (texto.length > LIMITE_CARACTERES) return falha(`E-mail grande demais (máximo ${LIMITE_CARACTERES} caracteres).`);
  // aceita com ou sem cabeçalho
  const temCabecalho = /^(from|de|subject|assunto|message-id):/im.test(texto.split(/\r?\n\r?\n/)[0] ?? "");
  const e = parseEml(temCabecalho ? texto.replace(/^de:/im, "From:").replace(/^assunto:/im, "Subject:") : `Subject: E-mail colado\n\n${texto}`, `colado-${Date.now()}`, anexos);
  const [neg] = await db
    .insert(s.negociacoes)
    .values({
      sessionId: sid,
      origem,
      messageId: e.messageId.includes("sem-message-id") ? `<colado-${crypto.randomUUID()}@demo>` : e.messageId,
      remetente: e.remetente || "(remetente não informado)",
      dominio: e.dominio,
      assunto: e.assunto,
      recebidoEm: new Date(),
      corpo: e.corpo,
      bruto: texto,
      anexos,
    })
    .returning({ id: s.negociacoes.id });
  await db.update(s.sessoes).set({ emailsColados: (sess?.emailsColados ?? 0) + 1 }).where(eq(s.sessoes.id, sid));
  await enfileirar(sid, neg.id, "ler_email");
  refresh();
  return ok("E-mail recebido. Será lido na próxima rodada.");
}

const LIMITE_GERACOES_POR_SESSAO = 3;
const EMAILS_POR_GERACAO = 3;

// Ferramenta da demo: a IA escreve e-mails fictícios de fornecedores, que entram em "Recebido" e seguem o funil
// normal (leitura ao vivo pela IA). É a única chamada de IA disparada por visitante, e só quando ele clica.
export async function gerarNovosEmails(): Promise<RespostaAcao> {
  const sid = await sessaoAtual();
  if (!iaConfigurada()) return falha("IA não configurada neste ambiente.");
  const jaGerados = (await db.select({ o: s.negociacoes.origem }).from(s.negociacoes).where(eq(s.negociacoes.sessionId, sid))).filter((n) => n.o === "gerado").length;
  if (jaGerados >= LIMITE_GERACOES_POR_SESSAO * EMAILS_POR_GERACAO) return falha(`Limite de ${LIMITE_GERACOES_POR_SESSAO} gerações por sessão nesta demo.`);
  let r;
  try {
    r = await gerarEmails(EMAILS_POR_GERACAO, {
      hoje: hoje(),
      fornecedores: capturaErp.fornecedores.map((f) => `${f.razao_social} (${f.status})`),
      lojas: capturaErp.lojas.map((l) => l.nome.replace(/^DROG VITALIS\s+/i, "")),
      linhas: CATEGORIAS.map((c) => CATEGORIA_LABEL[c]),
    });
  } catch (e) {
    return falha(`A IA não conseguiu gerar agora (${e instanceof Error ? e.message.slice(0, 120) : "erro"}). Tente de novo.`);
  }
  for (const m of r.saida.emails) {
    const dominio = m.remetente_email.split("@")[1] ?? "";
    const [neg] = await db
      .insert(s.negociacoes)
      .values({
        sessionId: sid,
        origem: "gerado",
        messageId: `<gerado-${crypto.randomUUID()}@${dominio || "demo"}>`,
        remetente: `${m.remetente_nome} <${m.remetente_email}>`,
        dominio,
        assunto: m.assunto,
        recebidoEm: new Date(),
        corpo: m.corpo,
        bruto: m.corpo,
        anexos: m.anexo ? [{ nome: m.anexo.nome, texto: m.anexo.csv }] : [],
        motivoSaida: null,
      })
      .returning({ id: s.negociacoes.id });
    await enfileirar(sid, neg.id, "ler_email");
  }
  refresh();
  return ok(`${r.saida.emails.length} e-mails gerados pela IA (${r.saida.emails.map((m) => m.cenario).join(" · ")}). Entram no funil na próxima rodada.`);
}

export async function processarAgora(): Promise<RespostaAcao> {
  const sid = await sessaoAtual();
  const r = await processarRodada({ sessionId: sid });
  refresh();
  if (r.ocupada) return ok("Já há uma rodada em andamento; tente em alguns segundos.");
  return ok(r.executadas ? `Rodada executou ${r.executadas} tarefa(s).` : "Nenhuma tarefa pronta agora.");
}

export async function reiniciarDemo(): Promise<RespostaAcao> {
  const sid = await sessaoAtual();
  await reiniciarSessao(sid);
  refresh();
  return ok("Demo reiniciada: 4 e-mails em Recebido, ERP de volta à captura de 30/09.");
}
