// D1 rejects a statement with more than 100 bound parameters. 80 ids per slice leaves room for the query's other conditions.
const CHUNK = 80

/** Runs `query` over `ids` in slices and concatenates the rows; ids are de-duplicated first. */
export async function inChunks<T>(ids: Iterable<string>, query: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const unique = [...new Set(ids)]
  const out: T[] = []
  for (let i = 0; i < unique.length; i += CHUNK) out.push(...(await query(unique.slice(i, i + CHUNK))))
  return out
}
