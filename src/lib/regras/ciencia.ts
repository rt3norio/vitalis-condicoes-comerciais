// Ciência por item amarelo (substitui o "Conferi os N itens" em bloco). A ciência vale para o texto do farol
// no momento do clique: se uma edição muda aquele item, ela deixa de valer e a pessoa dá ciência de novo.
export type Ciencias = Record<string, { em: string; detalhe: string }>;

type FarolCiencia = { codigo: string; condicaoId: number | null; cor: string; detalhe: string };

export const chaveCiencia = (codigo: string, condicaoId: number | null) => `${codigo}#${condicaoId ?? "neg"}`;

export const temCiencia = (c: Ciencias, f: FarolCiencia) => f.cor === "amarelo" && c[chaveCiencia(f.codigo, f.condicaoId)]?.detalhe === f.detalhe;

export const amarelosSemCiencia = <T extends FarolCiencia>(fs: T[], c: Ciencias) => fs.filter((f) => f.cor === "amarelo" && !temCiencia(c, f));
