// Catálogo de faróis (docs/desenho.md §3). Puro e determinístico: mesma entrada, mesma cor.
// Só o grupo Leitura usa resultado de IA (Extrator/Verificador); o resto é regra fixa.
import type { ErpCondicao, ErpFornecedor, ErpLoja, LinhaExtrato } from "../dominio/dataset";
import { addDias, fimMaximo, fmtBRL, fmtData, fmtPct, isISO } from "../dominio/datas";
import { alcada, TETO_SAZONAL, TETOS, VIGENCIA_MAX_MESES } from "../dominio/politica";
import type { Aprovador, CampoCondicao, ChecagemVerificador, Condicao, Farol } from "../dominio/tipos";
import { CATEGORIA_LABEL } from "../dominio/tipos";
import { validarPayload, type PayloadCondicao } from "./contrato-erp";
import { normalizar } from "./resolver";

export type ContextoFarois = {
  fornecedores: ErpFornecedor[];
  lojas: ErpLoja[];
  condicoesErp: ErpCondicao[]; // ERP ao vivo (ou última consulta)
  extrato: LinhaExtrato[]; // export de ontem
  hoje: string; // data de operação (D1: data real)
  dominioRemetente: string;
  origemRef: string | null;
  irmas: Condicao[]; // outras condições do mesmo e-mail
  verificador: ChecagemVerificador[] | null; // null = Verificador não executado
};

const valorDe = (c: Condicao) => (c.tipo === "DESCONTO_PERCENTUAL" ? c.percentual : c.valor);
const fmtValor = (c: { tipo: string; percentual?: number | null; valor?: number | null }) =>
  c.tipo === "DESCONTO_PERCENTUAL" ? fmtPct(c.percentual) : fmtBRL(c.valor);

const presente: Record<CampoCondicao, (c: Condicao) => boolean> = {
  fornecedor: (c) => !!c.codFornecedor,
  categoria: (c) => !!c.codCategoria,
  lojas: (c) => c.lojas.length > 0,
  valor: (c) => valorDe(c) != null,
  data_inicio: (c) => isISO(c.dataInicio),
  data_fim: (c) => isISO(c.dataFim),
  contrapartida: (c) => !!c.contrapartida?.trim(),
};

// ---------- Leitura ----------
function farolLeitura(c: Condicao, campo: CampoCondicao, codigo: string, titulo: string, opts: { sempreDeduzido?: boolean; ausenteOk?: boolean } = {}): Farol {
  const p = c.proveniencia[campo];
  const tem = presente[campo](c);
  const base = { codigo, grupo: "Leitura" as const, titulo };
  const trecho = p?.trecho ? `“${p.trecho}”` : "";
  if (p?.alternativas && p.alternativas.length > 1 && !p.ajustado)
    return { ...base, cor: "vermelho", detalhe: `E-mail e anexo divergem: ${p.alternativas.map((a) => `${a.valor} (${a.origem})`).join(" × ")}. Escolha o valor correto.` };
  if (p?.ajustado && tem && !p.sugestaoAceita) return { ...base, cor: "verde", detalhe: "Ajustado na revisão." };
  if (!tem) {
    if (opts.ausenteOk) return { ...base, cor: "verde", detalhe: "Não informado (não é obrigatório neste tipo)." };
    return { ...base, cor: "vermelho", detalhe: p?.sugestao ? `Não está no e-mail. Sugestão: ${p.sugestao.valor} (${p.sugestao.motivo}).` : "Não está no e-mail. Preencha." };
  }
  if (p?.sugestaoAceita) return { ...base, cor: "amarelo", detalhe: `Sugestão aceita na revisão: ${p.sugestao?.motivo ?? "premissa"}.` };
  if (opts.sempreDeduzido || p?.certeza === "deduzido") return { ...base, cor: "amarelo", detalhe: `Deduzido. ${trecho}`.trim() };
  return { ...base, cor: "verde", detalhe: `Escrito no e-mail. ${trecho}`.trim() };
}

