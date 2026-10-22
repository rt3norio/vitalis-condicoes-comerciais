// Os três agentes (S7). Cada um é uma chamada de modelo com saída validada por Zod (S12, C2).
// Falha de modelo é tratada como qualquer falha de tarefa: quem decide se tenta de novo é a fila.
// Toda chamada devolve um RegistroIa (o que a IA recebeu, tools, retorno, tokens) para a auditoria (D14).
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import type { z } from "zod";
import { PROMPT_EXTRATOR, PROMPT_GERADOR, PROMPT_REDATOR, PROMPT_TEXTO_DIRETORIA, PROMPT_TEXTO_FORNECEDOR, PROMPT_VERIFICADOR } from "./prompts";
import { schemaExtracao, schemaGeracao, schemaRedacao, schemaTexto, schemaVerificacao, type Extracao, type Geracao, type Redacao, type Texto, type Verificacao } from "./schemas";
import type { DestinoTexto } from "./textos-padrao";

export const iaConfigurada = () => !!process.env.OPENROUTER_API_KEY;

export const MODELOS = {
  extrator: () => process.env.MODEL_EXTRATOR || "z-ai/glm-5.3",
  verificador: () => process.env.MODEL_VERIFICADOR || "z-ai/glm-5.3",
  redator: () => process.env.MODEL_REDATOR || "z-ai/glm-5.3",
  gerador: () => process.env.MODEL_GERADOR || "z-ai/glm-5.3",
};

export type Agente = keyof typeof MODELOS;

export type RegistroIa = {
  agente: Agente;
  modelo: string;
  sistema: string;
  mensagem: string;
  parametros: Record<string, unknown>;
  // os agentes não têm tools: a lista vem do próprio SDK e fica vazia (prova de que nada foi chamado)
  tools: { nome: string; entrada: unknown }[];
  saida: unknown;
  textoBruto: string | null;
  raciocinio: string | null;
  uso: { entrada: number | null; saida: number | null; raciocinio: number | null };
  ms: number;
  erro: string | null;
};

export class IaIndisponivel extends Error {}

// Falha com o registro da chamada junto, para a auditoria guardar também o que deu errado
export class FalhaIa extends Error {
  constructor(
    msg: string,
    public registro: RegistroIa,
  ) {
    super(msg);
  }
}

function modelo(id: string) {
  if (!iaConfigurada()) throw new IaIndisponivel("IA não configurada (OPENROUTER_API_KEY ausente)");
  const or = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY, headers: { "X-Title": "Vitalis - condicoes comerciais" } });
  // raciocínio longo do GLM consumia a saída e truncava o JSON: tarefa é de leitura, não de dedução longa
  return or.chat(id, { reasoning: { effort: "low" } });
}

type Uso = { inputTokens?: number; outputTokens?: number; outputTokenDetails?: { reasoningTokens?: number } } | undefined;
const uso = (u: Uso) => ({ entrada: u?.inputTokens ?? null, saida: u?.outputTokens ?? null, raciocinio: u?.outputTokenDetails?.reasoningTokens ?? null });

async function chamar<S extends z.ZodType>(agente: Agente, schema: S, sistema: string, mensagem: string, temperature: number, timeoutMs: number) {
  const id = MODELOS[agente]();
  const m = modelo(id);
  const parametros = { temperature, maxOutputTokens: 12_000, raciocinio: "low", timeoutMs, saida: "JSON no schema (sem tools)" };
  const inicio = Date.now();
  const base = { agente, modelo: id, sistema, mensagem, parametros };
  try {
    const r = await generateText({
      model: m,
      system: sistema,
      prompt: mensagem,
      output: Output.object({ schema }),
      temperature,
      maxRetries: 1,
      maxOutputTokens: 12_000,
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
    const registro: RegistroIa = {
      ...base,
      tools: r.toolCalls.map((c) => ({ nome: c.toolName, entrada: c.input })),
      saida: r.output,
      textoBruto: null,
      raciocinio: r.reasoningText ?? null,
      uso: uso(r.usage),
      ms: Date.now() - inicio,
      erro: null,
    };
    return { saida: r.output as z.infer<S>, modelo: id, registro };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const bruto = NoObjectGeneratedError.isInstance(e) ? e : null;
    throw new FalhaIa(msg, { ...base, tools: [], saida: null, textoBruto: bruto?.text ?? null, raciocinio: null, uso: uso(bruto?.usage), ms: Date.now() - inicio, erro: msg.slice(0, 2_000) });
  }
}

export type MaterialEmail = { corpo: string; remetente: string; assunto: string; data: string; anexos: { nome: string; texto: string }[] };

const embrulhar = (m: MaterialEmail) =>
  `<EMAIL>\nDe: ${m.remetente}\nData: ${m.data}\nAssunto: ${m.assunto}\n\n${m.corpo.slice(0, 20_000)}\n</EMAIL>\n` +
  m.anexos.map((a) => `<ANEXO nome="${a.nome.replace(/"/g, "")}">\n${a.texto.slice(0, 8_000)}\n</ANEXO>`).join("\n");

export const extrair = (m: MaterialEmail): Promise<{ saida: Extracao; modelo: string; registro: RegistroIa }> =>
  chamar("extrator", schemaExtracao, PROMPT_EXTRATOR, `Extraia as condições deste e-mail.\n${embrulhar(m)}`, 0, 90_000);

export const verificar = (m: MaterialEmail, leitura: Extracao): Promise<{ saida: Verificacao; modelo: string; registro: RegistroIa }> =>
  chamar("verificador", schemaVerificacao, PROMPT_VERIFICADOR, `${embrulhar(m)}\n<LEITURA>\n${JSON.stringify(leitura, null, 1)}\n</LEITURA>`, 0, 90_000);

export const redigir = (dados: unknown): Promise<{ saida: Redacao; modelo: string; registro: RegistroIa }> =>
  chamar("redator", schemaRedacao, PROMPT_REDATOR, `<DADOS>\n${JSON.stringify(dados, null, 1)}\n</DADOS>`, 0.2, 60_000);

// botão "Gerar texto" (D20): mesmo agente, um texto por vez
export const redigirTexto = (destino: DestinoTexto, dados: unknown): Promise<{ saida: Texto; modelo: string; registro: RegistroIa }> =>
  chamar("redator", schemaTexto, destino === "fornecedor" ? PROMPT_TEXTO_FORNECEDOR : PROMPT_TEXTO_DIRETORIA, `<DADOS>\n${JSON.stringify(dados, null, 1)}\n</DADOS>`, 0.2, 60_000);

export const gerarEmails = (n: number, contexto: { hoje: string; fornecedores: string[]; lojas: string[]; linhas: string[] }): Promise<{ saida: Geracao; modelo: string; registro: RegistroIa }> =>
  chamar(
    "gerador",
    schemaGeracao,
    PROMPT_GERADOR,
    `<HOJE>${contexto.hoje}</HOJE>
<CONTEXTO>
Fornecedores: ${contexto.fornecedores.join("; ")}
Lojas: ${contexto.lojas.join(", ")}
Linhas de produto: ${contexto.linhas.join(", ")}
</CONTEXTO>
Gere ${n} e-mails, cada um com cenário diferente.`,
    0.9,
    120_000,
  );
