"use client";
// Partes interativas da negociação. Toda mudança chama uma Server Action, que recalcula os faróis.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  aceitarSugestao,
  aprovarCondicao,
  darCiencia,
  darCienciaItens,
  desfazerCiencia,
  definirSubstituicao,
  desfazerAprovacao,
  editarCampo,
  encerrar,
  escolherAlternativa,
  gerarTexto,
  reabrir,
  relerComIa,
} from "@/app/acoes";
import { avisar } from "@/components/barra-topo";
import { Ponto } from "@/components/farol";
import type { Cor } from "@/lib/dominio/tipos";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const inputCls =
  "h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 disabled:bg-zinc-100 disabled:text-zinc-500";

type Opcao = { valor: string; rotulo: string };
type ItemDica = { codigo: string; cor: Cor; titulo: string; detalhe: string; ciente?: boolean };
type PontoCampo = { cor: Cor; itens: ItemDica[] };
type Pontos = Partial<Record<"codFornecedor" | "codCategoria" | "valor" | "dataInicio" | "dataFim" | "lojas" | "contrapartida", PontoCampo>>;

export type DadosEditor = {
  id: number;
  tipo: "DESCONTO_PERCENTUAL" | "VERBA_EXPOSICAO";
  codFornecedor: string | null;
  codCategoria: string | null;
  lojas: string[];
  percentual: number | null;
  valor: number | null;
  dataInicio: string | null;
  dataFim: string | null;
  contrapartida: string;
  codCondicaoSubstituida: string | null;
  alternativas: { valor: number; origem: string; trecho: string }[] | null;
  alternativaEscolhida: boolean;
  sugestaoFim: { valor: string; motivo: string } | null;
  substituirCandidato: string | null;
  bloqueado: boolean;
};