function farolVerificador(c: Condicao, v: ChecagemVerificador[] | null): Farol {
  const base = { codigo: "LEI-08", grupo: "Leitura" as const, titulo: "Verificador independente confere a leitura" };
  if (v == null) return { ...base, cor: "amarelo", detalhe: "Verificador não executado (IA não configurada). Confira os campos contra o e-mail." };
  // discordância sobre campo que a pessoa já ajustou deixa de valer
  const minhas = v.filter((x) => x.condicao === c.ordem && !c.proveniencia[x.campo]?.ajustado);
  const discorda = minhas.filter((x) => x.veredito === "discorda");
  const duvida = minhas.filter((x) => x.veredito === "duvida");
  if (discorda.length) return { ...base, cor: "vermelho", detalhe: `Discorda: ${discorda.map((x) => `${x.campo} — ${x.comentario}`).join("; ")}` };
  if (duvida.length) return { ...base, cor: "amarelo", detalhe: `Dúvida: ${duvida.map((x) => `${x.campo} — ${x.comentario}`).join("; ")}` };
  return { ...base, cor: "verde", detalhe: "Concorda com todos os campos." };
}

// ---------- Cadastro ----------
function farolCadastroFornecedor(c: Condicao, ctx: ContextoFarois): Farol {
  const base = { codigo: "CAD-01", grupo: "Cadastro" as const, titulo: "Fornecedor existe no ERP" };
  const f = ctx.fornecedores.find((x) => x.cod_fornecedor === c.codFornecedor);
  if (!c.codFornecedor || !f) return { ...base, cor: "vermelho", detalhe: c.proveniencia.fornecedor?.resolucao ?? "Fornecedor não encontrado no ERP." };
  if (c.proveniencia.fornecedor?.ajustado) return { ...base, cor: "verde", detalhe: `${f.cod_fornecedor} ${f.razao_social} — selecionado na revisão.` };
  return { ...base, cor: "amarelo", detalhe: c.proveniencia.fornecedor?.resolucao ?? `${f.cod_fornecedor} ${f.razao_social} — inferido.` };
}

function farolCadastroLojas(c: Condicao, ctx: ContextoFarois): Farol {
  const base = { codigo: "CAD-02", grupo: "Cadastro" as const, titulo: "Lojas existem no ERP" };
  const p = c.proveniencia.lojas;
  if (!c.lojas.length) return { ...base, cor: "vermelho", detalhe: p?.pendentes?.length ? `Não encontrei: ${p.pendentes.join(", ")}.` : "Nenhuma loja definida." };
  const ruins = c.lojas.filter((l) => l !== "REDE" && !ctx.lojas.some((x) => x.cod_loja === l && x.status === "ATIVA"));
  if (ruins.length) return { ...base, cor: "vermelho", detalhe: `Inexistente ou inativa: ${ruins.join(", ")}.` };
  if (p?.pendentes?.length && !p.ajustado) return { ...base, cor: "vermelho", detalhe: `Não encontrei no ERP: ${p.pendentes.join(", ")}. Marque as lojas certas.` };
  if (p?.ajustado) return { ...base, cor: "verde", detalhe: "Lojas definidas na revisão." };
  if (c.lojas.length === 1 && c.lojas[0] === "REDE") return { ...base, cor: "verde", detalhe: "Toda a rede (REDE)." };
  return { ...base, cor: "amarelo", detalhe: p?.resolucao ? `Mapeadas por nome: ${p.resolucao}.` : "Mapeadas por nome." };
}

function farolCadastroCategoria(c: Condicao): Farol {
  const base = { codigo: "CAD-03", grupo: "Cadastro" as const, titulo: "Categoria existe no ERP" };
  if (!c.codCategoria) return { ...base, cor: "vermelho", detalhe: c.proveniencia.categoria?.resolucao ?? "Sem categoria correspondente." };
  if (c.proveniencia.categoria?.ajustado) return { ...base, cor: "verde", detalhe: `${CATEGORIA_LABEL[c.codCategoria]} — selecionada na revisão.` };
  return { ...base, cor: "amarelo", detalhe: c.proveniencia.categoria?.resolucao ?? `${c.codCategoria} — inferida do nome comercial.` };
}

