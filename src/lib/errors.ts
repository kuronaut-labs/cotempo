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
