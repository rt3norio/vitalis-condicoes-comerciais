// Gera o PDF de entrega (F3): docs/entrega-pdf.md → docs/entrega.html → docs/entrega.pdf (Chrome sem interface).
// Os anexos de prompts, formatos de saída e conferências saem direto do código, para o documento bater com o entregue.
// Uso: pnpm gerar-pdf            (documento completo)
//      pnpm gerar-pdf resumo     (docs/resumo.md → docs/resumo.pdf: 1 página, para a pessoa ler; F6)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { marked } from "marked";
import { z } from "zod";
import { PROMPT_EXTRATOR, PROMPT_REDATOR, PROMPT_TEXTO_DIRETORIA, PROMPT_TEXTO_FORNECEDOR, PROMPT_VERIFICADOR } from "../src/lib/agentes/prompts";
import { schemaExtracao, schemaRedacao, schemaTexto, schemaVerificacao } from "../src/lib/agentes/schemas";
import referencia from "../data/leituras-referencia.json";
import type { Extracao } from "../src/lib/agentes/schemas";
import { capturaErp, emailsDataset, extrato } from "../src/lib/dominio/dataset";
import type { Condicao } from "../src/lib/dominio/tipos";
import { condicoesDaLeitura } from "../src/lib/regras/condicoes-da-leitura";
import { calcularFarois, farolInstrucaoSuspeita, ORDEM_FAROIS } from "../src/lib/regras/farois";

const DOCS = path.join(process.cwd(), "docs");
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const bloco = (t: string) => "```text\n" + t.trim() + "\n```";
// Formato de saída legível: um campo por linha (nome: tipo — descrição); formato repetido aparece uma vez só
type Js = { type?: string | string[]; properties?: Record<string, Js>; items?: Js; enum?: unknown[]; anyOf?: Js[]; description?: string; const?: unknown };
function esboco(s: Js, nome: string, nivel: number, vistos: Map<string, string>, out: string[]) {
  const pad = "  ".repeat(nivel);
  const desc = s.description ? ` — ${s.description}` : "";
  const variantes = s.anyOf ?? [];
  const nulo = variantes.some((v) => v.type === "null") || (Array.isArray(s.type) && s.type.includes("null"));
  const base = variantes.find((v) => v.type !== "null") ?? s;
  const tipo = (t: Js): string =>
    t.enum ? t.enum.map((e) => JSON.stringify(e)).join(" | ") : t.const !== undefined ? JSON.stringify(t.const) : ({ string: "texto", number: "número", integer: "número", boolean: "sim/não", object: "", array: "lista" } as Record<string, string>)[String(Array.isArray(t.type) ? t.type.find((x) => x !== "null") : t.type)] ?? "";
  if (base.type === "array" && base.items) {
    const it = base.items.anyOf?.find((v) => v.type !== "null") ?? base.items;
    if (it.properties) {
      const chave = JSON.stringify(it);
      if (vistos.has(chave)) return void out.push(`${pad}${nome}: lista, cada item no mesmo formato de "${vistos.get(chave)}"${desc}`);
      vistos.set(chave, nome);
      out.push(`${pad}${nome}: lista de itens${nulo ? " (ou vazio)" : ""}${desc}`);
      for (const [k, v] of Object.entries(it.properties)) esboco(v, k, nivel + 1, vistos, out);
      return;
    }
    return void out.push(`${pad}${nome}: lista de ${tipo(it) || "itens"}${desc}`);
  }
  if (base.properties) {
    const chave = JSON.stringify(base);
    if (vistos.has(chave)) return void out.push(`${pad}${nome}: mesmo formato de "${vistos.get(chave)}"${desc}`);
    vistos.set(chave, nome);
    out.push(`${pad}${nome}:${nulo ? " (ou vazio)" : ""}${desc}`);
    for (const [k, v] of Object.entries(base.properties)) esboco(v, k, nivel + 1, vistos, out);
    return;
  }
  out.push(`${pad}${nome}: ${tipo(base)}${nulo ? " (ou vazio)" : ""}${desc}`);
}
const json = (s: z.ZodType) => {
  const raiz = z.toJSONSchema(s) as Js;
  const out: string[] = [];
  const vistos = new Map<string, string>();
  for (const [k, v] of Object.entries(raiz.properties ?? {})) esboco(v, k, 0, vistos, out);
  return "```text\n" + out.join("\n") + "\n```";
};

