// "Quem você é" no topo de todas as telas. Sem login (é um case): trocar o perfil muda em nome de quem
// ficam aprovações, ciências e escalonamentos, e o que cada um vê.
import { PERFIS } from "@/lib/dominio/politica";
import { perfilAtual } from "@/lib/perfil";
import { SeletorPerfil } from "./seletor-perfil";

export async function PerfilTopo() {
  const p = await perfilAtual();
  return <SeletorPerfil atual={p.matricula} perfis={PERFIS.map((x) => ({ matricula: x.matricula, rotulo: x.nome.startsWith(x.cargo) ? x.nome : `${x.nome} (${x.cargo})` }))} />;
}
