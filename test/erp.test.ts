// Contrato do ERP simulado (mock_erp/README): 400, 422, 201, idempotência, substituição e limite 429.
import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL = ":memory:";
process.env.ERP_INSTABILIDADE = "0"; // sem 503 aleatório nos testes

type Mod = typeof import("../src/lib/erp/servidor");
let erp: Mod;
let garantirSessao: (sid: string) => Promise<void>;

const corpo = {
  cod_fornecedor: "FORN-002",
  cod_categoria: "HIGIENE_BELEZA",
  tipo: "DESCONTO_PERCENTUAL",
  lojas: ["LOJA-104", "LOJA-107", "LOJA-112"],
  percentual: 13,
  data_inicio: "2026-10-22",
  data_fim: "2027-03-31",
  cod_condicao_substituida: "COND-003",
  aprovador: { matricula: "004212", nome: "Carlos Duarte" },
  origem: { tipo: "EMAIL", referencia: "<c3d8a7b2.20260929100500@distribuidorabeta.com.br>" },
};

const novaSessao = async () => {
  const sid = crypto.randomUUID();
  await garantirSessao(sid);
  return sid;
};

beforeAll(async () => {
  erp = await import("../src/lib/erp/servidor");
  ({ garantirSessao } = await import("../src/lib/sessao"));
});

describe("POST /condicoes", () => {
  it("400 sem Idempotency-Key", async () => {
    const r = await erp.erpPostCondicao(await novaSessao(), null, corpo);
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toBe("MISSING_IDEMPOTENCY_KEY");
  });

  it("422 VALIDATION_ERROR com loja inexistente e campo extra", async () => {
    const r = await erp.erpPostCondicao(await novaSessao(), "k1", { ...corpo, lojas: ["LOJA-999"], status: "APROVADO" });
    expect(r.status).toBe(422);
    const campos = (r.body as { campos: { campo: string }[] }).campos.map((c) => c.campo);
    expect(campos).toContain("lojas[0]");
    expect(campos).toContain("status");
  });

  it("422 SUPPLIER_NOT_ACTIVE para a Nutrivida", async () => {
    const r = await erp.erpPostCondicao(await novaSessao(), "k2", { ...corpo, cod_fornecedor: "FORN-005", cod_categoria: "SUPLEMENTOS", lojas: ["REDE"], cod_condicao_substituida: undefined });
    expect((r.body as { error: string }).error).toBe("SUPPLIER_NOT_ACTIVE");
  });

  it("201, substitui COND-003 e repete a mesma resposta com a mesma chave", async () => {
    const sid = await novaSessao();
    const a = await erp.erpPostCondicao(sid, "chave-beta", corpo);
    expect(a.status).toBe(201);
    const cod = (a.body as { cod_condicao: string }).cod_condicao;
    expect(cod).toBe("COND-011");
    const b = await erp.erpPostCondicao(sid, "chave-beta", corpo);
    expect(b.body).toEqual(a.body); // não cadastra de novo
    const lista = await erp.erpGet(sid, "condicoes", "VIGENTE");
    const itens = (lista.body as { itens: { cod_condicao: string; data_fim: string }[] }).itens;
    expect(itens.filter((i) => i.cod_condicao === "COND-011")).toHaveLength(1);
    expect(itens.find((i) => i.cod_condicao === "COND-003")?.data_fim).toBe("2026-10-21");
  });
});

describe("Limite de 10 requisições por minuto", () => {
  it("11ª chamada recebe 429 com Retry-After", async () => {
    const sid = await novaSessao();
    for (let i = 0; i < 10; i++) expect((await erp.erpGet(sid, "lojas")).status).toBe(200);
    const r = await erp.erpGet(sid, "lojas");
    expect(r.status).toBe(429);
    expect(Number(r.headers?.["Retry-After"])).toBeGreaterThan(0);
  });
});
