import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { getConnectionString, createPool } from "./connection";
import * as schema from "./schema/index";

type Db = ReturnType<typeof drizzle<typeof schema>>;

// Promise singleton prevents concurrent cold-start requests from racing to create multiple Pools.
let _dbPromise: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      const { url, ssl } = await getConnectionString();
      const pool = createPool(url, ssl, 10);
      pool.on("error", (err) => {
        console.error("[db] idle pool client error — resetting pool:", err);
        pool.end().catch(() => {});
        _dbPromise = null;
      });
      return drizzle(pool, { schema });
    })();
    _dbPromise.catch(() => {
      _dbPromise = null;
    });
  }
  return _dbPromise;
}