function anexoPrompts() {
  const agentes = [
    { nome: "Agente Extrator", quando: "Lê cada e-mail novo (tarefa 'Ler e-mail').", recebe: "O e-mail (remetente, data, assunto, corpo) e os anexos, entre as marcas `<EMAIL>` e `<ANEXO>`.", prompt: PROMPT_EXTRATOR, schema: schemaExtracao },
    { nome: "Agente Verificador", quando: "Logo depois do Extrator (tarefa 'Verificar').", recebe: "O mesmo e-mail e a leitura do Extrator, entre as marcas `<EMAIL>` e `<LEITURA>`.", prompt: PROMPT_VERIFICADOR, schema: schemaVerificacao },
    { nome: "Agente Redator · resumo", quando: "Depois da verificação e a cada alteração, aprovação ou envio.", recebe: "O resultado já calculado pelo sistema (faróis, alçada, status) e, se houver, as alterações feitas na revisão e o estado atual.", prompt: PROMPT_REDATOR, schema: schemaRedacao },
    { nome: "Agente Redator · resposta ao fornecedor", quando: "Quando a pessoa clica em 'Gerar texto'.", recebe: "O estado atual da negociação (valores, vigência, aprovações, gravação no ERP).", prompt: PROMPT_TEXTO_FORNECEDOR, schema: schemaTexto },
    { nome: "Agente Redator · memorando à Diretoria", quando: "Quando a pessoa clica em 'Gerar texto'.", recebe: "O mesmo estado atual.", prompt: PROMPT_TEXTO_DIRETORIA, schema: schemaTexto },
  ];
  return agentes
    .map((a) => `### ${a.nome}\n\n**Quando roda:** ${a.quando} **O que recebe:** ${a.recebe}\n\n**Prompt completo (instruções do agente):**\n\n${bloco(a.prompt)}\n\n**Formato de saída (validado pelo sistema; resposta fora do formato é recusada):**\n\n${json(a.schema)}`)
    .join("\n\n");
}

function anexoConferencias() {
  // títulos e § saem das próprias regras, calculadas sobre os 4 e-mails do exemplo
  const titulos = new Map<string, { titulo: string; ref?: string }>();
  for (const e of emailsDataset) {
    const ex = (referencia as unknown as Record<string, Extracao>)[e.chave];
    const conds = condicoesDaLeitura(ex, e.dominio, capturaErp.fornecedores, capturaErp.lojas).map((c, i) => ({ ...c, id: i + 1 }) as Condicao);
    for (const c of conds) {
      const ctx = { fornecedores: capturaErp.fornecedores, lojas: capturaErp.lojas, condicoesErp: capturaErp.condicoes, extrato, hoje: "2026-09-30", dominioRemetente: e.dominio, origemRef: e.messageId, irmas: conds, verificador: [] };
      for (const f of calcularFarois(c, ctx)) if (!titulos.has(f.codigo) || c.tipo === "DESCONTO_PERCENTUAL") titulos.set(f.codigo, { titulo: f.titulo, ref: (f as { ref?: string }).ref });
    }
  }
  const sus = farolInstrucaoSuspeita([]);
  titulos.set(sus.codigo, { titulo: sus.titulo });
  const QUEM: Record<string, string> = { Leitura: "IA, com trecho e certeza", Cadastro: "Regra fixa (hardcoded): cadastro do ERP", "Política": "Regra fixa (hardcoded): POL-COM-004", "Contrato do ERP": "Regra fixa (hardcoded): formato do ERP" };
  const linhas = ORDEM_FAROIS.flatMap((g) => g.codigos.map((cod) => `| ${g.rotulo} | ${titulos.get(cod)?.titulo ?? cod} | ${titulos.get(cod)?.ref ?? ""} | ${QUEM[g.grupo]} |`));
  linhas.push(`| Leitura | ${titulos.get("LEI-09")?.titulo} | | IA lista; regra fixa (hardcoded) decide escalar |`);
  return `| Grupo | Conferência | Política | Quem confere |\n|---|---|---|---|\n${linhas.join("\n")}`;
}

