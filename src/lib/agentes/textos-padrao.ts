// Textos padrão (sem IA): resumo da tarefa "redigir" e textos do botão "Gerar texto" quando a IA não está
// configurada (D20). Texto suspeito: a proposta não segue, só com novo contato do fornecedor (D18, D21).
import { fmtBRL, fmtData, fmtPct } from "../dominio/datas";
import { CATEGORIA_LABEL, type Categoria, type TipoCondicao } from "../dominio/tipos";

export type DestinoTexto = "fornecedor" | "diretoria";

type NegMin = { status: string; remetente: string; assunto: string; motivoSaida: string | null; messageId: string | null };
type CondMin = { titulo: string; tipo: TipoCondicao; percentual: number | null; valor: number | null; codCategoria: string | null; dataInicio: string | null; dataFim: string | null; erpCodCondicao?: string | null };
type FarolMin = { codigo: string; cor: string; titulo: string; detalhe: string; acao?: string | null };

export const temTextoSuspeito = (fs: FarolMin[]) => fs.some((f) => f.codigo === "LEI-09" && f.cor === "vermelho");

const valor = (c: CondMin) => (c.tipo === "DESCONTO_PERCENTUAL" ? fmtPct(c.percentual) : fmtBRL(c.valor));
const lista = (conds: CondMin[]) =>
  conds.map((c) => `${c.titulo}: ${valor(c)}${c.codCategoria ? ` em ${CATEGORIA_LABEL[c.codCategoria as Categoria]}` : ""}, ${fmtData(c.dataInicio)}–${fmtData(c.dataFim)}`).join("; ");

export function resumoPadrao(conds: CondMin[], fs: FarolMin[]): string[] {
  const linhas = conds.map((c) => `${c.titulo}: ${valor(c)}, ${fmtData(c.dataInicio)} a ${fmtData(c.dataFim)}`);
  if (temTextoSuspeito(fs)) return [...linhas, "Texto suspeito no e-mail: escalado à Diretoria Comercial", "Esta proposta não segue: só com novo contato do fornecedor, por novo e-mail"];
  const vermelhos = fs.filter((f) => f.cor === "vermelho");
  return [
    ...linhas,
    ...[...new Set(vermelhos.map((f) => f.titulo))].slice(0, 3).map((t) => `Trava: ${t.toLowerCase()}`),
    vermelhos.length ? "Corrija os itens em vermelho ou escale à Diretoria" : "Sem bloqueios: confira os amarelos e aprove na alçada indicada",
  ];
}

export function textoPadrao(destino: DestinoTexto, neg: NegMin, conds: CondMin[], fs: FarolMin[]): string {
  const suspeito = temTextoSuspeito(fs);
  if (destino === "diretoria") {
    const motivo = [neg.motivoSaida, ...fs.filter((f) => f.acao === "escalar").map((f) => f.detalhe)].filter(Boolean).join(" ");
    const caminho = suspeito
      ? "\n\nEsta proposta não segue. O caminho é um novo contato do fornecedor, por novo e-mail, que entra no fluxo normal. Pedimos que a Diretoria valide este encaminhamento."
      : "";
    return `Para: Diretoria Comercial\nAssunto: decisão necessária — ${neg.assunto}\n\n${lista(conds)}.\n\nMotivo: ${motivo}${caminho}\n\nOrigem: ${neg.messageId ?? "—"}`;
  }
  const primeiro = neg.remetente.replace(/<.*>/, "").trim().split(" ")[0] || "";
  // texto suspeito: não cita nem comenta o texto, não pede ajuste desta proposta (D13, D18)
  if (suspeito) return `Olá, ${primeiro}! Não é possível dar andamento a esta proposta. Se quiser negociar, envie uma nova proposta em um novo e-mail.`;
  if (neg.status === "enviado") return `Olá, ${primeiro}! A condição foi aprovada e cadastrada: ${lista(conds)}.`;
  if (neg.status === "aguardando_envio") return `Olá, ${primeiro}! A condição foi aprovada e está sendo cadastrada: ${lista(conds)}. Avisamos quando concluir.`;
  if (neg.status === "recusado") return `Olá, ${primeiro}! Agradecemos a proposta, mas ela não seguirá desta vez.`;
  return fs.some((f) => f.cor === "vermelho")
    ? `Olá, ${primeiro}! Recebemos a proposta e ela está em análise. Para seguirmos, precisamos confirmar alguns pontos; retornamos em breve com o que faltar.`
    : `Olá, ${primeiro}! Recebemos a proposta e ela está em aprovação interna. Avisamos assim que estiver cadastrada.`;
}
