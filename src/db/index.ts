// Conexão SQLite (libsql, arquivo local). No Fly, DATABASE_URL aponta para o volume: file:/data/app.db
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const url = process.env.DATABASE_URL || `file:${path.join(process.cwd(), ".data", "app.db")}`;
if (url.startsWith("file:")) fs.mkdirSync(path.dirname(url.slice(5)), { recursive: true });

const globalDb = globalThis as unknown as { __db?: ReturnType<typeof criar>; __migrado?: Promise<void> };

function criar() {
  const client = createClient({ url });
  return drizzle(client, { schema });
}

export const db = globalDb.__db ?? (globalDb.__db = criar());

// Migra uma vez por processo; chamado no boot (instrumentation) e por segurança antes do primeiro uso
export function garantirMigracao() {
  if (!globalDb.__migrado) {
    globalDb.__migrado = (async () => {
      await db.run("PRAGMA journal_mode = WAL");
      await db.run("PRAGMA busy_timeout = 5000");
      await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    })();
  }
  return globalDb.__migrado;
}

export { schema };
