"use client";
// Reiniciar no cabeçalho de todas as telas (D16): apaga tudo da sessão e volta ao Painel, como na primeira visita.
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { reiniciarDemo } from "@/app/acoes";
import { Button } from "@/components/ui/button";
import { avisar } from "./barra-topo";

const AVISO =
  "Reiniciar a demo do zero?\n\n" +
  "• Os 4 e-mails voltam para Recebido.\n" +
  "• E-mails colados e gerados, ciências, aprovações, histórico e auditoria da IA são apagados.\n" +
  "• O ERP volta à captura de 30/09.\n" +
  "• O perfil volta para Analista Comercial.";

export function ReiniciarDemo() {
  const router = useRouter();
  const [pend, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pend}
      onClick={() => {
        if (!confirm(AVISO)) return;
        start(async () => {
          const r = await reiniciarDemo();
          avisar(r);
          // a negociação aberta pode não existir mais: volta ao Painel
          if (r.ok) router.push("/");
        });
      }}
    >
      {pend ? "Reiniciando…" : "↺ Reiniciar demo"}
    </Button>
  );
}
