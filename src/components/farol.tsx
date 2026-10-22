import type { Cor, Status } from "@/lib/dominio/tipos";
import { STATUS_LABEL } from "@/lib/dominio/tipos";
import { cn } from "@/lib/utils";

const COR: Record<Cor, string> = {
  verde: "bg-emerald-500",
  amarelo: "bg-amber-400",
  vermelho: "bg-red-500",
  cinza: "bg-zinc-300",
};
const ROTULO: Record<Cor, string> = { verde: "ok", amarelo: "atenção", vermelho: "trava", cinza: "não se aplica" };

export function Ponto({ cor, className }: { cor: Cor; className?: string }) {
  return <span aria-label={ROTULO[cor]} title={ROTULO[cor]} className={cn("inline-block size-2.5 shrink-0 rounded-full", COR[cor], className)} />;
}

export function ContagemCores({ verde, amarelo, vermelho }: { verde: number; amarelo: number; vermelho: number }) {
  if (!verde && !amarelo && !vermelho) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-2 tabular-nums text-sm">
      <span className="inline-flex items-center gap-1"><Ponto cor="vermelho" />{vermelho}</span>
      <span className="inline-flex items-center gap-1"><Ponto cor="amarelo" />{amarelo}</span>
      <span className="inline-flex items-center gap-1"><Ponto cor="verde" />{verde}</span>
    </span>
  );
}

const ESTILO_STATUS: Record<Status, string> = {
  recebido: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  verificacao: "bg-sky-50 text-sky-700 ring-sky-200",
  revisao: "bg-violet-50 text-violet-700 ring-violet-200",
  aguardando_envio: "bg-amber-50 text-amber-800 ring-amber-200",
  enviado: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  recusado: "bg-red-50 text-red-700 ring-red-200",
  escalado: "bg-orange-50 text-orange-800 ring-orange-200",
};

export function StatusBadge({ status }: { status: Status }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", ESTILO_STATUS[status])}>{STATUS_LABEL[status]}</span>;
}
