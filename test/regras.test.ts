// Faróis de Cadastro e Política contra os 4 e-mails do dataset (leitura de referência).
import { describe, expect, it } from "vitest";
import referencia from "../data/leituras-referencia.json";
import type { Extracao } from "../src/lib/agentes/schemas";
import { capturaErp, emailsDataset, extrato } from "../src/lib/dominio/dataset";
import { APROVADORES } from "../src/lib/dominio/politica";
import type { Condicao, Farol } from "../src/lib/dominio/tipos";
import { condicoesDaLeitura } from "../src/lib/regras/condicoes-da-leitura";
import { calcularFarois, farolInstrucaoSuspeita, podeAprovar, type ContextoFarois } from "../src/lib/regras/farois";

const leituras = referencia as unknown as Record<string, Extracao>;

function preparar(chave: string, hoje = "2026-09-30") {
  const email = emailsDataset.find((e) => e.chave === chave)!;
  const conds = condicoesDaLeitura(leituras[chave], email.dominio, capturaErp.fornecedores, capturaErp.lojas).map((c, i) => ({ ...c, id: i + 1 }) as Condicao);
  const ctx = (c: Condicao[]): ContextoFarois => ({
    fornecedores: capturaErp.fornecedores,
    lojas: capturaErp.lojas,
    condicoesErp: capturaErp.condicoes,
    extrato,
    hoje,
    dominioRemetente: email.dominio,
    origemRef: email.messageId,
    irmas: c,
    verificador: [],
  });
  return { conds, ctx, email };
}
const cor = (fs: Farol[], cod: string) => fs.find((f) => f.codigo === cod)?.cor;

describe("Alfa — 28% genéricos", () => {
  const { conds, ctx } = preparar("alfa");
  const f = calcularFarois(conds[0], ctx(conds));
  it("resolve fornecedor, categoria e rede", () => {
    expect(conds[0].codFornecedor).toBe("FORN-001");
    expect(conds[0].codCategoria).toBe("GENERICOS");
    expect(conds[0].lojas).toEqual(["REDE"]);
  });
  it("teto e alçada vermelhos, com ação escalar (D2)", () => {
    expect(cor(f, "POL-04")).toBe("vermelho");
    expect(f.find((x) => x.codigo === "POL-04")?.acao).toBe("escalar");
    expect(cor(f, "POL-05")).toBe("vermelho");
  });
  it("sem sobreposição com COND-001 (outra categoria)", () => expect(cor(f, "POL-09")).toBe("verde"));
  it("não aprova nem pela Diretoria", () => expect(podeAprovar(f, APROVADORES[2], conds[0], true).ok).toBe(false));
});

describe("Gama — desconto + verba", () => {
  const { conds, ctx } = preparar("gama");
  it("mapeia as 4 lojas por nome (amarelo)", () => {
    expect(conds[0].lojas).toEqual(["LOJA-101", "LOJA-102", "LOJA-103", "LOJA-109"]);
    expect(cor(calcularFarois(conds[0], ctx(conds)), "CAD-02")).toBe("amarelo");
  });
  it("12% × 12,5% e fim ausente travam", () => {
    const f = calcularFarois(conds[0], ctx(conds));
    expect(cor(f, "LEI-04")).toBe("vermelho");
    expect(cor(f, "LEI-06")).toBe("vermelho");
    expect(cor(f, "POL-07")).toBe("cinza");
  });
  it("resolvido: Gerência aprova o desconto; Coordenação não", () => {
    const d: Condicao = structuredClone(conds[0]);
    d.percentual = 12.5;
    d.proveniencia.valor!.ajustado = true;
    d.dataFim = "2026-12-31";
    d.proveniencia.data_fim!.sugestaoAceita = true;
    d.proveniencia.data_fim!.ajustado = true;
    const f = calcularFarois(d, ctx([d, conds[1]]));
    expect(f.filter((x) => x.cor === "vermelho").map((x) => x.codigo)).toEqual([]);
    expect(cor(f, "LEI-06")).toBe("amarelo"); // sugestão aceita continua suposição
    expect(podeAprovar(f, APROVADORES[1], d, false).ok).toBe(false); // falta conferir amarelos
    expect(podeAprovar(f, APROVADORES[0], d, true).ok).toBe(false);
    expect(podeAprovar(f, APROVADORES[1], d, true).ok).toBe(true);
  });
  it("verba R$ 8.000 exige Diretoria; desconto e verba não se sobrepõem (P8)", () => {
    const v: Condicao = { ...structuredClone(conds[1]), dataFim: "2026-12-31" };
    const f = calcularFarois(v, ctx([conds[0], v]));
    expect(cor(f, "POL-09")).toBe("verde");
    expect(cor(f, "POL-04")).toBe("cinza");
    expect(cor(f, "POL-07")).toBe("verde");
    expect(podeAprovar(f, APROVADORES[1], v, true).ok).toBe(false);
    expect(podeAprovar(f, APROVADORES[2], v, true).ok).toBe(true);
  });
});