// ---------- Política ----------
const intersectaLojas = (a: string[], b: string[]) => a.includes("REDE") || b.includes("REDE") || a.some((x) => b.includes(x));
const intersectaDatas = (a1: string, a2: string, b1: string, b2: string) => a1 <= b2 && b1 <= a2;

export function sobreposicoes(c: Condicao, condicoesErp: ErpCondicao[]) {
  if (!c.codFornecedor || !c.codCategoria || !c.lojas.length || !isISO(c.dataInicio) || !isISO(c.dataFim)) return [];
  return condicoesErp.filter(
    (k) =>
      k.status === "VIGENTE" &&
      k.cod_fornecedor === c.codFornecedor &&
      k.cod_categoria === c.codCategoria &&
      k.tipo === c.tipo && // P8: sobreposição só entre condições do mesmo tipo (leitura proposta)
      intersectaLojas(c.lojas, k.lojas) &&
      intersectaDatas(c.dataInicio!, c.dataFim!, k.data_inicio, k.data_fim),
  );
}

function faroisPolitica(c: Condicao, ctx: ContextoFarois): Farol[] {
  const out: Farol[] = [];
  const P = (codigo: string, titulo: string, ref: string) => ({ codigo, grupo: "Política" as const, titulo, ref });

  // §4 teto
  {
    const b = P("POL-04", "Desconto dentro do teto da categoria", "§4");
    if (c.tipo === "VERBA_EXPOSICAO") out.push({ ...b, cor: "cinza", detalhe: "Não se aplica a verba de exposição." });
    else if (c.percentual == null || !c.codCategoria) out.push({ ...b, cor: "vermelho", detalhe: "Faltam percentual ou categoria para conferir." });
    else {
      const teto = TETOS[c.codCategoria];
      const sazonal = TETO_SAZONAL[c.codCategoria];
      if (c.percentual <= teto) out.push({ ...b, cor: "verde", detalhe: `${fmtPct(c.percentual)} ≤ ${teto}% (${CATEGORIA_LABEL[c.codCategoria]}).` });
      else if (sazonal && c.percentual <= sazonal)
        out.push({
          ...b,
          cor: "vermelho",
          acao: "escalar",
          detalhe: `${fmtPct(c.percentual)} acima do teto de ${teto}%. A nota (*) da §4 admite até ${sazonal}% em campanha sazonal aprovada pelo Trade Marketing; não há essa aprovação no e-mail. Decisão D2: escalar à Diretoria (§11).`,
        });
      else out.push({ ...b, cor: "vermelho", detalhe: `${fmtPct(c.percentual)} acima do teto de ${teto}% para ${CATEGORIA_LABEL[c.codCategoria]}.` });
    }
  }
  // §5 alçada
  {
    const b = P("POL-05", "Alçada de aprovação", "§5");
    const a = alcada(c.tipo, c.percentual, c.valor);
    if (a.vedado)
      out.push({
        ...b,
        cor: "vermelho",
        acao: "escalar",
        detalhe: "A tabela da §5 veda desconto acima de 25%, mas a nota (*) da §4 permite até 30% em campanha sazonal. As regras se contradizem; a §11 manda levar à Diretoria Comercial.",
      });
    else if (a.nivel == null) out.push({ ...b, cor: "vermelho", detalhe: `Alçada ${a.label}.` });
    else out.push({ ...b, cor: "verde", detalhe: `Exige ${a.label}.` });
  }
  // §6 vigência
  {
    const b = P("POL-06a", "Vigência de até 12 meses", "§6");
    if (!isISO(c.dataInicio) || !isISO(c.dataFim)) out.push({ ...b, cor: "vermelho", detalhe: "Início e fim precisam estar definidos." });
    else if (c.dataFim < c.dataInicio) out.push({ ...b, cor: "vermelho", detalhe: "Fim anterior ao início." });
    else if (c.dataFim > fimMaximo(c.dataInicio, VIGENCIA_MAX_MESES))
      out.push({ ...b, cor: "vermelho", detalhe: `${fmtData(c.dataInicio)}–${fmtData(c.dataFim)} passa de 12 meses (máximo ${fmtData(fimMaximo(c.dataInicio, VIGENCIA_MAX_MESES))}).` });
    else out.push({ ...b, cor: "verde", detalhe: `${fmtData(c.dataInicio)} a ${fmtData(c.dataFim)}.` });
  }
  {
    const b = P("POL-06b", "Início não anterior à data do cadastro", "§6");
    if (!isISO(c.dataInicio)) out.push({ ...b, cor: "vermelho", detalhe: "Sem data de início." });
    else if (c.dataInicio < ctx.hoje)
      out.push({ ...b, cor: "vermelho", detalhe: `Início ${fmtData(c.dataInicio)} é anterior a hoje (${fmtData(ctx.hoje)}). Combine nova data com o fornecedor e ajuste.` });
    else out.push({ ...b, cor: "verde", detalhe: `Início ${fmtData(c.dataInicio)} ≥ hoje (${fmtData(ctx.hoje)}).` });
  }
  // §7 contrapartida
  {
    const b = P("POL-07", "Verba vinculada a contrapartida", "§7");
    if (c.tipo === "DESCONTO_PERCENTUAL") out.push({ ...b, cor: "cinza", detalhe: "Não se aplica a desconto." });
    else if (!c.contrapartida?.trim()) out.push({ ...b, cor: "vermelho", detalhe: "Toda verba precisa de contrapartida descrita." });
    else out.push({ ...b, cor: "verde", detalhe: "Contrapartida descrita; período e lojas são os da condição." });
  }
  // §8 fornecedor ativo
  {
    const b = P("POL-08", "Fornecedor com cadastro ativo", "§8");
    const f = ctx.fornecedores.find((x) => x.cod_fornecedor === c.codFornecedor);
    if (!f) out.push({ ...b, cor: "vermelho", detalhe: "Fornecedor não identificado no ERP." });
    else if (f.status !== "ATIVO")
      out.push({ ...b, cor: "vermelho", detalhe: `${f.razao_social} está ${f.status} desde ${fmtData(f.data_inativacao)} (${f.motivo_inativacao}). Precisa regularizar com Cadastro.` });
    else out.push({ ...b, cor: "verde", detalhe: `${f.razao_social}: ativo.` });
  }
  // §9 sobreposição
  {
    const b = P("POL-09", "Sem sobreposição com condição vigente", "§9");
    const ov = sobreposicoes(c, ctx.condicoesErp);
    const semDecisao = ov.filter((k) => k.cod_condicao !== c.codCondicaoSubstituida);
    const irmasConflito = ctx.irmas.filter(
      (s) =>
        s.id !== c.id && s.tipo === c.tipo && s.codFornecedor === c.codFornecedor && s.codCategoria === c.codCategoria &&
        s.lojas.length > 0 && c.lojas.length > 0 && intersectaLojas(s.lojas, c.lojas) &&
        isISO(s.dataInicio) && isISO(s.dataFim) && isISO(c.dataInicio) && isISO(c.dataFim) &&
        intersectaDatas(s.dataInicio!, s.dataFim!, c.dataInicio!, c.dataFim!),
    );
    const divergencias = ov
      .map((k) => {
        const e = ctx.extrato.find((x) => x.cod_condicao === k.cod_condicao);
        const ext = c.tipo === "DESCONTO_PERCENTUAL" ? e?.percentual : e?.valor;
        const viva = c.tipo === "DESCONTO_PERCENTUAL" ? k.percentual : k.valor;
        return e && ext != null && viva != null && ext !== viva
          ? `${k.cod_condicao}: extrato de ontem ${fmtValor({ tipo: c.tipo, percentual: ext, valor: ext })}, ERP agora ${fmtValor({ tipo: c.tipo, percentual: viva, valor: viva })}${k.alterado_por ? ` (alterado por ${k.alterado_por} em ${new Date(k.ultima_alteracao).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })})` : ""}`
          : null;
      })
      .filter(Boolean);
    if (semDecisao.length)
      out.push({
        ...b,
        cor: "vermelho",
        acao: semDecisao.length === 1 ? "substituir" : undefined,
        detalhe: `Já existe ${semDecisao.map((k) => `${k.cod_condicao} (${fmtValor(k)}, ${fmtData(k.data_inicio)}–${fmtData(k.data_fim)}, ${k.lojas.length} loja(s))`).join("; ")}. Substitua ou ajuste período/lojas.${divergencias.length ? ` Atenção: ${divergencias.join("; ")}.` : ""}`,
      });
    else if (irmasConflito.length) out.push({ ...b, cor: "vermelho", detalhe: "Duas condições do mesmo tipo neste e-mail cobrem as mesmas lojas e datas." });
    else if (divergencias.length) out.push({ ...b, cor: "amarelo", detalhe: `Substitui ${c.codCondicaoSubstituida} (encerra em ${fmtData(addDias(c.dataInicio!, -1))}). ${divergencias.join("; ")}. Confirme com quem alterou.` });
    else if (c.codCondicaoSubstituida) out.push({ ...b, cor: "verde", detalhe: `Substitui ${c.codCondicaoSubstituida} (encerra em ${fmtData(addDias(c.dataInicio!, -1))}).` });
    else out.push({ ...b, cor: "verde", detalhe: "Nenhuma condição vigente do mesmo tipo, fornecedor, categoria e loja no período." });
  }
  // §10 formalização
  {
    const b = P("POL-10", "Formalizada por e-mail do fornecedor", "§10");
    const f = ctx.fornecedores.find((x) => x.cod_fornecedor === c.codFornecedor);
    const dom = normalizar(ctx.dominioRemetente.split(".")[0]);
    if (!ctx.origemRef) out.push({ ...b, cor: "vermelho", detalhe: "Sem referência do e-mail de origem." });
    else if (f && normalizar(f.razao_social).split(" ").some((t) => t.length > 3 && dom.includes(t)))
      out.push({ ...b, cor: "verde", detalhe: `Remetente @${ctx.dominioRemetente} compatível com ${f.razao_social}. Origem ${ctx.origemRef}.` });
    else out.push({ ...b, cor: "amarelo", detalhe: `Remetente @${ctx.dominioRemetente || "?"} não confere com o nome do fornecedor no ERP. Origem ${ctx.origemRef}.` });
  }
  return out;
}