const resumo = process.argv[2] === "resumo";
let md = fs.readFileSync(path.join(DOCS, resumo ? "resumo.md" : "entrega-pdf.md"), "utf8");
if (!resumo) md = md.replace("<!-- ANEXO:PROMPTS -->", anexoPrompts()).replace("<!-- ANEXO:CONFERENCIAS -->", anexoConferencias());

// resumo de 1 página: só texto, muito espaço em branco, sem quebra de página por seção
const CSS_RESUMO = `
@page { size: A4; margin: 12mm 20mm; }
body { font-size: 10pt; line-height: 1.4; }
h1 { font-size: 20pt; margin-bottom: 2pt; }
h1 + p { font-size: 9pt; margin-top: 0; }
h2 { break-before: auto; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 1.2pt; border-bottom: 0.6pt solid #99f6e4; margin: 12pt 0 4pt; padding-bottom: 2pt; }
p strong:only-child { display: block; font-size: 11pt; color: #0f766e; margin: 6pt 0; }
ul, ol { padding-left: 16pt; margin: 4pt 0; }
li { margin: 2pt 0; }
.colunas ol { columns: 2; column-gap: 16pt; font-size: 8.8pt; line-height: 1.35; margin: 2pt 0; }
.colunas li { break-inside: avoid; margin: 0 0 3pt; }`;

const renderer = new marked.Renderer();
const codigoPadrao = renderer.code.bind(renderer);
renderer.code = (t) => (t.lang === "mermaid" ? `<div class="figura"><pre class="mermaid">${t.text}</pre></div>` : codigoPadrao(t));
const corpo = marked.parse(md, { renderer, gfm: true }) as string;

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Vitalis · Cadastro de condições comerciais com IA</title>
<style>
@page { size: A4; margin: 16mm 15mm 16mm 15mm; }
body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #18181b; }
h1 { font-size: 21pt; margin: 0 0 4pt; color: #0f766e; }
h2 { font-size: 15pt; color: #0f766e; border-bottom: 1.5pt solid #0f766e; padding-bottom: 3pt; margin-top: 0; break-before: page; }
h3 { font-size: 12pt; margin: 14pt 0 4pt; break-after: avoid; }
h3 + p, h3 + table, h3 + ul { break-before: avoid; }
h1 + p { color: #52525b; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 9.5pt; break-inside: auto; }
tr { break-inside: avoid; }
th, td { border: 0.6pt solid #d4d4d8; padding: 3pt 5pt; vertical-align: top; text-align: left; }
th { background: #f0fdfa; }
blockquote { margin: 8pt 0; padding: 6pt 10pt; background: #f4f4f5; border-left: 3pt solid #0f766e; }
blockquote p { margin: 3pt 0; }
pre { background: #fafafa; border: 0.6pt solid #e4e4e7; padding: 6pt; font-size: 7.5pt; white-space: pre-wrap; word-break: break-word; }
code { font-family: Consolas, monospace; font-size: 0.92em; }
.figura { break-inside: avoid; text-align: center; margin: 8pt 0; }
.figura pre.mermaid { background: none; border: none; font-size: 10pt; }
.figura svg { max-height: 118mm; width: auto !important; max-width: 100% !important; }
img { max-width: 100%; border: 0.6pt solid #d4d4d8; border-radius: 4pt; break-inside: avoid; }
p:has(> img) { break-inside: avoid; text-align: center; margin-bottom: 2pt; }
p:has(> img) { break-after: avoid; }
p:has(> em:only-child) { break-inside: avoid; break-before: avoid; }
em.legenda, p > em:only-child { color: #52525b; font-size: 9pt; }
hr { display: none; }
${resumo ? CSS_RESUMO : ""}
</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script>
<script>mermaid.initialize({ startOnLoad: true, theme: "neutral", flowchart: { htmlLabels: true, useMaxWidth: true } });</script>
</head><body>${corpo}</body></html>`;

const arqHtml = path.join(DOCS, resumo ? "resumo.html" : "entrega.html");
const arqPdf = path.join(DOCS, resumo ? "resumo.pdf" : "entrega.pdf");
fs.writeFileSync(arqHtml, html);
execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=20000", `--print-to-pdf=${arqPdf}`, pathToFileURL(arqHtml).href], { stdio: "ignore" });
console.log(`PDF: ${arqPdf} (${Math.round(fs.statSync(arqPdf).size / 1024)} KB)`);
