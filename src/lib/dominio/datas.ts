// Datas como texto AAAA-MM-DD, sem fuso: evita deslocamento de um dia entre servidor e navegador.

const toUTC = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUTC = (t: number) => new Date(t).toISOString().slice(0, 10);

export const isISO = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUTC(s));

export const addDias = (iso: string, n: number) => fromUTC(toUTC(iso) + n * 86_400_000);

// Último dia permitido para uma vigência de `meses` a partir de `inicio` (01/10/2026 + 12m → 30/09/2027)
export function fimMaximo(inicio: string, meses: number) {
  const [y, m, d] = inicio.split("-").map(Number);
  return addDias(fromUTC(Date.UTC(y, m - 1 + meses, d)), -1);
}

// Decisão D1: data de operação = data real, no fuso de São Paulo
export function hoje(agora: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export const fmtData = (iso: string | null | undefined) => (isISO(iso) ? iso.split("-").reverse().join("/") : "—");

export const fmtDataHora = (t: Date | string | number | null | undefined) =>
  t == null
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(t));

export const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${String(v).replace(".", ",")}%`);

export const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
