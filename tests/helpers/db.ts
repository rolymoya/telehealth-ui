/**
 * Wraps a test body in a DB transaction that rolls back on completion.
 * Stub until T-039 (Drizzle + RDS) is wired up.
 */
export async function withTestDb<T>(fn: () => Promise<T>): Promise<T> {
  // TODO T-039: begin transaction, run fn, rollback
  return fn();
}
