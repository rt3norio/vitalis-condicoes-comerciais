// Formato de saída dos três agentes. Validado por Zod: o que não estiver aqui não entra no sistema.
// Nenhum schema tem campo de status, aprovação ou alçada (defesa estrutural contra instrução no e-mail).
import { z } from "zod";

const certeza = z.enum(["escrito", "deduzido", "ausente"]);

const alternativa = <T extends z.ZodTypeAny>(v: T) =>
  z.object({ valor: v, origem: z.string().describe("ex.: corpo do e-mail, planilha anexa"), trecho: z.string() });

const campo = <T extends z.ZodTypeAny>(v: T) =>
  z.object({
    valor: v.nullable(),
    trecho: z.string().describe("trecho literal e curto de onde veio o valor; vazio se ausente"),
    certeza,
    alternativas: z.array(alternativa(v)).describe("só quando fontes divergem; senão lista vazia"),
    sugestao: z.object({ valor: v, motivo: z.string() }).nullable().describe("só quando ausente e há palpite razoável"),
  });

export const campoTexto = campo(z.string());
export const campoNumero = campo(z.number());
export const campoLista = campo(z.array(z.string()));

export const schemaExtracao = z.object({
  fornecedor: campoTexto.describe("nome do fornecedor como aparece no e-mail"),
  condicoes: z.array(
    z.object({
      tipo: z.enum(["DESCONTO_PERCENTUAL", "VERBA_EXPOSICAO"]),
      titulo: z.string().describe("rótulo curto, ex.: Desconto — linha dermo"),
      campanha_sazonal: z.boolean(),
      categoria: campoTexto.describe("palavras do fornecedor para a linha de produtos; não converter para código"),
      lojas: campoLista.describe('nomes das lojas como escritos, ou ["REDE"] para toda a rede'),
      valor: campoNumero.describe("percentual (12.5) se desconto; reais (8000) se verba"),
      data_inicio: campoTexto.describe("AAAA-MM-DD"),
      data_fim: campoTexto.describe("AAAA-MM-DD"),
      contrapartida: campoTexto,
      notas: z.array(z.string()).describe("ambiguidades relevantes, curtas"),
    }),
  ),
  instrucoes_suspeitas: z.array(z.object({ trecho: z.string(), motivo: z.string() })),
});
export type Extracao = z.infer<typeof schemaExtracao>;

export const CAMPOS_VERIFICAVEIS = ["fornecedor", "categoria", "lojas", "valor", "data_inicio", "data_fim", "contrapartida"] as const;

export const schemaVerificacao = z.object({
  checagens: z.array(
    z.object({
      condicao: z.number().int().describe("número da condição, começando em 1"),
      campo: z.enum(CAMPOS_VERIFICAVEIS),
      veredito: z.enum(["concorda", "duvida", "discorda"]),
      comentario: z.string().describe("curto; obrigatório se dúvida ou discorda"),
    }),
  ),
  instrucoes_suspeitas: z.array(z.object({ trecho: z.string(), motivo: z.string() })),
});
export type Verificacao = z.infer<typeof schemaVerificacao>;

export const schemaRedacao = z.object({
  resumo: z.string().describe("até 3 frases: o que a pessoa precisa decidir"),
  rascunho_fornecedor: z.string().describe("resposta curta e cordial ao fornecedor; sem prometer cadastro se houver bloqueio; sem expor política interna"),
  memorando_diretoria: z.string().nullable().describe("só se a negociação precisa ir à Diretoria; senão null"),
});
export type Redacao = z.infer<typeof schemaRedacao>;
