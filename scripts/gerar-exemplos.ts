// Gera e-mails de exemplo com o Agente Gerador, salva em data/exemplos/*.eml e testa cada um no Extrator +
// motor de faróis (sem servidor). Uso: pnpm gerar-exemplos [quantidade]
import fs from "node:fs";
import path from "node:path";
import { extrair, gerarEmails, iaConfigurada } from "../src/lib/agentes/agentes";
import { capturaErp, extrato } from "../src/lib/dominio/dataset";
import { hoje } from "../src/lib/dominio/datas";
import { CATEGORIA_LABEL, CATEGORIAS, type Condicao } from "../src/lib/dominio/tipos";
import { condicoesDaLeitura } from "../src/lib/regras/condicoes-da-leitura";
import { calcularFarois } from "../src/lib/regras/farois";

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);

async function main() {
  if (!iaConfigurada()) throw new Error("Defina OPENROUTER_API_KEY.");
  const n = Number(process.argv[2] ?? 6);
  const destino = path.join(process.cwd(), "data", "exemplos");
  fs.mkdirSync(destino, { recursive: true });
  const { saida } = await gerarEmails(n, {
    hoje: hoje(),
    fornecedores: capturaErp.fornecedores.map((f) => `${f.razao_social} (${f.status})`),
    lojas: capturaErp.lojas.map((l) => l.nome.replace(/^DROG VITALIS\s+/i, "")),
    linhas: CATEGORIAS.map((c) => CATEGORIA_LABEL[c]),
  });
  let i = 0;
  for (const m of saida.emails) {
    i++;
    const dominio = m.remetente_email.split("@")[1] ?? "";
    const data = new Date();
    const anexoLinha = m.anexo ? `\n\n[Anexo: ${m.anexo.nome}]` : "";
    const eml = `Message-ID: <exemplo-${i}-${Date.now()}@${dominio}>\nDate: ${data.toUTCString()}\nFrom: ${m.remetente_nome} <${m.remetente_email}>\nTo: Renata Alves <renata.alves@vitalis.com.br>\nSubject: ${m.assunto}\nContent-Type: text/plain; charset="utf-8"\n\n${m.corpo}${anexoLinha}\n`;
    const base = `${String(i).padStart(2, "0")}_${slug(m.assunto)}`;
    fs.writeFileSync(path.join(destino, `${base}.eml`), eml);
    if (m.anexo) fs.writeFileSync(path.join(destino, `${base}__${m.anexo.nome.replace(/[^\w.-]/g, "_")}`), m.anexo.csv);

    // teste: Extrator ao vivo + regras
    const ex = await extrair({ corpo: m.corpo, remetente: `${m.remetente_nome} <${m.remetente_email}>`, assunto: m.assunto, data: data.toLocaleString("pt-BR"), anexos: m.anexo ? [{ nome: m.anexo.nome, texto: m.anexo.csv }] : [] });
    const conds = condicoesDaLeitura(ex.saida, dominio, capturaErp.fornecedores, capturaErp.lojas, [...capturaErp.condicoes, ...extrato]).map((c, k) => ({ ...c, id: k + 1 }) as Condicao);
    const ctx = { fornecedores: capturaErp.fornecedores, lojas: capturaErp.lojas, condicoesErp: capturaErp.condicoes, extrato, hoje: hoje(), dominioRemetente: dominio, origemRef: "<exemplo>", irmas: conds, verificador: null };
    console.log(`\n[${base}] cenário: ${m.cenario}`);
    for (const c of conds) {
      const fs_ = calcularFarois(c, ctx);
      const vermelhos = fs_.filter((f) => f.cor === "vermelho").map((f) => f.codigo);
      console.log(`  ${c.titulo}: ${c.codFornecedor ?? "?"} ${c.codCategoria ?? "?"} ${c.tipo === "DESCONTO_PERCENTUAL" ? `${c.percentual}%` : `R$ ${c.valor}`} lojas=${c.lojas.join(",") || "?"} ${c.dataInicio}→${c.dataFim} | vermelhos: ${vermelhos.join(", ") || "nenhum"}`);
    }
  }
  console.log(`\n${saida.emails.length} e-mails salvos em ${destino}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
