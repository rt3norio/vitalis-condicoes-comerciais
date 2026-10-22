// Divide o texto do e-mail em pedaços, marcando os trechos usados como evidência (sem HTML cru).
export type Pedaco = { texto: string; tipo: "normal" | "evidencia" | "suspeito" };

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function destacar(texto: string, evidencias: string[], suspeitos: string[]): Pedaco[] {
  const marcas: { ini: number; fim: number; tipo: Pedaco["tipo"] }[] = [];
  const achar = (trecho: string, tipo: Pedaco["tipo"]) => {
    // trechos podem vir com "..." no meio ou quebra de linha diferente
    for (const parte of trecho.split(/\.\.\.|…/).map((p) => p.trim()).filter((p) => p.length >= 6)) {
      const re = new RegExp(escapar(parte).replace(/\s+/g, "\\s+"), "i");
      const m = re.exec(texto);
      if (m) marcas.push({ ini: m.index, fim: m.index + m[0].length, tipo });
    }
  };
  suspeitos.forEach((t) => achar(t, "suspeito"));
  evidencias.forEach((t) => achar(t, "evidencia"));
  marcas.sort((a, b) => a.ini - b.ini || (a.tipo === "suspeito" ? -1 : 1));
  const out: Pedaco[] = [];
  let pos = 0;
  for (const m of marcas) {
    if (m.ini < pos) continue; // sobreposta: fica a primeira
    if (m.ini > pos) out.push({ texto: texto.slice(pos, m.ini), tipo: "normal" });
    out.push({ texto: texto.slice(m.ini, m.fim), tipo: m.tipo });
    pos = m.fim;
  }
  if (pos < texto.length) out.push({ texto: texto.slice(pos), tipo: "normal" });
  return out;
}
