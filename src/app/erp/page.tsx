// O que está gravado no ERP simulado desta sessão e as últimas chamadas recebidas (apoio à demo).
import { Suspense } from "react";
import { AutoAtualizar } from "@/components/barra-topo";
import { estadoErp } from "@/lib/consultas";
import { fmtBRL, fmtData, fmtDataHora, fmtPct } from "@/lib/dominio/datas";
import { sessaoAtual } from "@/lib/sessao";
import { cn } from "@/lib/utils";

export default function Pagina() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
      <Erp />
    </Suspense>
  );
}

async function Erp() {
  const sid = await sessaoAtual();
  const { conds, chamadas } = await estadoErp(sid);
  return (
    <div className="grid gap-5">
      <AutoAtualizar ms={5000} />
      <div>
        <h1 className="text-xl font-semibold">ERP simulado</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Reproduz o contrato do mock_erp (POST /condicoes com Idempotency-Key, limite de 10 chamadas/min, ~1 em 5 chamadas com 503). Cada sessão tem o seu ERP, que começa na captura de 30/09/2026 08:15.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              {["Código", "Fornecedor", "Categoria", "Tipo", "Valor", "Lojas", "Vigência", "Status", "Alteração"].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {conds.map((c) => (
              <tr key={c.cod_condicao} className={cn("border-b last:border-0", Number(c.cod_condicao.slice(5)) > 10 && "bg-emerald-50")}>
                <td className="px-3 py-2 font-mono text-xs">{c.cod_condicao}</td>
                <td className="px-3 py-2">{c.cod_fornecedor}</td>
                <td className="px-3 py-2">{c.cod_categoria}</td>
                <td className="px-3 py-2 text-xs">{c.tipo === "DESCONTO_PERCENTUAL" ? "Desconto" : "Verba"}</td>
                <td className="px-3 py-2 tabular-nums">{c.tipo === "DESCONTO_PERCENTUAL" ? fmtPct(c.percentual) : fmtBRL(c.valor)}</td>
                <td className="px-3 py-2 text-xs">{c.lojas.join(", ")}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtData(c.data_inicio)} a {fmtData(c.data_fim)}</td>
                <td className="px-3 py-2 text-xs">{c.status}</td>
                <td className="px-3 py-2 text-xs text-zinc-500">{c.alterado_por ? `${c.alterado_por} · ${fmtDataHora(c.ultima_alteracao)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-xl border bg-white px-4 py-3">
        <h2 className="mb-2 text-sm font-semibold">Últimas chamadas recebidas</h2>
        <ol className="grid gap-1 font-mono text-xs">
          {chamadas.map((c) => (
            <li key={c.id} className="flex gap-3">
              <span className="w-28 text-zinc-500">{fmtDataHora(c.em)}</span>
              <span className="w-10">{c.metodo}</span>
              <span className="w-56 truncate">{c.caminho}</span>
              <span className={cn("w-10", c.status >= 400 ? "text-red-600" : "text-emerald-700")}>{c.status}</span>
              <span className="text-zinc-500">{c.erro ?? ""}</span>
            </li>
          ))}
          {!chamadas.length && <li className="text-zinc-500">Nenhuma chamada ainda.</li>}
        </ol>
      </div>
    </div>
  );
}
