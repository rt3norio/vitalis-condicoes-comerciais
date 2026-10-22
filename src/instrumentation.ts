// Chamado uma vez quando o servidor Next sobe. Inicia o agendador de tarefas (S20).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { iniciarAgendador } = await import("./lib/tarefas/agendador");
  await iniciarAgendador();
}
