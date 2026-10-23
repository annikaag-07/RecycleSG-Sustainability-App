/** Error thrown by every api/* function, so screens only need one `catch` shape. */
export class ApiError extends Error {
  /** Postgres/PostgREST/Auth error code when available, e.g. "P0001", "42501", "invalid_credentials". */
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }

  /** True when the request never reached the server, so the UI should offer a retry (NFR-QUAL-05). */
  get isNetwork() {
    return this.code === 'network';
  }
}

type SupabaseLikeError = { message: string; code?: string | number } | null;

/** Unwraps a supabase-js `{ data, error }` result, throwing ApiError on failure. */
export function unwrap<T>(result: { data: T | null; error: SupabaseLikeError }): T {
  if (result.error) throw toApiError(result.error);
  return result.data as T;
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as { message: string; code?: string | number; name?: string };
    const network = e.name === 'AuthRetryableFetchError' || /Failed to fetch|Network request failed/i.test(e.message);
    return new ApiError(network ? 'Cannot reach the server. Check your connection and try again.' : e.message, network ? 'network' : e.code?.toString());
  }
  return new ApiError('Something went wrong. Please try again.');
}
