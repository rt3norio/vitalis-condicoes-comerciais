// Contrato do POST /condicoes (mock_erp/schema/condicao_post.schema.json). Usado pelo farol ERP-01,
// pelo cliente antes de enviar e pelo próprio ERP simulado ao validar.
import { CATEGORIAS } from "../dominio/tipos";
import { isISO } from "../dominio/datas";

export type PayloadCondicao = {
  cod_fornecedor: string;
  cod_categoria: string;
  tipo: "DESCONTO_PERCENTUAL" | "VERBA_EXPOSICAO";
  lojas: string[];
  percentual?: number;
  valor?: number;
  data_inicio: string;
  data_fim: string;
  contrapartida?: string;
  cod_condicao_substituida?: string;
  aprovador: { matricula: string; nome: string };
  origem: { tipo: "EMAIL"; referencia: string };
};

export type ErroCampo = { campo: string; erro: string };

const PERMITIDOS = new Set([
  "cod_fornecedor", "cod_categoria", "tipo", "lojas", "percentual", "valor", "data_inicio", "data_fim",
  "contrapartida", "cod_condicao_substituida", "aprovador", "origem",
]);

const centavos = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;

// `lojasExistentes` opcional: o ERP checa existência; o farol de cadastro já cobre isso antes.
export function validarPayload(b: Record<string, unknown>, lojasExistentes?: Set<string>): ErroCampo[] {
  const e: ErroCampo[] = [];
  const obrig = ["cod_fornecedor", "cod_categoria", "tipo", "lojas", "data_inicio", "data_fim", "aprovador", "origem"];
  for (const k of obrig) if (b[k] == null || b[k] === "") e.push({ campo: k, erro: "obrigatório" });
  if (typeof b.cod_fornecedor === "string" && !/^FORN-\d{3}$/.test(b.cod_fornecedor)) e.push({ campo: "cod_fornecedor", erro: "formato FORN-###" });
  if (b.cod_categoria != null && !CATEGORIAS.includes(b.cod_categoria as never)) e.push({ campo: "cod_categoria", erro: "fora do enum" });
  if (b.tipo != null && b.tipo !== "DESCONTO_PERCENTUAL" && b.tipo !== "VERBA_EXPOSICAO") e.push({ campo: "tipo", erro: "fora do enum" });
  if (b.lojas != null) {
    if (!Array.isArray(b.lojas)) e.push({ campo: "lojas", erro: "deve ser lista" });
    else {
      if (!b.lojas.length) e.push({ campo: "lojas", erro: "mínimo 1 item" });
      b.lojas.forEach((l, i) => {
        if (typeof l !== "string" || !/^(LOJA-\d{3}|REDE)$/.test(l)) e.push({ campo: `lojas[${i}]`, erro: "formato LOJA-### ou REDE" });
        else if (lojasExistentes && l !== "REDE" && !lojasExistentes.has(l)) e.push({ campo: `lojas[${i}]`, erro: `loja inexistente: ${l}` });
      });
    }
  }
  if (b.tipo === "DESCONTO_PERCENTUAL") {
    const p = b.percentual;
    if (p == null) e.push({ campo: "percentual", erro: "obrigatório quando tipo = DESCONTO_PERCENTUAL" });
    else if (typeof p !== "number" || !(p > 0 && p <= 100) || !centavos(p)) e.push({ campo: "percentual", erro: "número > 0 e ≤ 100, até 2 casas" });
    if (b.valor != null) e.push({ campo: "valor", erro: "proibido em DESCONTO_PERCENTUAL" });
  }
  if (b.tipo === "VERBA_EXPOSICAO") {
    const v = b.valor;
    if (v == null) e.push({ campo: "valor", erro: "obrigatório quando tipo = VERBA_EXPOSICAO" });
    else if (typeof v !== "number" || !(v > 0) || !centavos(v)) e.push({ campo: "valor", erro: "número > 0, até 2 casas" });
    if (b.percentual != null) e.push({ campo: "percentual", erro: "proibido em VERBA_EXPOSICAO" });
  }
  for (const k of ["data_inicio", "data_fim"]) if (b[k] != null && !isISO(b[k])) e.push({ campo: k, erro: "formato AAAA-MM-DD" });
  if (typeof b.contrapartida === "string" && b.contrapartida.length > 500) e.push({ campo: "contrapartida", erro: "máximo 500 caracteres" });
  if (b.cod_condicao_substituida != null && !/^COND-\d{3}$/.test(String(b.cod_condicao_substituida))) e.push({ campo: "cod_condicao_substituida", erro: "formato COND-###" });
  const ap = b.aprovador as { matricula?: unknown; nome?: unknown } | undefined;
  if (ap && (typeof ap.matricula !== "string" || typeof ap.nome !== "string")) e.push({ campo: "aprovador", erro: "matricula e nome obrigatórios" });
  const or = b.origem as { tipo?: unknown; referencia?: unknown } | undefined;
  if (or && (or.tipo !== "EMAIL" || typeof or.referencia !== "string" || !or.referencia)) e.push({ campo: "origem", erro: "tipo EMAIL e referencia obrigatórios" });
  for (const k of Object.keys(b)) if (!PERMITIDOS.has(k)) e.push({ campo: k, erro: "campo não permitido" });
  return e;
}
