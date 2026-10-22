// Liga o que o fornecedor escreveu aos códigos do ERP. Determinístico, sem IA.
import type { ErpFornecedor, ErpLoja } from "../dominio/dataset";
import type { Categoria } from "../dominio/tipos";

export const normalizar = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Palavras genéricas que não identificam ninguém
const GENERICAS = new Set(["distribuidora", "industria", "farmaceutica", "laboratorios", "ltda", "sa", "s", "a", "de", "do", "da", "produtos"]);
const tokens = (s: string) => normalizar(s).split(" ").filter((t) => t.length > 2 && !GENERICAS.has(t));

export type Resolucao<T> = { valor: T | null; como: "exato" | "inferido" | "nao_encontrado"; detalhe: string };

export function resolverFornecedor(mencao: string | null | undefined, dominio: string, fornecedores: ErpFornecedor[]): Resolucao<string> {
  const m = new Set(tokens(mencao ?? ""));
  const d = normalizar(dominio.split(".")[0]);
  let melhor: { f: ErpFornecedor; pontos: number; por: string } | null = null;
  for (const f of fornecedores) {
    const t = tokens(f.razao_social);
    const porNome = t.filter((x) => m.has(x)).length;
    const porDominio = t.some((x) => d.includes(x)) ? 1 : 0;
    const pontos = porNome * 2 + porDominio;
    if (pontos > 0 && (!melhor || pontos > melhor.pontos)) melhor = { f, pontos, por: porNome ? `nome "${mencao}"` : `domínio @${dominio}` };
  }
  if (!melhor) return { valor: null, como: "nao_encontrado", detalhe: `Nenhum fornecedor do ERP corresponde a "${mencao ?? ""}" (@${dominio}).` };
  return {
    valor: melhor.f.cod_fornecedor,
    como: "inferido",
    detalhe: `${melhor.f.cod_fornecedor} ${melhor.f.razao_social}, inferido pelo ${melhor.por}.`,
  };
}

const PALAVRAS_CATEGORIA: [Categoria, string[]][] = [
  ["GENERICOS", ["generic"]],
  ["MEDICAMENTOS_REFERENCIA", ["referencia"]],
  ["MIP", ["mip", "isento", "prescricao"]],
  ["HIGIENE_BELEZA", ["hpc", "higiene", "beleza", "perfumaria"]],
  ["DERMOCOSMETICOS", ["dermo", "cosmetic"]],
  ["SUPLEMENTOS", ["suplement", "vitamin"]],
];

export function resolverCategoria(mencao: string | null | undefined): Resolucao<Categoria> {
  const n = normalizar(mencao);
  for (const [cod, palavras] of PALAVRAS_CATEGORIA) {
    const p = palavras.find((x) => n.includes(x));
    if (p) return { valor: cod, como: "inferido", detalhe: `"${mencao}" → ${cod} (palavra "${p}").` };
  }
  return { valor: null, como: "nao_encontrado", detalhe: `"${mencao ?? ""}" não corresponde a nenhuma categoria do ERP.` };
}

export type ResolucaoLojas = { codigos: string[]; como: "exato" | "inferido" | "nao_encontrado"; mapeadas: string[]; naoEncontradas: string[] };

export function resolverLojas(mencoes: string[], lojas: ErpLoja[]): ResolucaoLojas {
  const indice = lojas.map((l) => ({ cod: l.cod_loja, chave: normalizar(l.nome.replace(/^DROG VITALIS\s+/i, "")), nome: l.nome }));
  const codigos: string[] = [];
  const mapeadas: string[] = [];
  const naoEncontradas: string[] = [];
  let todosExatos = true;
  for (const mencao of mencoes) {
    const n = normalizar(mencao);
    if (n === "rede" || n.includes("toda a rede") || n.includes("todas as lojas")) {
      codigos.push("REDE");
      continue;
    }
    if (/^loja \d{3}$/.test(n)) {
      const cod = `LOJA-${n.slice(5)}`;
      if (lojas.some((l) => l.cod_loja === cod)) codigos.push(cod);
      else naoEncontradas.push(mencao);
      continue;
    }
    todosExatos = false;
    const toks = n.split(" ");
    // todos os tokens da menção aparecem no nome da loja ("barra shopping" ⊂ "barra shopping")
    const candidatas = indice.filter((l) => toks.every((t) => l.chave.includes(t)) || l.chave === n);
    if (candidatas.length === 1) {
      codigos.push(candidatas[0].cod);
      mapeadas.push(`${mencao} → ${candidatas[0].cod}`);
    } else naoEncontradas.push(mencao);
  }
  const unicos = [...new Set(codigos)];
  return {
    codigos: unicos,
    como: naoEncontradas.length ? "nao_encontrado" : todosExatos ? "exato" : "inferido",
    mapeadas,
    naoEncontradas,
  };
}
