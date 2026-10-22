// Divide o texto do e-mail em pedaços, marcando os trechos usados como evidência (sem HTML cru).
export type Pedaco = { texto: string; tipo: "normal" | "evidencia" };

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function destacar(texto: string, evidencias: string[]): Pedaco[] {
  const marcas: { ini: number; fim: number }[] = [];
  const achar = (trecho: string) => {
    // trechos podem vir com "..." no meio ou quebra de linha diferente
    for (const parte of trecho.split(/\.\.\.|…/).map((p) => p.trim()).filter((p) => p.length >= 6)) {
      const re = new RegExp(escapar(parte).replace(/\s+/g, "\\s+"), "i");
      const m = re.exec(texto);
      if (m) marcas.push({ ini: m.index, fim: m.index + m[0].length });
    }
  };
  evidencias.forEach(achar);
  marcas.sort((a, b) => a.ini - b.ini);
  const out: Pedaco[] = [];
  let pos = 0;
  for (const m of marcas) {
    if (m.ini < pos) continue; // sobreposta: fica a primeira
    if (m.ini > pos) out.push({ texto: texto.slice(pos, m.ini), tipo: "normal" });
    out.push({ texto: texto.slice(m.ini, m.fim), tipo: "evidencia" });
    pos = m.fim;
  }
  if (pos < texto.length) out.push({ texto: texto.slice(pos), tipo: "normal" });
  return out;
}
