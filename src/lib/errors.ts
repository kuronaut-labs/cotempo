/** Thrown by server fns; `field` names the input a coded error belongs to (#25). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly field?: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(code)
    this.name = 'HttpError'
  }
}

export const isHttpError = (e: unknown): e is HttpError => e instanceof Error && e.name === 'HttpError'

export type ParsedHttpError = {
  status: number
  code: string
  field?: string
  data?: Record<string, unknown>
}

/* Defensive parser for errors that arrive at the client (#M11).
   In-process calls (same worker) get an HttpError instance; cross-network
   calls may arrive as a plain object that lost the prototype. Try to
   surface code/field/data in either case so WEEK_LOCKED banners, field
   mappings, and message lookups don't silently no-op. */
export function parseHttpError(e: unknown): ParsedHttpError | null {
  if (e instanceof HttpError) {
    return { status: e.status, code: e.code, field: e.field, data: e.data }
  }
  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>
    if (typeof obj.code === 'string' && obj.code) {
      return {
        status: typeof obj.status === 'number' ? obj.status : 500,
        code: obj.code,
        field: typeof obj.field === 'string' ? obj.field : undefined,
        data:
          obj.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : undefined,
      }
    }
  }
  return null
}
