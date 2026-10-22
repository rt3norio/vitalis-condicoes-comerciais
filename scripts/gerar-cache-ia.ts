// Roda Extrator + Verificador de verdade nos 4 e-mails do dataset e salva em data/leituras-ia-cache.json (S36).
// Uso: OPENROUTER_API_KEY=... pnpm gerar-cache-ia
import fs from "node:fs";
import path from "node:path";
import { extrair, iaConfigurada, verificar } from "../src/lib/agentes/agentes";
import { emailsDataset } from "../src/lib/dominio/dataset";

async function main() {
  if (!iaConfigurada()) throw new Error("Defina OPENROUTER_API_KEY.");
  const saida: Record<string, unknown> = {};
  for (const e of emailsDataset) {
    const m = { corpo: e.corpo, remetente: e.remetente, assunto: e.assunto, anexos: e.anexos };
    process.stdout.write(`${e.chave}: extraindo… `);
    const ex = await extrair(m);
    process.stdout.write(`verificando… `);
    const ve = await verificar(m, ex.saida);
    saida[e.chave] = { extrator: ex.saida, verificador: ve.saida, modeloExtrator: ex.modelo, modeloVerificador: ve.modelo, geradoEm: new Date().toISOString() };
    console.log(`ok (${ex.saida.condicoes.length} condição(ões), ${ve.saida.checagens.filter((c) => c.veredito !== "concorda").length} ponto(s) do verificador)`);
  }
  const destino = path.join(process.cwd(), "data", "leituras-ia-cache.json");
  fs.writeFileSync(destino, JSON.stringify(saida, null, 2));
  console.log(`Salvo em ${destino}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
