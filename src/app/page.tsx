// Painel (S24): tabela única de negociações; botões de status funcionam como filtro da mesma tabela.
// Sem faróis na tabela (D17): eles ficam na tela da negociação.
import Link from "next/link";
import { Suspense } from "react";
import { AutoAtualizar, BotoesTopo, ProximaRodada } from "@/components/barra-topo";
import { StatusBadge } from "@/components/farol";
import { iaConfigurada } from "@/lib/agentes/agentes";
import { listarNegociacoes, usoErpUltimoMinuto } from "@/lib/consultas";
import { fmtData, fmtDataHora, hoje } from "@/lib/dominio/datas";
import { STATUS, STATUS_LABEL, type Status } from "@/lib/dominio/tipos";
import { sessaoAtual } from "@/lib/sessao";
import { perfilAtual, podeVer } from "@/lib/perfil";
import { proximaRodadaEm } from "@/lib/tarefas/fila";
import { cn } from "@/lib/utils";

export default function Pagina(props: PageProps<"/">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
      <Painel searchParams={props.searchParams} />
    </Suspense>
  );
}

const TAREFA_LABEL = { ler_email: "lendo e-mail", verificar: "verificando", redigir: "redigindo textos", enviar_erp: "enviando ao ERP" } as const;

async function Painel({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const sid = await sessaoAtual();
  const { status: filtroBruto } = await searchParams;
  const filtro = STATUS.includes(filtroBruto as Status) ? (filtroBruto as Status) : null;
  const [{ linhas: todas }, uso, prox, perfil] = await Promise.all([listarNegociacoes(sid), usoErpUltimoMinuto(sid), proximaRodadaEm(), perfilAtual()]);
  // escalados só para o destino (Diretoria/Comitê) e para quem escalou
  const linhas = todas.filter((l) => podeVer(l, perfil));
  const ocultos = todas.length - linhas.length;
  const contagem = Object.fromEntries(STATUS.map((st) => [st, linhas.filter((l) => l.status === st).length])) as Record<Status, number>;
  const total = linhas.length;
  const visiveis = filtro ? linhas.filter((l) => l.status === filtro) : linhas;
  const ia = iaConfigurada();

  return (
    <div className="grid gap-5">
      <AutoAtualizar />
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Negociações recebidas</h1>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
            <span>Data de operação: <b className="text-zinc-700">{fmtData(hoje())}</b> (data real)</span>
            <span>ERP: <b className="text-zinc-700 tabular-nums">{uso}/10</b> chamadas no último minuto</span>
            <span>Processamento a cada minuto · <ProximaRodada em={prox?.toISOString() ?? null} /></span>
          </p>
        </div>
        <BotoesTopo ia={ia} />
      </section>

      {!ia && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          IA não configurada neste ambiente: os 4 e-mails do dataset usam uma <b>leitura de referência feita à mão</b> e o Verificador não roda. E-mails novos ficam em “Recebido” até a IA ser configurada.
        </div>
      )}

      <nav className="flex flex-wrap gap-2" aria-label="Filtrar por status">
        <Filtro href="/" ativo={!filtro} rotulo="Todos" n={total} />
        {STATUS.map((st) => (
          <Filtro key={st} href={`/?status=${st}`} ativo={filtro === st} rotulo={STATUS_LABEL[st]} n={contagem[st]} />
        ))}
      </nav>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Fornecedor</th>
              <th className="px-4 py-2.5 font-medium">Assunto</th>
              <th className="px-4 py-2.5 font-medium">Recebido</th>
              <th className="px-4 py-2.5 font-medium">Condições</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Andamento</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.id} className="border-b last:border-0 hover:bg-zinc-50">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/negociacoes/${l.id}`} className="hover:underline">{l.remetente.replace(/<.*>/, "").trim() || l.dominio}</Link>
                  <div className="text-xs font-normal text-zinc-500">@{l.dominio || "?"}</div>
                </td>
                <td className="max-w-[15rem] truncate px-4 py-3" title={l.assunto}>
                  <Link href={`/negociacoes/${l.id}`} className="hover:underline">{l.assunto}</Link>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-zinc-600">{fmtDataHora(l.recebidoEm)}</td>
                <td className="px-4 py-3 tabular-nums">{l.nCondicoes ? `${l.nAprovadas}/${l.nCondicoes} aprovadas` : "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={l.status} />
                    {l.instrucoesSuspeitas.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white">
                        ⚠ texto suspeito
                      </span>
                    )}
                  </div>
                </td>
                <td className="max-w-[11rem] px-4 py-3 text-xs text-zinc-600">
                  {l.tarefa ? (
                    <span className={cn(l.tarefa.erro && "text-amber-700")}>
                      {TAREFA_LABEL[l.tarefa.tipo]}
                      {l.tarefa.erro
                        ? `${l.tarefa.http ? ` · ERP falhou (HTTP ${l.tarefa.http})` : " · falhou"}, nova tentativa ${fmtDataHora(l.tarefa.prox).split(" ")[1]}`
                        : " · na fila"}
                    </span>
                  ) : l.status === "revisao" ? (
                    <span className="text-violet-700">aguardando decisão</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {!visiveis.length && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">Nada neste status.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {ocultos > 0 && (
        <p className="text-xs text-zinc-500">{ocultos} negociação(ões) escalada(s) à Diretoria não aparece(m) para o seu perfil ({perfil.cargo}).</p>
      )}
      <p className="text-xs text-zinc-500">
        Cada linha é um e-mail (uma negociação). Ela anda sozinha de Recebido até Revisão; só uma pessoa com alçada move para Aguardando envio. O envio ao ERP também é uma tarefa em segundo plano, que tenta de novo se o ERP falhar.
      </p>
    </div>
  );
}

function Filtro({ href, ativo, rotulo, n }: { href: string; ativo: boolean; rotulo: string; n: number }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors",
        ativo ? "border-teal-700 bg-teal-700 text-white" : "bg-white hover:bg-zinc-100",
        !n && !ativo && "text-zinc-400",
      )}
    >
      {rotulo}
      <span className={cn("rounded-md px-1.5 text-xs tabular-nums", ativo ? "bg-white/20" : "bg-zinc-100")}>{n}</span>
    </Link>
  );
}
