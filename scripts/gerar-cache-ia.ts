// Roda Extrator + Verificador + Redator de verdade nos 4 e-mails do dataset e salva em data/leituras-ia-cache.json (S36),
// com o registro de cada chamada para a auditoria da IA (D14).
// Uso: pnpm gerar-cache-ia            (os 4 e-mails)
//      pnpm gerar-cache-ia nutrivida  (só os citados; o resto do cache é mantido)
import fs from "node:fs";
import path from "node:path";
import { extrair, iaConfigurada, redigir, verificar } from "../src/lib/agentes/agentes";
import { dadosRedator } from "../src/lib/agentes/entrada-redator";
import { soDirigidas } from "../src/lib/agentes/schemas";
import { capturaErp, emailsDataset, extrato } from "../src/lib/dominio/dataset";
import { hoje } from "../src/lib/dominio/datas";
import type { Condicao } from "../src/lib/dominio/tipos";
import { condicoesDaLeitura } from "../src/lib/regras/condicoes-da-leitura";
import { calcularFarois, farolInstrucaoSuspeita, MOTIVO_TEXTO_SUSPEITO } from "../src/lib/regras/farois";

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
  const destino = path.join(process.cwd(), "data", "leituras-ia-cache.json");
  const so = process.argv.slice(2);
  const saida: Record<string, unknown> = so.length && fs.existsSync(destino) ? JSON.parse(fs.readFileSync(destino, "utf8")) : {};
  for (const e of emailsDataset.filter((x) => !so.length || so.includes(x.chave))) {
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
    const neg = { status: statusRedator, motivoSaida: suspeita ? MOTIVO_TEXTO_SUSPEITO : null, remetente: e.remetente, assunto: e.assunto };
    process.stdout.write(`redigindo… `);
    const re = await comRetry(() => redigir(dadosRedator(neg, conds, fs)));
    saida[e.chave] = {
      extrator: ex.saida, verificador: ve.saida, redator: re.saida, statusRedator,
      modeloExtrator: ex.modelo, modeloVerificador: ve.modelo, modeloRedator: re.modelo, geradoEm: new Date().toISOString(),
      // auditoria (D14): o que cada agente recebeu, tools, retorno, tokens e tempo
      chamadas: { extrator: ex.registro, verificador: ve.registro, redator: re.registro },
    };
    console.log(`ok (${ex.saida.condicoes.length} condição(ões), ${ve.saida.checagens.filter((c) => c.veredito !== "concorda").length} ponto(s) do verificador)`);
  }
  fs.writeFileSync(destino, JSON.stringify(saida, null, 2));
  console.log(`Salvo em ${destino}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
