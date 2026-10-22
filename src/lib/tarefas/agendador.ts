// Agendador (S20): timer de 60 s dentro do processo do Next. A trava no banco (lease) segura execução dupla.
import { garantirMigracao } from "@/db";
import { rodada } from "./fila";
import { HANDLERS } from "./handlers";

export const processarRodada = (opts: { sessionId?: string } = {}) => rodada(HANDLERS, opts);

const g = globalThis as unknown as { __agendador?: NodeJS.Timeout };

export async function iniciarAgendador() {
  // não roda no `next build` (pré-renderização também carrega o instrumentation)
  if (g.__agendador || process.env.AGENDADOR === "off" || process.env.NEXT_PHASE === "phase-production-build") return;
  await garantirMigracao();
  const tick = () =>
    processarRodada().then(
      (r) => r.executadas && console.log(`[agendador] rodada: ${r.executadas} tarefa(s)`),
      (e) => console.error("[agendador] rodada falhou:", e),
    );
  setTimeout(tick, 5_000);
  g.__agendador = setInterval(tick, 60_000);
  console.log("[agendador] iniciado: rodada a cada 60 s");
}