describe("Beta — sobreposição com COND-003", () => {
  const { conds, ctx } = preparar("beta");
  it("lojas Tijuca/Méier/Botafogo e HPC", () => {
    expect(conds[0].lojas).toEqual(["LOJA-104", "LOJA-107", "LOJA-112"]);
    expect(conds[0].codCategoria).toBe("HIGIENE_BELEZA");
  });
  it("vermelho com ação substituir; amarelo após substituir (ERP 11% × extrato 10%)", () => {
    const f = calcularFarois(conds[0], ctx(conds));
    expect(cor(f, "POL-09")).toBe("vermelho");
    expect(f.find((x) => x.codigo === "POL-09")?.acao).toBe("substituir");
    const s = { ...conds[0], codCondicaoSubstituida: "COND-003" };
    const f2 = calcularFarois(s, ctx([s]));
    expect(cor(f2, "POL-09")).toBe("amarelo");
    expect(f2.find((x) => x.codigo === "POL-09")?.detalhe).toContain("ACOSTA");
  });
});

describe("Nutrivida — inativo e instrução suspeita", () => {
  const { conds, ctx } = preparar("nutrivida");
  const f = calcularFarois(conds[0], ctx(conds));
  it("fornecedor inativo vermelho", () => {
    expect(conds[0].codFornecedor).toBe("FORN-005");
    expect(cor(f, "POL-08")).toBe("vermelho");
  });
  it("vigência de exatamente 12 meses é permitida", () => expect(cor(f, "POL-06a")).toBe("verde"));
  it("LEI-09 vermelho", () => expect(farolInstrucaoSuspeita(leituras.nutrivida.instrucoes_suspeitas).cor).toBe("vermelho"));
  it("LEI-09 não expõe o trecho nem o que ele pedia (só marca e escala)", () => {
    const l = farolInstrucaoSuspeita(leituras.nutrivida.instrucoes_suspeitas);
    for (const i of leituras.nutrivida.instrucoes_suspeitas) expect(l.detalhe).not.toContain(i.trecho.slice(0, 20));
    expect(l.detalhe).toBe("Escalado à Diretoria Comercial.");
  });
});

describe("Divergência corpo × anexo por regra", () => {
  it("IA lista só a versão do anexo: ainda vira divergência com as duas opções", () => {
    const ex = structuredClone(leituras.gama);
    ex.condicoes[0].valor.alternativas = [{ valor: 12.5, origem: "planilha anexa", trecho: "12,5%" }];
    const email = emailsDataset.find((e) => e.chave === "gama")!;
    const [d] = condicoesDaLeitura(ex, email.dominio, capturaErp.fornecedores, capturaErp.lojas);
    expect(d.proveniencia.valor?.alternativas?.map((a) => a.valor)).toEqual([12, 12.5]);
    const { ctx } = preparar("gama");
    expect(cor(calcularFarois({ ...d, id: 1 } as Condicao, ctx([])), "LEI-04")).toBe("vermelho");
  });
});

describe("Ciência por item amarelo", () => {
  it("vale para o texto do farol; muda o texto, perde a ciência", async () => {
    const { amarelosSemCiencia, chaveCiencia } = await import("../src/lib/regras/ciencia");
    const f = { codigo: "CAD-02", condicaoId: 7, cor: "amarelo", detalhe: "Méier → LOJA-107" };
    const c = { [chaveCiencia("CAD-02", 7)]: { em: "2026-10-22T10:00:00Z", detalhe: "Méier → LOJA-107" } };
    expect(amarelosSemCiencia([f], c)).toHaveLength(0);
    expect(amarelosSemCiencia([{ ...f, detalhe: "Méier, Tijuca → ..." }], c)).toHaveLength(1);
    expect(amarelosSemCiencia([{ ...f, cor: "verde" }], {})).toHaveLength(0);
  });
});

describe("D1 — data real", () => {
  it("com hoje = 22/10/2026 o início 01/10 fica vermelho (P1)", () => {
    const { conds, ctx } = preparar("beta", "2026-10-22");
    expect(cor(calcularFarois(conds[0], ctx(conds)), "POL-06b")).toBe("vermelho");
  });
});

describe("D18/D21 — texto suspeito: a proposta não segue", () => {
  it("texto ao fornecedor pede novo e-mail e não cita o trecho; memorando pede validação", async () => {
    const { textoPadrao, resumoPadrao } = await import("../src/lib/agentes/textos-padrao");
    const { conds, email } = preparar("nutrivida");
    const fs = [{ ...farolInstrucaoSuspeita(leituras.nutrivida.instrucoes_suspeitas), condicaoId: null }];
    const neg = { status: "escalado", remetente: email.remetente, assunto: email.assunto, motivoSaida: "Texto suspeito no e-mail. Escalado à Diretoria Comercial.", messageId: email.messageId };
    const forn = textoPadrao("fornecedor", neg, conds, fs);
    expect(forn).toContain("nova proposta em um novo e-mail");
    expect(forn).not.toMatch(/data|ajust|suspeit/i);
    for (const i of leituras.nutrivida.instrucoes_suspeitas) expect(forn).not.toContain(i.trecho.slice(0, 20));
    expect(textoPadrao("diretoria", neg, conds, fs)).toContain("valide este encaminhamento");
    expect(resumoPadrao(conds, fs).at(-1)).toContain("novo contato do fornecedor");
  });
});
