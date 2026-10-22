// Entrada do Redator: o resultado JÁ calculado pelo sistema (faróis, alçada). Usado pela tarefa e pelo script de cache.
import { fmtBRL, fmtPct } from "../dominio/datas";
import { alcada } from "../dominio/politica";
import type { TipoCondicao } from "../dominio/tipos";

type CondicaoMin = { id: number; titulo: string; tipo: TipoCondicao; percentual: number | null; valor: number | null };
type FarolMin = { condicaoId: number | null; cor: string; codigo: string; titulo: string; detalhe: string };

export function dadosRedator(neg: { status: string; motivoSaida: string | null; remetente: string; assunto: string }, conds: CondicaoMin[], fs: FarolMin[]) {
  return {
    status: neg.status,
    motivo: neg.motivoSaida,
    fornecedor_remetente: neg.remetente,
    assunto: neg.assunto,
    condicoes: conds.map((c) => ({
      condicao: c.titulo,
      valor: c.tipo === "DESCONTO_PERCENTUAL" ? fmtPct(c.percentual) : fmtBRL(c.valor),
      alcada: alcada(c.tipo, c.percentual, c.valor).label,
      vermelhos: fs.filter((f) => f.condicaoId === c.id && f.cor === "vermelho").map((f) => `${f.codigo} ${f.titulo}: ${f.detalhe}`),
      amarelos: fs.filter((f) => f.condicaoId === c.id && f.cor === "amarelo").map((f) => `${f.codigo} ${f.titulo}`),
    })),
  };
}
