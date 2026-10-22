import { erpGet, erpPostCondicao } from "@/lib/erp/servidor";
import { clienteDe, responder } from "../_comum";

export async function GET(req: Request) {
  const c = await clienteDe(req);
  if (c instanceof Response) return c;
  return responder(await erpGet(c, "condicoes", new URL(req.url).searchParams.get("status")));
}

export async function POST(req: Request) {
  const c = await clienteDe(req);
  if (c instanceof Response) return c;
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "VALIDATION_ERROR", message: "Corpo não é JSON válido", campos: [] }, { status: 422 });
  }
  return responder(await erpPostCondicao(c, req.headers.get("idempotency-key"), body));
}
