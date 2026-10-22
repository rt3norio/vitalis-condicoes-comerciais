"use client";
// Topo do painel: próxima rodada, processar agora, novo e-mail. Atualiza a tela a cada 4 s. Reiniciar fica no cabeçalho (D16).
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { gerarNovosEmails, novoEmail, processarAgora, type RespostaAcao } from "@/app/acoes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function avisar(r: RespostaAcao) {
  if (r.ok) toast.success(r.mensagem);
  else toast.error(r.mensagem);
}

export function AutoAtualizar({ ms = 4000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [router, ms]);
  return null;
}

export function ProximaRodada({ em }: { em: string | null }) {
  // começa nulo para o HTML do servidor e o do navegador baterem (relógio só no cliente)
  const [agora, setAgora] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setAgora(Date.now());
    const t0 = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, []);
  if (!em) return <span>primeira rodada em instantes</span>;
  if (agora == null) return <span>próxima rodada em —</span>;
  const s = Math.max(0, Math.round((new Date(em).getTime() - agora) / 1000));
  return (
    <span className="tabular-nums">
      próxima rodada em {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

export function BotoesTopo({ ia }: { ia: boolean }) {
  const [pend, start] = useTransition();
  const [gerando, startGerar] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={pend} onClick={() => start(async () => avisar(await processarAgora()))}>
        {pend ? "Processando…" : "Processar agora"}
      </Button>
      {ia && (
        <Button size="sm" variant="outline" disabled={gerando} title="A IA escreve 3 e-mails fictícios de fornecedores, com cenários diferentes, que entram no funil" onClick={() => startGerar(async () => avisar(await gerarNovosEmails()))}>
          {gerando ? "Gerando e-mails… (até 1 min)" : "Gerar novos e-mails (IA)"}
        </Button>
      )}
      <NovoEmail />
    </div>
  );
}

function NovoEmail() {
  const [aberto, setAberto] = useState(false);
  const [pend, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Novo e-mail</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Novo e-mail de fornecedor</DialogTitle>
          <DialogDescription>Cole o texto (com ou sem cabeçalho) ou envie um arquivo .eml. A leitura é feita pela IA na próxima rodada.</DialogDescription>
        </DialogHeader>
        <form
          ref={form}
          className="grid gap-3"
          action={(fd) =>
            start(async () => {
              const r = await novoEmail(fd);
              avisar(r);
              if (r.ok) {
                form.current?.reset();
                setAberto(false);
              }
            })
          }
        >
          <div className="grid gap-1.5">
            <Label htmlFor="texto">Texto do e-mail</Label>
            <Textarea id="texto" name="texto" rows={10} placeholder={"From: Fulano <fulano@fornecedor.com.br>\nSubject: Proposta\n\nOlá, segue proposta: 10% de desconto..."} className="font-mono text-xs" />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="eml">ou arquivo .eml</Label>
              <input id="eml" name="eml" type="file" accept=".eml,.txt,message/rfc822" className="text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="anexo">Anexo (planilha .csv/.txt, opcional)</Label>
              <input id="anexo" name="anexo" type="file" accept=".csv,.txt" className="text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pend}>{pend ? "Enviando…" : "Receber e-mail"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
