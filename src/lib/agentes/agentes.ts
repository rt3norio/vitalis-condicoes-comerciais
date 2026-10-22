// Os três agentes (S7). Cada um é uma chamada de modelo com saída validada por Zod (S12, C2).
// Falha de modelo é tratada como qualquer falha de tarefa: quem decide se tenta de novo é a fila.
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { PROMPT_EXTRATOR, PROMPT_GERADOR, PROMPT_REDATOR, PROMPT_VERIFICADOR } from "./prompts";
import { schemaExtracao, schemaGeracao, schemaRedacao, schemaVerificacao, type Extracao, type Geracao, type Redacao, type Verificacao } from "./schemas";

export const iaConfigurada = () => !!process.env.OPENROUTER_API_KEY;

export const MODELOS = {
  extrator: () => process.env.MODEL_EXTRATOR || "z-ai/glm-5.3",
  verificador: () => process.env.MODEL_VERIFICADOR || "z-ai/glm-5.3",
  redator: () => process.env.MODEL_REDATOR || "z-ai/glm-5.3",
  gerador: () => process.env.MODEL_GERADOR || "z-ai/glm-5.3",
};

export class IaIndisponivel extends Error {}

function modelo(id: string) {
  if (!iaConfigurada()) throw new IaIndisponivel("IA não configurada (OPENROUTER_API_KEY ausente)");
  const or = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY, headers: { "X-Title": "Vitalis - condicoes comerciais" } });
  // raciocínio longo do GLM consumia a saída e truncava o JSON: tarefa é de leitura, não de dedução longa
  return or.chat(id, { reasoning: { effort: "low" } });
}

export type MaterialEmail = { corpo: string; remetente: string; assunto: string; data: string; anexos: { nome: string; texto: string }[] };

const embrulhar = (m: MaterialEmail) =>
  `<EMAIL>\nDe: ${m.remetente}\nData: ${m.data}\nAssunto: ${m.assunto}\n\n${m.corpo.slice(0, 20_000)}\n</EMAIL>\n` +
  m.anexos.map((a) => `<ANEXO nome="${a.nome.replace(/"/g, "")}">\n${a.texto.slice(0, 8_000)}\n</ANEXO>`).join("\n");

export async function extrair(m: MaterialEmail): Promise<{ saida: Extracao; modelo: string }> {
  const id = MODELOS.extrator();
  const { output } = await generateText({
    model: modelo(id),
    system: PROMPT_EXTRATOR,
    prompt: `Extraia as condições deste e-mail.\n${embrulhar(m)}`,
    output: Output.object({ schema: schemaExtracao }),
    temperature: 0,
    maxRetries: 1,
    maxOutputTokens: 12_000,
    abortSignal: AbortSignal.timeout(90_000),
  });
  return { saida: output, modelo: id };
}

export async function verificar(m: MaterialEmail, leitura: Extracao): Promise<{ saida: Verificacao; modelo: string }> {
  const id = MODELOS.verificador();
  const { output } = await generateText({
    model: modelo(id),
    system: PROMPT_VERIFICADOR,
    prompt: `${embrulhar(m)}\n<LEITURA>\n${JSON.stringify(leitura, null, 1)}\n</LEITURA>`,
    output: Output.object({ schema: schemaVerificacao }),
    temperature: 0,
    maxRetries: 1,
    maxOutputTokens: 12_000,
    abortSignal: AbortSignal.timeout(90_000),
  });
  return { saida: output, modelo: id };
}

export async function redigir(dados: unknown): Promise<{ saida: Redacao; modelo: string }> {
  const id = MODELOS.redator();
  const { output } = await generateText({
    model: modelo(id),
    system: PROMPT_REDATOR,
    prompt: `<DADOS>\n${JSON.stringify(dados, null, 1)}\n</DADOS>`,
    output: Output.object({ schema: schemaRedacao }),
    temperature: 0.2,
    maxRetries: 1,
    maxOutputTokens: 12_000,
    abortSignal: AbortSignal.timeout(60_000),
  });
  return { saida: output, modelo: id };
}

export async function gerarEmails(n: number, contexto: { hoje: string; fornecedores: string[]; lojas: string[]; linhas: string[] }): Promise<{ saida: Geracao; modelo: string }> {
  const id = MODELOS.gerador();
  const { output } = await generateText({
    model: modelo(id),
    system: PROMPT_GERADOR,
    prompt: `<HOJE>${contexto.hoje}</HOJE>
<CONTEXTO>
Fornecedores: ${contexto.fornecedores.join("; ")}
Lojas: ${contexto.lojas.join(", ")}
Linhas de produto: ${contexto.linhas.join(", ")}
</CONTEXTO>
Gere ${n} e-mails, cada um com cenário diferente.`,
    output: Output.object({ schema: schemaGeracao }),
    temperature: 0.9,
    maxRetries: 1,
    maxOutputTokens: 12_000,
    abortSignal: AbortSignal.timeout(120_000),
  });
  return { saida: output, modelo: id };
}