export function EditorCondicao({ d, negId, fornecedores, categorias, lojas, pontos = {} }: { d: DadosEditor; negId: number; fornecedores: Opcao[]; categorias: Opcao[]; lojas: Opcao[]; pontos?: Pontos }) {
  const ciencia = { negId, condId: d.id, desabilitado: d.bloqueado };
  const [pend, start] = useTransition();
  const salvar = (campo: Parameters<typeof editarCampo>[1], valor: string | string[] | null) => start(async () => avisar(await editarCampo(d.id, campo, valor)));
  const dis = d.bloqueado || pend;
  const campoValor = d.tipo === "DESCONTO_PERCENTUAL" ? "percentual" : "valor";
  const valorAtual = d.tipo === "DESCONTO_PERCENTUAL" ? d.percentual : d.valor;
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", pend && "opacity-70")}>
      <Campo rotulo="Fornecedor (ERP)" ponto={pontos.codFornecedor} ciencia={ciencia}>
        <select key={`f-${d.codFornecedor}`} className={inputCls} defaultValue={d.codFornecedor ?? ""} disabled={dis} onChange={(e) => salvar("codFornecedor", e.target.value)}>
          <option value="">— escolha —</option>
          {fornecedores.map((o) => (
            <option key={o.valor} value={o.valor}>{o.rotulo}</option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Categoria (ERP)" ponto={pontos.codCategoria} ciencia={ciencia}>
        <select key={`c-${d.codCategoria}`} className={inputCls} defaultValue={d.codCategoria ?? ""} disabled={dis} onChange={(e) => salvar("codCategoria", e.target.value)}>
          <option value="">— escolha —</option>
          {categorias.map((o) => (
            <option key={o.valor} value={o.valor}>{o.rotulo}</option>
          ))}
        </select>
      </Campo>
      <Campo rotulo={d.tipo === "DESCONTO_PERCENTUAL" ? "Desconto (%)" : "Verba (R$, total)"} ponto={pontos.valor} ciencia={ciencia}>
        {d.alternativas && (
          <div className="mb-1.5 grid gap-1">
            {d.alternativas.map((a) => (
              <button
                key={`${a.origem}-${a.valor}`}
                type="button"
                disabled={dis}
                onClick={() => start(async () => avisar(await escolherAlternativa(d.id, a.valor)))}
                className={cn(
                  "rounded-md border px-2 py-1 text-left text-xs hover:bg-teal-50",
                  d.alternativaEscolhida && valorAtual === a.valor ? "border-teal-600 bg-teal-50" : "border-zinc-300 bg-white",
                )}
              >
                <b>{String(a.valor).replace(".", ",")}</b> · {a.origem} <span className="text-zinc-500">“{a.trecho}”</span>
              </button>
            ))}
          </div>
        )}
        <input key={`v-${valorAtual}`} className={inputCls} type="number" step="0.01" min="0" defaultValue={valorAtual ?? ""} disabled={dis} onBlur={(e) => e.target.value !== String(valorAtual ?? "") && salvar(campoValor, e.target.value)} />
      </Campo>
      <div className="grid grid-cols-2 gap-2">
        <Campo rotulo="Início" ponto={pontos.dataInicio} ciencia={ciencia}>
          <input key={`i-${d.dataInicio}`} className={inputCls} type="date" defaultValue={d.dataInicio ?? ""} disabled={dis} onBlur={(e) => e.target.value !== (d.dataInicio ?? "") && salvar("dataInicio", e.target.value)} />
        </Campo>
        <Campo rotulo="Fim" ponto={pontos.dataFim} ciencia={ciencia}>
          <input key={`e-${d.dataFim}`} className={inputCls} type="date" defaultValue={d.dataFim ?? ""} disabled={dis} onBlur={(e) => e.target.value !== (d.dataFim ?? "") && salvar("dataFim", e.target.value)} />
          {d.sugestaoFim && !d.dataFim && (
            <button type="button" disabled={dis} className="mt-1 text-left text-xs text-teal-700 underline" onClick={() => start(async () => avisar(await aceitarSugestao(d.id, "dataFim")))}>
              Usar {d.sugestaoFim.valor.split("-").reverse().join("/")} ({d.sugestaoFim.motivo})
            </button>
          )}
        </Campo>
      </div>
      <Campo rotulo="Lojas" largo ponto={pontos.lojas} ciencia={ciencia}>
        <EditorLojas d={d} lojas={lojas} dis={dis} onSalvar={(v) => salvar("lojas", v)} />
      </Campo>
      <Campo rotulo={d.tipo === "VERBA_EXPOSICAO" ? "Contrapartida (obrigatória em verba)" : "Contrapartida"} largo ponto={pontos.contrapartida} ciencia={ciencia}>
        <Textarea key={`t-${d.contrapartida}`} rows={2} defaultValue={d.contrapartida} disabled={dis} className="text-sm" onBlur={(e) => e.target.value !== d.contrapartida && salvar("contrapartida", e.target.value)} />
      </Campo>
      {(d.substituirCandidato || d.codCondicaoSubstituida) && (
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm">
          {d.codCondicaoSubstituida ? (
            <>
              <span>Esta condição vai <b>substituir {d.codCondicaoSubstituida}</b> (o ERP encerra a antiga na véspera do início).</span>
              <Button size="xs" variant="outline" disabled={dis} onClick={() => start(async () => avisar(await definirSubstituicao(d.id, null)))}>Desfazer</Button>
            </>
          ) : (
            <>
              <span>Já existe <b>{d.substituirCandidato}</b> nas mesmas lojas e período.</span>
              <Button size="xs" disabled={dis} onClick={() => start(async () => avisar(await definirSubstituicao(d.id, d.substituirCandidato)))}>
                Substituir {d.substituirCandidato}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EditorLojas({ d, lojas, dis, onSalvar }: { d: DadosEditor; lojas: Opcao[]; dis: boolean; onSalvar: (v: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(d.lojas);
  const [aberto, setAberto] = useState(false);
  const rede = sel.includes("REDE");
  const rotulo = (cod: string) => (cod === "REDE" ? "Toda a rede" : (lojas.find((l) => l.valor === cod)?.rotulo ?? cod));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        {d.lojas.length ? d.lojas.map((l) => <span key={l} className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">{rotulo(l)}</span>) : <span className="text-xs text-red-600">nenhuma</span>}
        {!d.bloqueado && (
          <button type="button" className="ml-1 text-xs text-teal-700 underline" onClick={() => setAberto((x) => !x)}>
            {aberto ? "fechar" : "editar lojas"}
          </button>
        )}
      </div>
      {aberto && (
        <div className="mt-2 rounded-md border bg-white p-2">
          <label className="mb-1 flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={rede} onChange={(e) => setSel(e.target.checked ? ["REDE"] : [])} /> Toda a rede
          </label>
          <div className="grid max-h-48 grid-cols-2 gap-x-3 overflow-auto text-xs sm:grid-cols-3">
            {lojas.map((l) => (
              <label key={l.valor} className={cn("flex items-center gap-1.5 py-0.5", rede && "opacity-40")}>
                <input
                  type="checkbox"
                  disabled={rede}
                  checked={sel.includes(l.valor)}
                  onChange={(e) => setSel((s) => (e.target.checked ? [...s, l.valor] : s.filter((x) => x !== l.valor)).sort())}
                />
                {l.rotulo}
              </label>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="xs" disabled={dis} onClick={() => { onSalvar(sel); setAberto(false); }}>Salvar lojas</Button>
            <Button size="xs" variant="ghost" onClick={() => { setSel(d.lojas); setAberto(false); }}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

type CienciaCtx = { negId: number; condId: number; desabilitado: boolean };

function Campo({ rotulo, largo, ponto, ciencia, children }: { rotulo: string; largo?: boolean; ponto?: PontoCampo; ciencia?: CienciaCtx; children: React.ReactNode }) {
  return (
    <div className={cn("grid content-start gap-1", largo && "sm:col-span-2")}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
        {ponto && ponto.cor !== "cinza" && <Ponto cor={ponto.cor} />}
        {rotulo}
        {ponto && (ponto.cor === "amarelo" || ponto.cor === "vermelho") && <DicaCampo ponto={ponto} />}
        {ponto && ciencia && <CienciaCampo ponto={ponto} ciencia={ciencia} />}
      </span>
      {children}
    </div>
  );
}

// Botão ao lado do "confira ⓘ": dá ciência exatamente nos itens amarelos que o tooltip mostra
function CienciaCampo({ ponto, ciencia }: { ponto: PontoCampo; ciencia: CienciaCtx }) {
  const [pend, start] = useTransition();
  const pendentes = ponto.itens.filter((i) => i.cor === "amarelo" && !i.ciente);
  if (!pendentes.length) return null;
  return (
    <Button
      size="xs"
      variant="outline"
      className="h-5 border-amber-300 px-1.5 text-[11px] font-medium text-amber-800"
      disabled={pend || ciencia.desabilitado}
      title={`Dar ciência em: ${pendentes.map((p) => p.titulo).join("; ")}`}
      onClick={() => start(async () => avisar(await darCienciaItens(ciencia.negId, ciencia.condId, pendentes.map((p) => p.codigo))))}
    >
      {pend ? "…" : `Dar ciência${pendentes.length > 1 ? ` (${pendentes.length})` : ""}`}
    </Button>
  );
}

// "confira"/"resolver" com tooltip em tópicos: um item por regra ligada ao campo (pior cor primeiro)
function DicaCampo({ ponto }: { ponto: PontoCampo }) {
  const vermelho = ponto.cor === "vermelho";
  const amarelos = ponto.itens.filter((i) => i.cor === "amarelo");
  const tudoCiente = !vermelho && amarelos.length > 0 && amarelos.every((i) => i.ciente);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={vermelho ? "Por que resolver: ver motivos" : "O que conferir: ver motivos"}
            className={cn(
              "inline-flex cursor-help items-center gap-0.5 rounded px-1 font-normal underline decoration-dotted underline-offset-2 hover:bg-zinc-100 focus-visible:outline-2",
              vermelho ? "text-red-700" : tudoCiente ? "text-emerald-700" : "text-amber-700",
            )}
          />
        }
      >
        {vermelho ? "resolver" : tudoCiente ? "✓ ciente" : "confira"}
        <span aria-hidden className="inline-grid size-3.5 place-items-center rounded-full border border-current text-[9px] font-bold leading-none no-underline">i</span>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="block max-w-sm px-3 py-2 text-left">
        <ul className="grid gap-1.5">
          {ponto.itens.map((it) => (
            <li key={it.titulo} className="flex gap-2">
              <Ponto cor={it.cor} className="mt-1" />
              <span>
                <b>{it.titulo}</b>
                {it.cor === "amarelo" && <span className="ml-1 opacity-80">{it.ciente ? "· ✓ ciente" : "· falta dar ciência"}</span>}
                <br />
                <span className="opacity-80">{it.detalhe}</span>
              </span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

export function AprovarCondicao({
  condId,
  perfil,
  alcadaOk,
  alcadaLabel,
  aprovada,
  podeAgora,
  motivo,
  emRevisao,
}: {
  condId: number;
  perfil: { nome: string; cargo: string };
  alcadaOk: boolean;
  alcadaLabel: string;
  aprovada: string | null;
  podeAgora: boolean;
  motivo: string | null;
  emRevisao: boolean;
}) {
  const [pend, start] = useTransition();
  if (aprovada)
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <span>✓ {aprovada}</span>
        {emRevisao && <Button size="xs" variant="outline" disabled={pend} onClick={() => start(async () => avisar(await desfazerAprovacao(condId)))}>Desfazer aprovação</Button>}
      </div>
    );
  if (!emRevisao) return null;
  return (
    <div className="grid gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!podeAgora || !alcadaOk || pend} onClick={() => start(async () => avisar(await aprovarCondicao(condId)))}>
          {pend ? "Aprovando…" : `Aprovar como ${perfil.nome}`}
        </Button>
        <span className="text-xs text-zinc-500">{perfil.cargo}</span>
      </div>
      {!alcadaOk && <p className="text-xs text-red-700">Seu perfil não tem alçada: esta condição exige {alcadaLabel}. Troque o perfil no topo da página.</p>}
      {alcadaOk && motivo && <p className="text-xs text-red-700">{motivo}</p>}
    </div>
  );
}

export function BotaoCiencia({ negId, codigo, condicaoId, ciente, quando, desabilitado }: { negId: number; codigo: string; condicaoId: number; ciente: boolean; quando: string | null; desabilitado: boolean }) {
  const [pend, start] = useTransition();
  if (ciente)
    return (
      <span className="flex shrink-0 items-center gap-2 text-xs text-emerald-700">
        ✓ ciente{quando ? ` · ${quando}` : ""}
        {!desabilitado && (
          <button type="button" disabled={pend} className="text-zinc-500 underline" onClick={() => start(async () => avisar(await desfazerCiencia(negId, codigo, condicaoId)))}>
            desfazer
          </button>
        )}
      </span>
    );
  return (
    <Button size="xs" variant="outline" className="shrink-0 border-amber-300" disabled={pend || desabilitado} onClick={() => start(async () => avisar(await darCiencia(negId, codigo, condicaoId)))}>
      {pend ? "Registrando…" : "Dar ciência"}
    </Button>
  );
}

export function Encerrar({ negId, sugerirEscalar }: { negId: number; sugerirEscalar: boolean }) {
  const [pend, start] = useTransition();
  const [modo, setModo] = useState<null | "recusado" | "escalado">(null);
  const [motivo, setMotivo] = useState("");
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={sugerirEscalar ? "default" : "outline"} onClick={() => setModo("escalado")}>Escalar à Diretoria</Button>
        <Button size="sm" variant="destructive" onClick={() => setModo("recusado")}>Recusar</Button>
      </div>
      {modo && (
        <div className="grid gap-2">
          <Textarea rows={2} placeholder={modo === "escalado" ? "Por que vai à Diretoria? (ex.: conflito entre §4 e §5)" : "Motivo da recusa"} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={pend || !motivo.trim()} onClick={() => start(async () => avisar(await encerrar(negId, modo, motivo)))}>
              Confirmar {modo === "escalado" ? "escalonamento" : "recusa"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setModo(null)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function BotaoReabrir({ negId }: { negId: number }) {
  const [pend, start] = useTransition();
  return <Button size="sm" variant="outline" disabled={pend} onClick={() => start(async () => avisar(await reabrir(negId)))}>Reabrir para revisão</Button>;
}

export function BotaoReler({ negId, disabled }: { negId: number; disabled?: boolean }) {
  const [pend, start] = useTransition();
  return (
    <Button size="sm" variant="ghost" disabled={pend || disabled} onClick={() => start(async () => avisar(await relerComIa(negId)))}>
      Reler ao vivo com a IA
    </Button>
  );
}

// "Gerar texto" (D20): o Redator escreve na hora sobre o estado atual; "Gerar de novo" troca o texto
export function BotaoGerarTexto({ negId, destino, jaTem = false }: { negId: number; destino: "fornecedor" | "diretoria"; jaTem?: boolean }) {
  const [pend, start] = useTransition();
  return (
    <Button size="xs" variant={jaTem ? "outline" : "default"} disabled={pend} onClick={() => start(async () => avisar(await gerarTexto(negId, destino)))}>
      {pend ? "Gerando… (até 1 min)" : jaTem ? "Gerar de novo" : "Gerar texto"}
    </Button>
  );
}

export function Copiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  return (
    <Button
      size="xs"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          toast.success("Copiado.");
        } catch {
          toast.error("Não consegui copiar; selecione o texto.");
        }
      }}
    >
      {rotulo}
    </Button>
  );
}
