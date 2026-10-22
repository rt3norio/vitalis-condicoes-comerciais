// Tela da negociação: e-mail com evidências à esquerda; condições, faróis e decisão à direita.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AutoAtualizar } from "@/components/barra-topo";
import { FaixaFarois, Ponto, StatusBadge } from "@/components/farol";
import { iaConfigurada } from "@/lib/agentes/agentes";
import { linhaDoTempo } from "@/lib/consultas";
import { capturaErp } from "@/lib/dominio/dataset";
import { fmtBRL, fmtDataHora, fmtPct } from "@/lib/dominio/datas";
import { alcada } from "@/lib/dominio/politica";
import { CATEGORIA_LABEL, CATEGORIAS, type Farol, type Grupo } from "@/lib/dominio/tipos";
import { destacar } from "@/lib/destacar";
import { carregar, snapshotSalvo } from "@/lib/negociacao";
import { amarelosSemCiencia, temCiencia } from "@/lib/regras/ciencia";
import { FAROIS_DO_CAMPO, piorCor } from "@/lib/regras/farois";
import { sessaoAtual } from "@/lib/sessao";
import { perfilAtual, podeVer } from "@/lib/perfil";
import { cn } from "@/lib/utils";
import { AuditoriaIa } from "./auditoria-ia";
import { AprovarCondicao, BotaoCiencia, BotaoGerarTexto, BotaoReabrir, BotaoReler, Copiar, EditorCondicao, Encerrar } from "./cliente";

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

