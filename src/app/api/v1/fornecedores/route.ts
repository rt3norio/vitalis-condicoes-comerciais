import { erpGet } from "@/lib/erp/servidor";
import { clienteDe, responder } from "../_comum";

export async function GET(req: Request) {
  const c = await clienteDe(req);
  if (c instanceof Response) return c;
  return responder(await erpGet(c, "fornecedores"));
}
