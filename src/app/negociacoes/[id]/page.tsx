// Tela da negociação: e-mail com evidências à esquerda; condições, faróis e decisão à direita.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AutoAtualizar } from "@/components/barra-topo";
import { Ponto, StatusBadge } from "@/components/farol";
import { iaConfigurada } from "@/lib/agentes/agentes";
import { linhaDoTempo } from "@/lib/consultas";
import { capturaErp } from "@/lib/dominio/dataset";
import { fmtBRL, fmtDataHora, fmtPct } from "@/lib/dominio/datas";
import { alcada, APROVADORES } from "@/lib/dominio/politica";
import { CATEGORIA_LABEL, CATEGORIAS, type Farol, type Grupo } from "@/lib/dominio/tipos";
import { destacar } from "@/lib/destacar";
import { carregar, paraCondicao, snapshotSalvo } from "@/lib/negociacao";
import { podeAprovar } from "@/lib/regras/farois";
import { sessaoAtual } from "@/lib/sessao";
import { cn } from "@/lib/utils";
import { AprovarCondicao, BotaoReabrir, BotaoReler, ConferirAmarelos, Copiar, EditorCondicao, Encerrar } from "./cliente";

export default function Pagina(props: PageProps<"/negociacoes/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
      <Negociacao params={props.params} />
    </Suspense>
  );
}

const GRUPOS: { g: Grupo; dono: string }[] = [
  { g: "Leitura", dono: "IA: Extrator + Verificador" },
  { g: "Cadastro", dono: "regra fixa × ERP" },
  { g: "Política", dono: "regra fixa · POL-COM-004" },
  { g: "Contrato do ERP", dono: "regra fixa · schema" },
];

const TAREFA = { ler_email: "Ler e-mail", verificar: "Verificar", redigir: "Redigir textos", enviar_erp: "Enviar ao ERP" } as Record<string, string>;
const ORIGEM_LEITURA = {
  ia: { rotulo: "Lido pela IA", cls: "bg-sky-50 text-sky-800 ring-sky-200" },
  cache: { rotulo: "Saída salva da IA", cls: "bg-sky-50 text-sky-800 ring-sky-200" },
  referencia_manual: { rotulo: "Leitura de referência manual (IA não configurada)", cls: "bg-amber-50 text-amber-900 ring-amber-200" },
} as const;

