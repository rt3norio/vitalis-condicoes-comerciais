// Leitura do Extrator (texto + evidência) → condições com códigos do ERP. A IA não escolhe código:
// o casamento nome → código é feito aqui, por regra (resolver.ts).
import type { Extracao } from "../agentes/schemas";
import type { ErpFornecedor, ErpLoja } from "../dominio/dataset";
import { isISO } from "../dominio/datas";
import type { CampoCondicao, Categoria, Condicao, Proveniencia } from "../dominio/tipos";
import { resolverCategoria, resolverFornecedor, resolverLojas } from "./resolver";

type CampoLido = Extracao["condicoes"][number]["categoria"] | Extracao["condicoes"][number]["valor"] | Extracao["condicoes"][number]["lojas"];

function prov(c: CampoLido): Proveniencia {
  const p: Proveniencia = { certeza: c.certeza, trecho: c.trecho };
  if (c.alternativas?.length > 1) p.alternativas = c.alternativas.map((a) => ({ valor: a.valor as string | number, origem: a.origem, trecho: a.trecho }));
  if (c.sugestao) p.sugestao = { valor: c.sugestao.valor as string | number, motivo: c.sugestao.motivo };
  return p;
}

export type CondicaoNova = Omit<Condicao, "id">;

type Historico = { cod_fornecedor: string; cod_categoria: string }[];

export function condicoesDaLeitura(ex: Extracao, dominio: string, fornecedores: ErpFornecedor[], lojas: ErpLoja[], historico: Historico = []): CondicaoNova[] {
  const forn = resolverFornecedor(ex.fornecedor.valor, dominio, fornecedores);
  const diretas = ex.condicoes.map((k) => resolverCategoria(k.categoria.valor));
  // Reserva, sempre por regra e sempre amarela: categoria de outra condição do mesmo e-mail;
  // senão, a única categoria que o fornecedor já teve no ERP.
  const doHistorico = [...new Set(historico.filter((h) => h.cod_fornecedor === forn.valor).map((h) => h.cod_categoria))];
  return ex.condicoes.map((k, i) => {
    let cat = diretas[i];
    if (!cat.valor) {
      const irma = diretas.find((d) => d.valor);
      if (irma?.valor) cat = { valor: irma.valor, como: "inferido", detalhe: `"${k.categoria.valor ?? ""}" não indica a linha; usei ${irma.valor}, da outra condição deste e-mail.` };
      else if (doHistorico.length === 1)
        cat = { valor: doHistorico[0] as Categoria, como: "inferido", detalhe: `"${k.categoria.valor ?? ""}" não indica a linha; usei ${doHistorico[0]}, única categoria do fornecedor no ERP.` };
    }
    const rl = resolverLojas(k.lojas.valor ?? [], lojas);
    const p: Partial<Record<CampoCondicao, Proveniencia>> = {
      fornecedor: { ...prov(ex.fornecedor), mencao: ex.fornecedor.valor ?? "", resolucao: forn.detalhe },
      categoria: { ...prov(k.categoria), mencao: k.categoria.valor ?? "", resolucao: cat.detalhe },
      lojas: { ...prov(k.lojas), mencao: k.lojas.valor ?? [], resolucao: rl.mapeadas.join("; "), pendentes: rl.naoEncontradas },
      valor: prov(k.valor),
      data_inicio: prov(k.data_inicio),
      data_fim: prov(k.data_fim),
      contrapartida: prov(k.contrapartida),
    };
    return {
      ordem: i + 1,
      tipo: k.tipo,
      titulo: k.titulo || (k.tipo === "VERBA_EXPOSICAO" ? "Verba de exposição" : "Desconto percentual"),
      codFornecedor: forn.valor,
      codCategoria: cat.valor,
      lojas: rl.codigos,
      percentual: k.tipo === "DESCONTO_PERCENTUAL" ? k.valor.valor : null,
      valor: k.tipo === "VERBA_EXPOSICAO" ? k.valor.valor : null,
      dataInicio: isISO(k.data_inicio.valor) ? k.data_inicio.valor : null,
      dataFim: isISO(k.data_fim.valor) ? k.data_fim.valor : null,
      contrapartida: k.contrapartida.valor ?? "",
      campanhaSazonal: k.campanha_sazonal,
      codCondicaoSubstituida: null,
      proveniencia: p,
      notas: k.notas,
    };
  });
}
