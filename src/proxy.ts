// Garante o cookie de sessão anônima antes de qualquer página ou ação (S18).
import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "vitalis_sid";

export function proxy(request: NextRequest) {
  if (request.cookies.get(COOKIE)) return NextResponse.next();
  const sid = crypto.randomUUID();
  // repassa o cookie já nesta requisição, para a página não nascer sem sessão
  request.cookies.set(COOKIE, sid);
  const res = NextResponse.next({ request: { headers: request.headers } });
  res.cookies.set(COOKIE, sid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}

export const config = {
  // ERP simulado (/api/v1) identifica o cliente por header, não por cookie
  matcher: ["/((?!_next/static|_next/image|favicon.ico|politica-comercial.pdf|api/v1).*)"],
};
