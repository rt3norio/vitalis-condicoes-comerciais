// "Quem você é": perfil escolhido no topo (cookie), sem login porque é um case. Aprovação, ciência e
// escalonamento ficam no nome do perfil; escalados só são vistos pelo destino (Diretoria/Comitê) e por quem escalou.
import { cookies } from "next/headers";
import { ANALISTA, PERFIS, veEscalados } from "./dominio/politica";
import type { Aprovador, Status } from "./dominio/tipos";

export const COOKIE_PERFIL = "vitalis_perfil";

export async function perfilAtual(): Promise<Aprovador> {
  const m = (await cookies()).get(COOKIE_PERFIL)?.value;
  return PERFIS.find((p) => p.matricula === m) ?? ANALISTA;
}

export const podeVer = (neg: { status: Status; encerradoPor: string | null }, p: Aprovador) =>
  neg.status !== "escalado" || veEscalados(p) || neg.encerradoPor === p.matricula;