const NO_CAMPO = new Set<string>(Object.values(FAROIS_DO_CAMPO).flat());

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
  const perfil = await perfilAtual();
  if (!podeVer(neg, perfil))
    return (
      <div className="grid gap-3 rounded-xl border bg-white px-6 py-10 text-center">
        <p className="text-lg font-semibold">Negociação escalada à Diretoria Comercial</p>
        <p className="text-sm text-zinc-600">Só a Diretoria, o Comitê e quem escalou veem os detalhes. Você está como {perfil.nome} ({perfil.cargo}); troque o perfil no topo se for o caso.</p>
        <Link href="/" className="text-sm text-teal-700 hover:underline">← Voltar ao painel</Link>
      </div>
    );
  const [snap, tempo] = await Promise.all([snapshotSalvo(sid), linhaDoTempo(id)]);
  const fornecedores = snap?.fornecedores ?? capturaErp.fornecedores;
  const lojas = snap?.lojas ?? capturaErp.lojas;
  const emRevisao = neg.status === "revisao";
  const farolNeg = farois.filter((f) => f.condicaoId == null);
  const suspeita = farolNeg.find((f) => f.codigo === "LEI-09" && f.cor === "vermelho");
  const sugerirEscalar = farois.some((f) => f.acao === "escalar" && f.cor === "vermelho");

  const evidencias = (leitura?.saidaExtrator.condicoes ?? []).flatMap((k) => [k.categoria, k.lojas, k.valor, k.data_inicio, k.data_fim, k.contrapartida].map((c) => c.trecho)).concat(leitura?.saidaExtrator.fornecedor.trecho ?? "");
  const pedacos = destacar(neg.corpo, evidencias.filter(Boolean));

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
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">
          <span aria-hidden>⚠</span> Texto suspeito
          <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">Escalado à Diretoria Comercial</span>
        </div>
      )}
      {neg.alertaRevisao && emRevisao && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <b>Voltou para revisão:</b> {neg.alertaRevisao}
        </div>
      )}
      {neg.motivoSaida && ["escalado", "recusado"].includes(neg.status) && !suspeita && (
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
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Resumo {neg.textosOrigem === "ia" ? "(Agente Redator)" : "(texto padrão)"}</div>
          <ul className="list-disc space-y-0.5 pl-5">
            {neg.resumo.split("\n").filter(Boolean).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-5">
        <details className="group rounded-xl border bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="font-medium">
              E-mail original do fornecedor
              {neg.anexos.length > 0 && <span className="ml-2 font-normal text-zinc-500">+ {neg.anexos.length} anexo(s)</span>}
            </span>
            <span className="text-teal-700 group-open:hidden">Ver e-mail original ▾</span>
            <span className="hidden text-teal-700 group-open:inline">Recolher ▴</span>
          </summary>
          <div className="border-t">
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[13px] leading-relaxed">
              {pedacos.map((p, i) =>
                p.tipo === "normal" ? <span key={i}>{p.texto}</span> : <mark key={i} title="Trecho usado como evidência" className="rounded bg-yellow-100 px-0.5">{p.texto}</mark>,
              )}
            </pre>
            {neg.anexos.map((a) => (
              <div key={a.nome} className="border-t px-4 py-3">
                <div className="mb-1.5 text-xs font-medium text-zinc-500">Anexo: {a.nome}</div>
                <TabelaCsv texto={a.texto} />
              </div>
            ))}
            <p className="border-t px-4 py-2 text-xs text-zinc-500">Destaque amarelo: trecho usado como evidência.</p>
          </div>
        </details>

        {/* textos para enviar logo abaixo do e-mail, um por destinatário, recolhidos (D19); gerados quando a pessoa pede (D20) */}
        {(conds.length > 0 || neg.status === "escalado") && (
          <TextoParaEnviar negId={neg.id} destino="fornecedor" titulo="Resposta ao fornecedor" para={neg.remetente} texto={neg.rascunhoFornecedor} meta={neg.textosMeta.fornecedor} />
        )}
        {(sugerirEscalar || neg.status === "escalado") && (
          <TextoParaEnviar negId={neg.id} destino="diretoria" titulo="Memorando à Diretoria" para="Diretoria Comercial" texto={neg.memorando} meta={neg.textosMeta.diretoria} />
        )}

        <section className="grid content-start gap-4">
          {!conds.length && (
            <div className="rounded-xl border bg-white px-4 py-8 text-center text-sm text-zinc-500">
              {neg.status === "recebido" ? "Aguardando leitura (próxima rodada)." : "Nenhuma condição encontrada neste e-mail."}
            </div>
          )}
          {conds.map((c) => {
            const fs = farois.filter((f) => f.condicaoId === c.id) as Farol[];
            const a = alcada(c.tipo, c.percentual, c.valor);
            const fsCond = farois.filter((f) => f.condicaoId === c.id);
            const pendentesCiencia = amarelosSemCiencia(fsCond, neg.ciencias);
            const vermelhos = fs.filter((f) => f.cor === "vermelho");
            const substituir = fs.find((f) => f.codigo === "POL-09" && f.acao === "substituir");
            const candidato = substituir ? (substituir.detalhe.match(/COND-\d{3}/)?.[0] ?? null) : null;
            return (
              <article key={c.id} className="rounded-xl border bg-white">
                <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2.5">
                  <h2 className="font-medium">
                    {c.ordem}. {c.titulo}
                    <span className="ml-2 text-sm font-normal text-zinc-500">{c.tipo === "DESCONTO_PERCENTUAL" ? fmtPct(c.percentual) : fmtBRL(c.valor)}</span>
                  </h2>
                  <span className="text-xs text-zinc-500">Alçada exigida: <b className="text-zinc-700">{a.label}</b></span>
                </header>
                <div className="grid gap-4 px-4 py-3">
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
                    pontos={Object.fromEntries(
                      Object.entries(FAROIS_DO_CAMPO).map(([campo, cods]) => {
                        const ordem = { vermelho: 0, amarelo: 1, verde: 2, cinza: 3 } as const;
                        const rel = fs.filter((f) => (cods as readonly string[]).includes(f.codigo) && f.cor !== "cinza").sort((x, y) => ordem[x.cor] - ordem[y.cor]);
                        return [campo, { cor: piorCor(rel), itens: rel.map((f) => ({ codigo: f.codigo, cor: f.cor, titulo: f.titulo, detalhe: f.detalhe, ciente: temCiencia(neg.ciencias, { ...f, condicaoId: c.id }) })) }];
                      }),
                    )}
                    negId={neg.id}
                    fornecedores={opcoesForn}
                    categorias={opcoesCat}
                    lojas={opcoesLojas}
                  />
                  {vermelhos.length > 0 && (
                    <ul className="grid gap-0.5 text-sm text-red-700">
                      {vermelhos.map((f) => (
                        <li key={f.codigo} className="flex gap-2">
                          <Ponto cor="vermelho" className="mt-1.5" />
                          <span><b>{f.titulo}:</b> {f.detalhe}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {fsCond.some((f) => f.cor === "amarelo" && !NO_CAMPO.has(f.codigo)) && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2">
                      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">Também precisa de ciência</div>
                      <ul className="grid gap-1.5 text-sm">
                        {fsCond
                          .filter((f) => f.cor === "amarelo" && !NO_CAMPO.has(f.codigo))
                          .map((f) => {
                            const ciente = temCiencia(neg.ciencias, f);
                            const quando = neg.ciencias[`${f.codigo}#${c.id}`]?.em;
                            return (
                              <li key={f.codigo} className="flex items-start justify-between gap-3">
                                <span className="flex gap-2">
                                  <Ponto cor="amarelo" className="mt-1.5" />
                                  <span className={cn(ciente && "text-zinc-500")}>
                                    <b>{f.titulo}:</b> {f.detalhe}
                                  </span>
                                </span>
                                <BotaoCiencia negId={neg.id} codigo={f.codigo} condicaoId={c.id} ciente={ciente} quando={ciente && quando ? `${neg.ciencias[`${f.codigo}#${c.id}`]?.por ?? ""} · ${fmtDataHora(quando)}` : null} desabilitado={!emRevisao || !!c.aprovadaEm} />
                              </li>
                            );
                          })}
                      </ul>
                    </div>
                  )}
                  <AprovarCondicao
                    condId={c.id}
                    emRevisao={emRevisao && !c.erpCodCondicao}
                    aprovada={c.aprovadaEm ? `Aprovada por ${c.aprovador?.nome} (${c.aprovador?.cargo}) em ${fmtDataHora(c.aprovadaEm)}${c.erpCodCondicao ? ` · gravada no ERP como ${c.erpCodCondicao}` : ""}` : null}
                    podeAgora={!vermelhos.length && pendentesCiencia.length === 0}
                    motivo={vermelhos.length ? "Resolva os itens em vermelho acima para liberar a aprovação." : pendentesCiencia.length ? `Dê ciência nos ${pendentesCiencia.length} item(ns) amarelo(s) antes de aprovar.` : null}
                    perfil={{ nome: perfil.nome, cargo: perfil.cargo }}
                    alcadaOk={a.nivel != null && perfil.nivel >= a.nivel}
                    alcadaLabel={a.label}
                  />
                </div>
              </article>
            );
          })}

          {emRevisao && conds.length > 0 && (
            <div className="grid gap-3 rounded-xl border bg-white px-4 py-3">
              <h2 className="text-sm font-semibold">Outra decisão</h2>
              <Encerrar negId={neg.id} sugerirEscalar={sugerirEscalar} />
            </div>
          )}

          <details className="group rounded-xl border border-dashed bg-white/60">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm text-zinc-600">
              <span className="font-medium">Detalhes para auditoria · faróis, IA rodada por rodada e linha do tempo (quem fez o quê)</span>
              <span className="text-teal-700 group-open:hidden">abrir ▾</span>
              <span className="hidden text-teal-700 group-open:inline">recolher ▴</span>
            </summary>
            <div className="grid gap-5 border-t px-4 py-3">
              {conds.map((c) => {
                const fs = farois.filter((f) => f.condicaoId === c.id) as Farol[];
                return (
                  <div key={c.id} className="grid gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm font-semibold">
                        {c.ordem}. {c.titulo}
                      </span>
                      <FaixaFarois farois={fs} rotulos />
                    </div>
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
                    {c.notas.length > 0 && (
                      <div>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">Observações da IA (Extrator)</div>
                        <ul className="list-disc pl-5 text-xs text-zinc-600">
                          {c.notas.map((n) => (
                            <li key={n}>{n}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">Linha do tempo · sistema e pessoas (ciência, escolhas, edições, aprovações, escalonamentos)</div>
                <ol className="grid gap-1.5 text-xs">
                  {tempo.itens.map((it) => (
                    <li key={it.chave} className={cn("flex gap-2", it.cor === "pessoa" && "rounded bg-teal-50/60 py-0.5")}>
                      {it.cor === "pessoa" ? (
                        <span aria-label="ação de pessoa" className="mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full bg-teal-700 text-[8px] font-bold text-white">P</span>
                      ) : (
                        <Ponto cor={it.cor as "verde" | "amarelo" | "vermelho"} className="mt-1" />
                      )}
                      <span className="w-28 shrink-0 tabular-nums text-zinc-500">{fmtDataHora(it.em)}</span>
                      <span>
                        {it.tarefa ? (
                          <>
                            <b>{TAREFA[it.tarefa]}</b> · tentativa {it.n}
                            {it.http ? ` · HTTP ${it.http}` : ""} — {it.texto}
                          </>
                        ) : (
                          <>
                            <b>{it.quem}</b> — {it.texto}
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                  {tempo.tarefas
                    .filter((t) => t.status === "pendente")
                    .map((t) => (
                      <li key={`p${t.id}`} className="flex gap-2 text-zinc-500">
                        <Ponto cor="cinza" className="mt-1" />
                        <span className="w-28 shrink-0 tabular-nums">{fmtDataHora(t.proximaEm)}</span>
                        <span>
                          <b>{TAREFA[t.tipo]}</b> agendada{t.ultimoErro ? ` (última falha: ${t.ultimoErro})` : ""}
                        </span>
                      </li>
                    ))}
                  {!tempo.itens.length && !tempo.tarefas.length && <li className="text-zinc-500">Nada ainda.</li>}
                </ol>
              </div>
              <AuditoriaIa chamadas={tempo.ia} semIa={leitura?.origem === "referencia_manual" ? "Nenhuma chamada de IA: leitura de referência manual (IA não configurada neste ambiente)." : null} />
              <p className="text-xs text-zinc-500">
                Premissas: as condições deste e-mail sobem juntas para o ERP (P11); aprovadores são uma lista fictícia (P9); escalados só são vistos pela Diretoria/Comitê e por quem escalou.
                {leitura && ` Leitura: ${ORIGEM_LEITURA[leitura.origem].rotulo}${leitura.modeloExtrator ? ` (${leitura.modeloExtrator})` : ""}.`}
              </p>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}

type MetaTexto = { em: string; por: string; origem: "ia" | "padrao"; modelo: string | null };

function TextoParaEnviar({ negId, destino, titulo, para, texto, meta }: { negId: number; destino: "fornecedor" | "diretoria"; titulo: string; para: string; texto: string | null; meta?: MetaTexto }) {
  return (
    <details className="group rounded-xl border bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm">
        <span>
          <span className="font-medium">{titulo}</span>
          <span className="ml-2 text-zinc-500">para {para}</span>
        </span>
        <span className="shrink-0 text-teal-700 group-open:hidden">{texto ? "Ver texto ▾" : "Gerar ▾"}</span>
        <span className="hidden shrink-0 text-teal-700 group-open:inline">Recolher ▴</span>
      </summary>
      <div className="grid gap-2 border-t px-4 py-3">
        {texto ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-zinc-500">
                {meta ? `${meta.origem === "ia" ? `Agente Redator (${meta.modelo})` : "Texto padrão (sem IA)"} · pedido por ${meta.por} em ${fmtDataHora(meta.em)} · ` : ""}
                nada é enviado pelo sistema: copie e envie pelo seu e-mail.
              </span>
              <span className="flex gap-2">
                <BotaoGerarTexto negId={negId} destino={destino} jaTem />
                <Copiar texto={texto} />
              </span>
            </div>
            <p className="whitespace-pre-wrap rounded-md bg-zinc-50 px-3 py-2 text-sm">{texto}</p>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-zinc-500">Ainda não gerado. O Agente Redator escreve sobre o estado atual da negociação (campos, escolhas, aprovações).</span>
            <BotaoGerarTexto negId={negId} destino={destino} />
          </div>
        )}
      </div>
    </details>
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
