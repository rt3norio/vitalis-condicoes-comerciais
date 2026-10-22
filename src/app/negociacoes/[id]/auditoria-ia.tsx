// Auditoria da IA (D14): rodada por rodada, cada chamada de agente com o que recebeu, tools e retorno.
import { Ponto } from "@/components/farol";
import type { Agente, RegistroIa } from "@/lib/agentes/agentes";
import { fmtDataHora } from "@/lib/dominio/datas";
import { cn } from "@/lib/utils";

const AGENTE: Record<Agente, string> = { extrator: "Agente Extrator", verificador: "Agente Verificador", redator: "Agente Redator", gerador: "Gerador de e-mails (demo)" };
const TAREFA: Record<string, string> = { ler_email: "Ler e-mail", verificar: "Verificar", redigir: "Redigir textos", enviar_erp: "Enviar ao ERP" };

export type ChamadaIa = {
  id: number;
  em: Date;
  origem: "ia" | "cache";
  geradoEm: string | null;
  tarefa: string | null;
  tentativa: number | null;
  rodadaEm: Date | null;
  registro: RegistroIa;
};

const num = (n: number | null) => (n == null ? "?" : n.toLocaleString("pt-BR"));

function Bloco({ titulo, texto, aberto }: { titulo: string; texto: string; aberto?: boolean }) {
  return (
    <details open={aberto} className="group/b">
      <summary className="cursor-pointer list-none font-semibold text-zinc-700">
        <span className="group-open/b:hidden">▸</span>
        <span className="hidden group-open/b:inline">▾</span> {titulo}
      </summary>
      <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 px-3 py-2 font-mono text-[11px] leading-relaxed ring-1 ring-zinc-200">{texto}</pre>
    </details>
  );
}

function Chamada({ c, n }: { c: ChamadaIa; n: number }) {
  const r = c.registro;
  return (
    <details className="rounded-lg border bg-white">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-xs">
        <Ponto cor={r.erro ? "vermelho" : "verde"} />
        <b>
          #{n} {AGENTE[r.agente]}
        </b>
        <span className={cn("rounded-full px-1.5 py-px ring-1 ring-inset", c.origem === "ia" ? "bg-teal-50 text-teal-800 ring-teal-200" : "bg-zinc-50 text-zinc-600 ring-zinc-200")}>
          {c.origem === "ia" ? "ao vivo" : "saída salva"}
        </span>
        <span className="text-zinc-500">
          {r.modelo} · {(r.ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s · {num(r.uso.entrada)} tokens entrada → {num(r.uso.saida)} saída
          {r.uso.raciocinio ? ` (${num(r.uso.raciocinio)} de raciocínio)` : ""}
        </span>
        <span className="ml-auto text-teal-700">abrir ▾</span>
      </summary>
      <div className="grid gap-2.5 border-t px-3 py-2.5 text-xs">
        {c.origem === "cache" && (
          <p className="text-zinc-500">
            Resposta real do modelo, gerada em {fmtDataHora(c.geradoEm)} por <code>pnpm gerar-cache-ia</code>. Nesta rodada não houve chamada nova (sem custo por visitante).
          </p>
        )}
        {r.erro && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-red-800 ring-1 ring-red-200">
            <b>Falhou:</b> {r.erro}
          </p>
        )}
        <Bloco titulo="Dados recebidos · mensagem enviada ao modelo" texto={r.mensagem} />
        <Bloco titulo="Dados recebidos · instruções do agente (system prompt)" texto={r.sistema} />
        <p>
          <b>Parâmetros:</b> temperatura {String(r.parametros.temperature)} · até 12.000 tokens de saída · raciocínio “low” · saída em JSON validado por schema (Zod)
        </p>
        <p>
          <b>Tools usadas:</b>{" "}
          {r.tools.length ? r.tools.map((t) => `${t.nome}(${JSON.stringify(t.entrada)})`).join(", ") : "nenhuma. O agente não tem ferramentas: só lê os dados acima e devolve o JSON abaixo."}
        </p>
        {r.raciocinio && <Bloco titulo="Raciocínio do modelo (como veio do provedor)" texto={r.raciocinio} />}
        {r.saida != null ? (
          <Bloco titulo="Retorno · o que o agente entregou" texto={JSON.stringify(r.saida, null, 2)} aberto />
        ) : (
          <Bloco titulo="Retorno · texto bruto (não passou no schema)" texto={r.textoBruto ?? "(sem resposta)"} aberto />
        )}
      </div>
    </details>
  );
}

export function AuditoriaIa({ chamadas, semIa }: { chamadas: ChamadaIa[]; semIa: string | null }) {
  // agrupa por rodada: mesma tarefa + mesma tentativa (o Gerador não tem tarefa: fica no próprio grupo)
  const grupos: { chave: string; titulo: string; quando: Date | null; itens: ChamadaIa[] }[] = [];
  for (const c of chamadas) {
    const chave = c.tarefa ? `${c.tarefa}#${c.tentativa}` : `g${c.id}`;
    const ultimo = grupos.at(-1);
    if (ultimo?.chave === chave) ultimo.itens.push(c);
    else grupos.push({ chave, titulo: c.tarefa ? `${TAREFA[c.tarefa] ?? c.tarefa} · tentativa ${c.tentativa}` : "Botão “Gerar novos e-mails (IA)”", quando: c.rodadaEm ?? c.em, itens: [c] });
  }
  let n = 0;
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">Auditoria da IA · rodada por rodada</div>
      <p className="mb-2 text-xs text-zinc-500">Cada chamada de agente: os dados que recebeu, as tools que usou e o retorno que entregou. O sistema usa o retorno só como sugestão: regras, faróis e aprovação são calculados por código.</p>
      {!chamadas.length && <p className="text-xs text-zinc-500">{semIa ?? "Nenhuma chamada de IA ainda."}</p>}
      <ol className="grid gap-3">
        {grupos.map((g) => (
          <li key={g.chave} className="grid gap-1.5">
            <div className="flex items-baseline gap-2 text-xs">
              <span className="font-semibold text-zinc-700">Rodada · {g.titulo}</span>
              <span className="tabular-nums text-zinc-500">{fmtDataHora(g.quando)}</span>
            </div>
            {g.itens.map((c) => (
              <Chamada key={c.id} c={c} n={++n} />
            ))}
          </li>
        ))}
      </ol>
    </div>
  );
}
