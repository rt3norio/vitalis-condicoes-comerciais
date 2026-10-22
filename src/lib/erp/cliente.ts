// Cliente HTTP do ERP (S30). Hoje aponta para o ERP simulado deste app; para o ERP real, troca ERP_BASE_URL
// e a autenticação. O cliente não decide nada de negócio: só fala o contrato e classifica o erro.
import type { PayloadCondicao } from "../regras/contrato-erp";

const base = () => (process.env.ERP_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, "") + "/api/v1";

export type RespostaHttp = { status: number; body: unknown; retryAfter: number | null };
export type Classe = "ok" | "transitorio" | "permanente";

// 503, 429, timeout e falha de rede passam; 400/422 não passam com nova tentativa
export const classificar = (status: number): Classe =>
  status >= 200 && status < 300 ? "ok" : status === 0 || status === 429 || status >= 500 ? "transitorio" : "permanente";

async function chamar(sessao: string, metodo: "GET" | "POST", caminho: string, body?: unknown, idemKey?: string): Promise<RespostaHttp> {
  try {
    const r = await fetch(base() + caminho, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        "X-Cliente-Id": sessao, // identifica o cliente (cada sessão de demo = um cliente)
        ...(idemKey ? { "Idempotency-Key": idemKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const txt = await r.text();
    let json: unknown = txt;
    try {
      json = JSON.parse(txt);
    } catch {}
    const ra = r.headers.get("Retry-After");
    return { status: r.status, body: json, retryAfter: ra ? Number(ra) : null };
  } catch (e) {
    return { status: 0, body: { error: "NETWORK", message: e instanceof Error ? e.message : String(e) }, retryAfter: null };
  }
}

export const erp = {
  fornecedores: (sessao: string) => chamar(sessao, "GET", "/fornecedores"),
  lojas: (sessao: string) => chamar(sessao, "GET", "/lojas"),
  condicoesVigentes: (sessao: string) => chamar(sessao, "GET", "/condicoes?status=VIGENTE"),
  criarCondicao: (sessao: string, payload: PayloadCondicao, idemKey: string) => chamar(sessao, "POST", "/condicoes", payload, idemKey),
};