// ---------- Contrato do ERP ----------
export function montarPayload(c: Condicao, aprovador: Pick<Aprovador, "matricula" | "nome">, origemRef: string): PayloadCondicao {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const p: PayloadCondicao = {
    cod_fornecedor: c.codFornecedor ?? "",
    cod_categoria: c.codCategoria ?? "",
    tipo: c.tipo,
    lojas: c.lojas,
    data_inicio: c.dataInicio ?? "",
    data_fim: c.dataFim ?? "",
    aprovador: { matricula: aprovador.matricula, nome: aprovador.nome },
    origem: { tipo: "EMAIL", referencia: origemRef },
  };
  if (c.tipo === "DESCONTO_PERCENTUAL" && c.percentual != null) p.percentual = r2(c.percentual);
  if (c.tipo === "VERBA_EXPOSICAO" && c.valor != null) p.valor = r2(c.valor);
  if (c.contrapartida?.trim()) p.contrapartida = c.contrapartida.trim().slice(0, 500);
  if (c.codCondicaoSubstituida) p.cod_condicao_substituida = c.codCondicaoSubstituida;
  return p;
}

function farolContrato(c: Condicao, ctx: ContextoFarois): Farol {
  const base = { codigo: "ERP-01", grupo: "Contrato do ERP" as const, titulo: "Formato aceito pelo ERP" };
  // aprovador ainda não existe na revisão: valida o resto com um aprovador provisório
  const p = montarPayload(c, { matricula: "000000", nome: "(na aprovação)" }, ctx.origemRef ?? "");
  const erros = validarPayload(JSON.parse(JSON.stringify(p)), new Set(ctx.lojas.map((l) => l.cod_loja)));
  if (erros.length) return { ...base, cor: "vermelho", detalhe: erros.map((e) => `${e.campo}: ${e.erro}`).join("; ") };
  return { ...base, cor: "verde", detalhe: "Payload no schema condicao_post." };
}

