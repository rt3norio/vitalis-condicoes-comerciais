// Roda Extrator + Verificador + Redator de verdade nos 4 e-mails do dataset e salva em data/leituras-ia-cache.json (S36).
// Uso: OPENROUTER_API_KEY=... pnpm gerar-cache-ia
import fs from "node:fs";
import path from "node:path";
import { extrair, iaConfigurada, redigir, verificar } from "../src/lib/agentes/agentes";
import { dadosRedator } from "../src/lib/agentes/entrada-redator";
import { soDirigidas } from "../src/lib/agentes/schemas";
import { capturaErp, emailsDataset, extrato } from "../src/lib/dominio/dataset";
import { hoje } from "../src/lib/dominio/datas";
import type { Condicao } from "../src/lib/dominio/tipos";
import { condicoesDaLeitura } from "../src/lib/regras/condicoes-da-leitura";
import { calcularFarois, farolInstrucaoSuspeita } from "../src/lib/regras/farois";

async function comRetry<T>(f: () => Promise<T>, n = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await f();
    } catch (e) {
      if (i >= n) throw e;
      process.stdout.write(`(falhou, tentativa ${i + 1}) `);
    }
  }
}

async function main() {
  if (!iaConfigurada()) throw new Error("Defina OPENROUTER_API_KEY.");
  const saida: Record<string, unknown> = {};
  for (const e of emailsDataset) {
    const m = { corpo: e.corpo, remetente: e.remetente, assunto: e.assunto, data: new Date(e.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), anexos: e.anexos };
    process.stdout.write(`${e.chave}: extraindo… `);
    const ex = await comRetry(() => extrair(m));
    process.stdout.write(`verificando… `);
    const ve = await comRetry(() => verificar(m, ex.saida));
    // Redator: mesma entrada que a tarefa monta (faróis calculados por regra sobre a captura do ERP)
    const conds = condicoesDaLeitura(ex.saida, e.dominio, capturaErp.fornecedores, capturaErp.lojas, [...capturaErp.condicoes, ...extrato]).map((c, i) => ({ ...c, id: i + 1 }) as Condicao);
    const ctx = { fornecedores: capturaErp.fornecedores, lojas: capturaErp.lojas, condicoesErp: capturaErp.condicoes, extrato, hoje: hoje(), dominioRemetente: e.dominio, origemRef: e.messageId, irmas: conds, verificador: ve.saida.checagens };
    const fs = conds.flatMap((c) => calcularFarois(c, ctx).map((f) => ({ ...f, condicaoId: c.id })));
    const suspeita = farolInstrucaoSuspeita(soDirigidas([...ex.saida.instrucoes_suspeitas, ...ve.saida.instrucoes_suspeitas])).cor === "vermelho";
    const statusRedator = suspeita ? "escalado" : "revisao";
    const neg = { status: statusRedator, motivoSaida: suspeita ? "E-mail contém instrução dirigida ao sistema (S33). Escalado à Diretoria Comercial (premissa P12)." : null, remetente: e.remetente, assunto: e.assunto };
    process.stdout.write(`redigindo… `);
    const re = await comRetry(() => redigir(dadosRedator(neg, conds, fs)));
    saida[e.chave] = {
      extrator: ex.saida, verificador: ve.saida, redator: re.saida, statusRedator,
      modeloExtrator: ex.modelo, modeloVerificador: ve.modelo, modeloRedator: re.modelo, geradoEm: new Date().toISOString(),
    };
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
