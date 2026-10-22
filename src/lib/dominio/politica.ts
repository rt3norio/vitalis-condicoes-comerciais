// POL-COM-004 v3.2 em código. Fonte: data/dataset/Politica_Comercial.pdf (cópia em public/politica-comercial.pdf).
import type { Aprovador, Categoria, TipoCondicao } from "./tipos";

// §4 — teto de desconto por categoria
export const TETOS: Record<Categoria, number> = {
  GENERICOS: 15,
  MEDICAMENTOS_REFERENCIA: 12,
  MIP: 18,
  HIGIENE_BELEZA: 20,
  DERMOCOSMETICOS: 20,
  SUPLEMENTOS: 20,
};
// §4 nota (*): campanha sazonal aprovada pelo Trade Marketing
export const TETO_SAZONAL: Partial<Record<Categoria, number>> = { GENERICOS: 30, MIP: 30 };

// §5 — alçadas
export const NIVEIS = ["Coordenação Comercial", "Gerência Comercial", "Diretoria Comercial", "Comitê Comercial"] as const;

export type Alcada = { nivel: number | null; label: string; vedado: boolean };

export function alcada(tipo: TipoCondicao, percentual: number | null, valor: number | null): Alcada {
  if (tipo === "DESCONTO_PERCENTUAL") {
    if (percentual == null) return { nivel: null, label: "indefinida (sem percentual)", vedado: false };
    if (percentual > 25) return { nivel: null, label: "Vedado (acima de 25%)", vedado: true };
    if (percentual > 20) return { nivel: 2, label: NIVEIS[2], vedado: false };
    if (percentual > 10) return { nivel: 1, label: NIVEIS[1], vedado: false };
    return { nivel: 0, label: NIVEIS[0], vedado: false };
  }
  if (valor == null) return { nivel: null, label: "indefinida (sem valor)", vedado: false };
  if (valor > 20000) return { nivel: 3, label: NIVEIS[3], vedado: false };
  if (valor > 5000) return { nivel: 2, label: NIVEIS[2], vedado: false };
  return { nivel: 1, label: NIVEIS[1], vedado: false };
}

// §6 — vigência máxima de 12 meses
export const VIGENCIA_MAX_MESES = 12;

// Pendência P9: o dataset não traz aprovadores. Lista fictícia, declarada como premissa.
export const APROVADORES: Aprovador[] = [
  { matricula: "004101", nome: "Beatriz Lacerda", cargo: "Coordenadora Comercial", nivel: 0 },
  { matricula: "004212", nome: "Carlos Duarte", cargo: "Gerente Comercial", nivel: 1 },
  { matricula: "004330", nome: "Marina Figueiredo", cargo: "Diretora Comercial", nivel: 2 },
  { matricula: "004999", nome: "Comitê Comercial (ata)", cargo: "Comitê Comercial", nivel: 3 },
];
