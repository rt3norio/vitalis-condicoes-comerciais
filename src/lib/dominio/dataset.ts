// Leitura do dataset do case (data/dataset). Só servidor.
import fs from "node:fs";
import path from "node:path";
import type { TipoCondicao } from "./tipos";

const RAIZ = path.join(process.cwd(), "data", "dataset");
const ler = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), "utf8");

export type ErpFornecedor = {
  cod_fornecedor: string;
  razao_social: string;
  cnpj: string;
  status: string;
  data_inativacao: string | null;
  motivo_inativacao: string | null;
};
export type ErpLoja = { cod_loja: string; nome: string; municipio: string; uf: string; status: string };
export type ErpCondicao = {
  cod_condicao: string;
  cod_fornecedor: string;
  cod_categoria: string;
  tipo: TipoCondicao;
  lojas: string[];
  data_inicio: string;
  data_fim: string;
  status: string;
  criado_em: string;
  ultima_alteracao: string;
  percentual?: number;
  valor?: number;
  contrapartida?: string;
  alterado_por?: string;
};

// Captura do ERP de 30/09/2026 08:15 — semente do ERP simulado de cada sessão
export const capturaErp = {
  consultadoEm: "2026-09-30T08:15:00-03:00",
  fornecedores: JSON.parse(ler("mock_erp", "respostas", "GET_fornecedores.json")).itens as ErpFornecedor[],
  lojas: JSON.parse(ler("mock_erp", "respostas", "GET_lojas.json")).itens as ErpLoja[],
  condicoes: JSON.parse(ler("mock_erp", "respostas", "GET_condicoes.json")).itens as ErpCondicao[],
};

// ---------- extrato_erp.csv (export de 29/09 06:00) ----------
export type LinhaExtrato = {
  cod_condicao: string;
  cod_fornecedor: string;
  cod_categoria: string;
  tipo: TipoCondicao;
  lojas: string[];
  percentual: number | null;
  valor: number | null;
  data_inicio: string;
  data_fim: string;
  status: string;
};

export function parseExtrato(csv: string): LinhaExtrato[] {
  const [cab, ...linhas] = csv.trim().split(/\r?\n/);
  const cols = cab.split(";");
  const num = (s: string) => (s === "" ? null : Number(s.replace(/\./g, "").replace(",", ".")));
  const iso = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const porId = new Map<string, LinhaExtrato>();
  for (const l of linhas) {
    const v = Object.fromEntries(l.split(";").map((x, i) => [cols[i], x]));
    const atual = porId.get(v.COND_ID) ?? {
      cod_condicao: v.COND_ID,
      cod_fornecedor: v.COD_FORN,
      cod_categoria: v.CATEG,
      tipo: (v.TP_COND === "DESC" ? "DESCONTO_PERCENTUAL" : "VERBA_EXPOSICAO") as TipoCondicao,
      lojas: [],
      percentual: num(v.VLR_PCT),
      valor: num(v.VLR_BRL),
      data_inicio: iso(v.DT_INI),
      data_fim: iso(v.DT_FIM),
      status: v.STATUS,
    };
    atual.lojas.push(v.COD_LOJA);
    porId.set(v.COND_ID, atual);
  }
  return [...porId.values()];
}

export const extrato = parseExtrato(ler("extrato_erp.csv"));

// ---------- e-mails ----------
export type EmailBruto = {
  chave: string;
  bruto: string;
  messageId: string;
  remetente: string;
  dominio: string;
  assunto: string;
  data: string;
  corpo: string;
  anexos: { nome: string; texto: string }[];
};

export function parseEml(bruto: string, chave: string, anexos: { nome: string; texto: string }[] = []): EmailBruto {
  const sep = bruto.search(/\r?\n\r?\n/);
  const cab = sep >= 0 ? bruto.slice(0, sep) : "";
  const corpo = sep >= 0 ? bruto.slice(sep).replace(/^\r?\n\r?\n/, "") : bruto;
  const h: Record<string, string> = {};
  cab
    .replace(/\r?\n[ \t]+/g, " ")
    .split(/\r?\n/)
    .forEach((l) => {
      const i = l.indexOf(":");
      if (i > 0) h[l.slice(0, i).toLowerCase()] = l.slice(i + 1).trim();
    });
  const remetente = h.from ?? "";
  const endereco = (remetente.match(/<([^>]+)>/)?.[1] ?? remetente).trim();
  return {
    chave,
    bruto,
    messageId: h["message-id"] ?? `<${chave}@sem-message-id>`,
    remetente,
    dominio: endereco.split("@")[1] ?? "",
    assunto: h.subject ?? "(sem assunto)",
    data: h.date ? new Date(h.date).toISOString() : new Date().toISOString(),
    corpo,
    anexos,
  };
}

const ARQUIVOS = [
  { chave: "alfa", arquivo: "2026-09-28_0912_alfa.eml", anexos: [] as string[] },
  { chave: "gama", arquivo: "2026-09-28_1640_gama.eml", anexos: ["proposta_gama_q4.csv"] },
  { chave: "beta", arquivo: "2026-09-29_1005_beta.eml", anexos: [] },
  { chave: "nutrivida", arquivo: "2026-09-29_1830_nutrivida.eml", anexos: [] },
];

export const emailsDataset: EmailBruto[] = ARQUIVOS.map((a) =>
  parseEml(
    ler("emails", a.arquivo),
    a.chave,
    a.anexos.map((n) => ({ nome: n, texto: ler("emails", "anexos", n) })),
  ),
);
