import { garantirSessao } from "@/lib/sessao";
import type { RespostaErp } from "@/lib/erp/servidor";

// Autenticação fora do escopo (README do mock). O cliente se identifica pelo header X-Cliente-Id;
// cada sessão de demo tem seu ERP, para um avaliador não mexer no do outro.
export async function clienteDe(req: Request): Promise<string | Response> {
  const id = req.headers.get("x-cliente-id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "UNAUTHORIZED", message: "Header X-Cliente-Id ausente" }, { status: 401 });
  await garantirSessao(id);
  return id;
}

export const responder = (r: RespostaErp) => Response.json(r.body, { status: r.status, headers: r.headers });