// ---------- montagem ----------
export function calcularFarois(c: Condicao, ctx: ContextoFarois): Farol[] {
  return [
    farolLeitura(c, "fornecedor", "LEI-01", "Fornecedor identificado no e-mail"),
    farolLeitura(c, "categoria", "LEI-02", "Linha de produtos (categoria)", { sempreDeduzido: true }),
    farolLeitura(c, "lojas", "LEI-03", "Lojas"),
    farolLeitura(c, "valor", "LEI-04", c.tipo === "DESCONTO_PERCENTUAL" ? "Percentual de desconto" : "Valor da verba"),
    farolLeitura(c, "data_inicio", "LEI-05", "Início da vigência"),
    farolLeitura(c, "data_fim", "LEI-06", "Fim da vigência"),
    farolLeitura(c, "contrapartida", "LEI-07", "Contrapartida", { ausenteOk: c.tipo === "DESCONTO_PERCENTUAL" }),
    farolVerificador(c, ctx.verificador),
    farolCadastroFornecedor(c, ctx),
    farolCadastroLojas(c, ctx),
    farolCadastroCategoria(c),
    ...faroisPolitica(c, ctx),
    farolContrato(c, ctx),
  ];
}

// LEI-09 é da negociação inteira (o e-mail), não de uma condição
export function farolInstrucaoSuspeita(instrucoes: { trecho: string; motivo: string }[]): Farol {
  const base = { codigo: "LEI-09", grupo: "Leitura" as const, titulo: "E-mail sem instrução dirigida ao sistema" };
  if (!instrucoes.length) return { ...base, cor: "verde", detalhe: "Nenhum texto tentando comandar o processamento." };
  return { ...base, cor: "vermelho", acao: "escalar", detalhe: `Encontrado: ${instrucoes.map((i) => `“${i.trecho}”`).join(" ")}. Texto ignorado; negociação escalada sem liberação (S33).` };
}

