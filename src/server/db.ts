import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../drizzle/schema'
import { getEnv } from './env'

const create = () => drizzle(getEnv().DB, { schema })
let cached: ReturnType<typeof create> | undefined

export function getDb() {
  cached ??= create()
  return cached
}
export type Db = ReturnType<typeof getDb>
export { schema }