async function Negociacao({ params }: Pick<PageProps<"/negociacoes/[id]">, "params">) {
  const sid = await sessaoAtual();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const dados = await carregar(sid, id);
  if (!dados) notFound();
  const { neg, conds, leitura, farois } = dados;
  const [snap, tempo] = await Promise.all([snapshotSalvo(sid), linhaDoTempo(id)]);
  const fornecedores = snap?.fornecedores ?? capturaErp.fornecedores;
  const lojas = snap?.lojas ?? capturaErp.lojas;
  const emRevisao = neg.status === "revisao";
  const farolNeg = farois.filter((f) => f.condicaoId == null);
  const suspeita = farolNeg.find((f) => f.codigo === "LEI-09" && f.cor === "vermelho");
  const amarelos = farois.filter((f) => f.cor === "amarelo").length;
  const conferido = neg.conferidos ? `${neg.conferidos.por} em ${fmtDataHora(neg.conferidos.em)}` : null;
  const sugerirEscalar = farois.some((f) => f.acao === "escalar" && f.cor === "vermelho");

  const evidencias = (leitura?.saidaExtrator.condicoes ?? []).flatMap((k) => [k.categoria, k.lojas, k.valor, k.data_inicio, k.data_fim, k.contrapartida].map((c) => c.trecho)).concat(leitura?.saidaExtrator.fornecedor.trecho ?? "");
  const pedacos = destacar(neg.corpo, evidencias.filter(Boolean), neg.instrucoesSuspeitas.map((i) => i.trecho));

  const opcoesForn = fornecedores.map((f) => ({ valor: f.cod_fornecedor, rotulo: `${f.cod_fornecedor} · ${f.razao_social}${f.status !== "ATIVO" ? ` (${f.status})` : ""}` }));
  const opcoesCat = CATEGORIAS.map((c) => ({ valor: c, rotulo: CATEGORIA_LABEL[c] }));
  const opcoesLojas = lojas.map((l) => ({ valor: l.cod_loja, rotulo: l.nome.replace(/^DROG VITALIS\s+/i, "") }));

  return (
    <div className="grid gap-5">
      {["recebido", "verificacao", "aguardando_envio"].includes(neg.status) && <AutoAtualizar />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-teal-700 hover:underline">← Painel</Link>
          <h1 className="mt-1 text-xl font-semibold">{neg.assunto}</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {neg.remetente} · recebido {fmtDataHora(neg.recebidoEm)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {leitura && <span className={cn("rounded-full px-2.5 py-0.5 text-xs ring-1 ring-inset", ORIGEM_LEITURA[leitura.origem].cls)}>{ORIGEM_LEITURA[leitura.origem].rotulo}{leitura.modeloExtrator ? ` · ${leitura.modeloExtrator}` : ""}</span>}
          <StatusBadge status={neg.status} />
          {iaConfigurada() && <BotaoReler negId={neg.id} disabled={!["revisao", "verificacao"].includes(neg.status)} />}
        </div>
      </div>

      {suspeita && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <b>Instrução dirigida ao sistema encontrada no e-mail.</b> O texto foi ignorado e a negociação foi escalada sem liberação na tela. {suspeita.detalhe}
        </div>
      )}
      {neg.alertaRevisao && emRevisao && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <b>Voltou para revisão:</b> {neg.alertaRevisao}
        </div>
      )}
      {neg.motivoSaida && ["escalado", "recusado"].includes(neg.status) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <span><b>{neg.status === "escalado" ? "Escalado" : "Recusado"}:</b> {neg.motivoSaida}</span>
          {!suspeita && <BotaoReabrir negId={neg.id} />}
        </div>
      )}
      {neg.status === "aguardando_envio" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Aprovado. O envio ao ERP roda em segundo plano na próxima rodada; antes do primeiro envio o sistema reconfere tudo com o ERP ao vivo. Se o ERP falhar, tenta de novo sozinho.
        </div>
      )}
      {neg.resumo && (
        <div className="rounded-lg border bg-white px-4 py-3 text-sm">
          <span className="mr-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Resumo {neg.textosOrigem === "ia" ? "(Agente Redator)" : "(texto padrão)"}</span>
          {neg.resumo}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="grid content-start gap-3 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border bg-white">
            <div className="border-b px-4 py-2.5 text-sm font-medium">E-mail do fornecedor</div>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[13px] leading-relaxed">
              {pedacos.map((p, i) =>
                p.tipo === "normal" ? <span key={i}>{p.texto}</span> : <mark key={i} className={p.tipo === "suspeito" ? "rounded bg-red-200 px-0.5" : "rounded bg-yellow-100 px-0.5"}>{p.texto}</mark>,
              )}
            </pre>
            {neg.anexos.map((a) => (
              <div key={a.nome} className="border-t px-4 py-3">
                <div className="mb-1.5 text-xs font-medium text-zinc-500">Anexo: {a.nome}</div>
                <TabelaCsv texto={a.texto} />
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-500">Amarelo: trecho usado como evidência. Vermelho: texto tentando comandar o sistema.</p>
        </section>

        <section className="grid content-start gap-4">
          {!conds.length && (
            <div className="rounded-xl border bg-white px-4 py-8 text-center text-sm text-zinc-500">
              {neg.status === "recebido" ? "Aguardando leitura (próxima rodada)." : "Nenhuma condição encontrada neste e-mail."}
            </div>
          )}
          {conds.map((c) => {
            const fs = farois.filter((f) => f.condicaoId === c.id) as Farol[];
            const cond = paraCondicao(c);
            const a = alcada(c.tipo, c.percentual, c.valor);
            const pa = podeAprovar(fs, APROVADORES.at(-1), cond, !!neg.conferidos);
            const vermelhos = fs.filter((f) => f.cor === "vermelho");
            const substituir = fs.find((f) => f.codigo === "POL-09" && f.acao === "substituir");
            const candidato = substituir ? (substituir.detalhe.match(/COND-\d{3}/)?.[0] ?? null) : null;
            return (
              <article key={c.id} className="rounded-xl border bg-white">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                  <h2 className="font-medium">
                    {c.ordem}. {c.titulo}
                    <span className="ml-2 text-sm font-normal text-zinc-500">{c.tipo === "DESCONTO_PERCENTUAL" ? fmtPct(c.percentual) : fmtBRL(c.valor)}</span>
                  </h2>
                  <span className="text-xs text-zinc-500">Alçada exigida: <b className="text-zinc-700">{a.label}</b></span>
                </header>
                <div className="grid gap-4 px-4 py-3">
                  {c.notas.length > 0 && (
                    <ul className="list-disc pl-5 text-xs text-zinc-600">
                      {c.notas.map((n) => <li key={n}>{n}</li>)}
                    </ul>
                  )}
                  <EditorCondicao
                    d={{
                      id: c.id,
                      tipo: c.tipo,
                      codFornecedor: c.codFornecedor,
                      codCategoria: c.codCategoria,
                      lojas: c.lojas,
                      percentual: c.percentual,
                      valor: c.valor,
                      dataInicio: c.dataInicio,
                      dataFim: c.dataFim,
                      contrapartida: c.contrapartida,
                      codCondicaoSubstituida: c.codCondicaoSubstituida,
                      alternativas: (c.proveniencia.valor?.alternativas as { valor: number; origem: string; trecho: string }[] | undefined) ?? null,
                      alternativaEscolhida: !!c.proveniencia.valor?.ajustado,
                      sugestaoFim: (c.proveniencia.data_fim?.sugestao as { valor: string; motivo: string } | undefined) ?? null,
                      substituirCandidato: candidato,
                      bloqueado: !emRevisao || !!c.aprovadaEm,
                    }}
                    fornecedores={opcoesForn}
                    categorias={opcoesCat}
                    lojas={opcoesLojas}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    {GRUPOS.map(({ g, dono }) => {
                      const doGrupo = fs.filter((f) => f.grupo === g);
                      if (!doGrupo.length) return null;
                      return (
                        <div key={g} className={cn(g === "Política" && "sm:col-span-2")}>
                          <div className="mb-1 flex items-baseline justify-between text-xs">
                            <span className="font-semibold uppercase tracking-wide text-zinc-600">{g}</span>
                            <span className="text-zinc-400">{dono}</span>
                          </div>
                          <ul className={cn("grid gap-1", g === "Política" && "sm:grid-cols-2 sm:gap-x-4")}>
                            {doGrupo.map((f) => (
                              <li key={f.codigo} className="flex gap-2 text-sm">
                                <Ponto cor={f.cor} className="mt-1.5" />
                                <div className="min-w-0">
                                  <span className="mr-1 font-mono text-[11px] text-zinc-400">{f.codigo}</span>
                                  <span className={cn("font-medium", f.cor === "cinza" && "text-zinc-400")}>{f.titulo}</span>
                                  {f.ref && <span className="ml-1 text-[11px] text-zinc-400">{f.ref}</span>}
                                  <p className={cn("text-xs", f.cor === "vermelho" ? "text-red-700" : "text-zinc-500")}>{f.detalhe}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                  <AprovarCondicao
                    condId={c.id}
                    emRevisao={emRevisao && !c.erpCodCondicao}
                    aprovada={c.aprovadaEm ? `Aprovada por ${c.aprovador?.nome} (${c.aprovador?.cargo}) em ${fmtDataHora(c.aprovadaEm)}${c.erpCodCondicao ? ` · gravada no ERP como ${c.erpCodCondicao}` : ""}` : null}
                    podeAgora={!vermelhos.length}
                    motivo={pa.ok ? null : vermelhos.length ? `Trava: ${vermelhos.map((f) => f.codigo).join(", ")}.` : pa.motivo.includes("Conferi") ? pa.motivo : null}
                    aprovadores={APROVADORES.map((ap) => ({ valor: ap.matricula, rotulo: `${ap.nome} — ${ap.cargo}`, alcadaOk: a.nivel != null && ap.nivel >= a.nivel }))}
                  />
                </div>
              </article>
            );
          })}

          {emRevisao && conds.length > 0 && (
            <div className="grid gap-3 rounded-xl border bg-white px-4 py-3">
              <h2 className="text-sm font-semibold">Decisão sobre a negociação</h2>
              <ConferirAmarelos negId={neg.id} n={amarelos} conferido={conferido} aprovadores={APROVADORES.map((a) => ({ valor: a.matricula, rotulo: a.nome }))} />
              <p className="text-xs text-zinc-500">
                As condições deste e-mail sobem juntas para o ERP: o pacote só vai para “Aguardando envio” quando todas estiverem aprovadas (premissa P11). Aprovadores são uma lista fictícia (premissa P9).
              </p>
              <Encerrar negId={neg.id} sugerirEscalar={sugerirEscalar} />
            </div>
          )}

          {(neg.rascunhoFornecedor || neg.memorando) && (
            <div className="grid gap-3 rounded-xl border bg-white px-4 py-3">
              <h2 className="text-sm font-semibold">Textos prontos {neg.textosOrigem === "ia" ? "(Agente Redator)" : "(padrão, sem IA)"}</h2>
              {neg.rascunhoFornecedor && <Texto titulo="Resposta ao fornecedor" texto={neg.rascunhoFornecedor} />}
              {neg.memorando && <Texto titulo="Memorando à Diretoria" texto={neg.memorando} />}
              <p className="text-xs text-zinc-500">Nada é enviado por e-mail pelo sistema: copie e envie pelo seu e-mail.</p>
            </div>
          )}

          <div className="rounded-xl border bg-white px-4 py-3">
            <h2 className="mb-2 text-sm font-semibold">Linha do tempo</h2>
            <ol className="grid gap-1.5 text-xs">
              {tempo.tentativas.map((t) => (
                <li key={t.id} className="flex gap-2">
                  <Ponto cor={t.resultado === "ok" ? "verde" : t.resultado === "transitorio" ? "amarelo" : "vermelho"} className="mt-1" />
                  <span className="w-28 shrink-0 tabular-nums text-zinc-500">{fmtDataHora(t.inicio)}</span>
                  <span>
                    <b>{TAREFA[t.tipo]}</b> · tentativa {t.n}
                    {t.httpStatus ? ` · HTTP ${t.httpStatus}` : ""} — {t.mensagem}
                  </span>
                </li>
              ))}
              {tempo.tarefas
                .filter((t) => t.status === "pendente")
                .map((t) => (
                  <li key={`p${t.id}`} className="flex gap-2 text-zinc-500">
                    <Ponto cor="cinza" className="mt-1" />
                    <span className="w-28 shrink-0 tabular-nums">{fmtDataHora(t.proximaEm)}</span>
                    <span><b>{TAREFA[t.tipo]}</b> agendada{t.ultimoErro ? ` (última falha: ${t.ultimoErro})` : ""}</span>
                  </li>
                ))}
              {!tempo.tentativas.length && !tempo.tarefas.length && <li className="text-zinc-500">Nada ainda.</li>}
            </ol>
          </div>
        </section>
      </div>
    </div>
  );
}

function Texto({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500">{titulo}</span>
        <Copiar texto={texto} />
      </div>
      <p className="whitespace-pre-wrap rounded-md bg-zinc-50 px-3 py-2 text-sm">{texto}</p>
    </div>
  );
}

function TabelaCsv({ texto }: { texto: string }) {
  const linhas = texto.trim().split(/\r?\n/).map((l) => l.split(";"));
  return (
    <table className="w-full text-xs">
      <thead>
        <tr>{linhas[0].map((h) => <th key={h} className="border-b px-1.5 py-1 text-left font-medium">{h}</th>)}</tr>
      </thead>
      <tbody>
        {linhas.slice(1).map((r, i) => (
          <tr key={i}>{r.map((x, j) => <td key={j} className="border-b px-1.5 py-1">{x}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