export type ResultadoAprovacao = { ok: true } | { ok: false; motivo: string };

export function podeAprovar(farois: Farol[], aprovador: Aprovador | undefined, c: Condicao, conferido: boolean): ResultadoAprovacao {
  const vermelhos = farois.filter((f) => f.cor === "vermelho");
  if (vermelhos.length) return { ok: false, motivo: `Resolva antes: ${vermelhos.map((f) => f.codigo).join(", ")}.` };
  const amarelos = farois.filter((f) => f.cor === "amarelo");
  if (amarelos.length && !conferido) return { ok: false, motivo: `Marque "Conferi os ${amarelos.length} itens deduzidos".` };
  if (!aprovador) return { ok: false, motivo: "Escolha quem aprova." };
  const a = alcada(c.tipo, c.percentual, c.valor);
  if (a.nivel == null) return { ok: false, motivo: "Alçada indefinida." };
  if (aprovador.nivel < a.nivel) return { ok: false, motivo: `${aprovador.nome} (${aprovador.cargo}) não tem alçada: exige ${a.label}.` };
  return { ok: true };
}

export const contarCores = (farois: Farol[]) => ({
  verde: farois.filter((f) => f.cor === "verde").length,
  amarelo: farois.filter((f) => f.cor === "amarelo").length,
  vermelho: farois.filter((f) => f.cor === "vermelho").length,
  cinza: farois.filter((f) => f.cor === "cinza").length,
});
