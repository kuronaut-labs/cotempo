import { and, eq, exists, getTableColumns, is, sql, SQL } from 'drizzle-orm'
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { Db } from '~/server/db'

/* D1 has no interactive transactions: a check read in one request and a write sent later can be
   overtaken by another request in between. These helpers move the check into the write itself;
   a batch runs as one transaction, so the condition and the write see the same state. */

/** INSERT … SELECT <row> WHERE <cond>: the row is written only if `cond` holds when the statement runs.
    Drizzle's insert-select lists every column in definition order, so a missing key needs a value here:
    a plain static default, or null for a nullable column. Anything else throws rather than guessing. */
export function insertIf<T extends SQLiteTable>(db: Db, table: T, row: T['$inferInsert'], cond: SQL) {
  const given = row as Record<string, unknown>
  const values = Object.entries(getTableColumns(table) as Record<string, SQLiteColumn>).map(([key, col]) => {
    let v = given[key]
    if (v === undefined) {
      if (col.default !== undefined && !is(col.default, SQL)) v = col.default
      else if (!col.notNull && col.default === undefined && !col.defaultFn) v = null
      else throw new Error(`insertIf: ${table._.name}.${col.name} has no value and no static default`)
    }
    return v === null ? sql`null` : sql`${col.mapToDriverValue(v)}`
  })
  return db.insert(table).select(sql`select ${sql.join(values, sql`, `)} where ${cond}`)
}

/** EXISTS (a row of `idColumn`'s table with that id, matching any extra conditions). */
export function existsRow(db: Db, idColumn: SQLiteColumn, id: string, ...extra: (SQL | undefined)[]): SQL {
  return exists(db.select({ one: sql`1` }).from(idColumn.table).where(and(eq(idColumn, id), ...extra)))
}
