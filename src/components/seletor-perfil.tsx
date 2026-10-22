"use client";
import { useTransition } from "react";
import { trocarPerfil } from "@/app/acoes";
import { avisar } from "./barra-topo";

export function SeletorPerfil({ atual, perfis }: { atual: string; perfis: { matricula: string; rotulo: string }[] }) {
  const [pend, start] = useTransition();
  return (
    <label className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-xs text-teal-900">
      <span className="font-medium">Quem você é:</span>
      <select
        className="rounded-md border border-teal-300 bg-white px-1.5 py-1 text-xs"
        value={atual}
        disabled={pend}
        onChange={(e) => start(async () => avisar(await trocarPerfil(e.target.value)))}
        aria-label="Quem você é (perfil, sem login)"
      >
        {perfis.map((p) => (
          <option key={p.matricula} value={p.matricula}>
            {p.rotulo}
          </option>
        ))}
      </select>
    </label>
  );
}
