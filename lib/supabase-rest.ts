import { env } from "cloudflare:workers";

type RuntimeEnv = Cloudflare.Env & {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
};

export class BackendNotConfiguredError extends Error {
  constructor() {
    super("PostgreSQL backend is not configured.");
    this.name = "BackendNotConfiguredError";
  }
}

export class SupabaseRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "SupabaseRequestError";
  }
}

function getSupabaseConfig() {
  const runtimeEnv = env as RuntimeEnv;
  const url = runtimeEnv.SUPABASE_URL ?? process.env.SUPABASE_URL;
  const secretKey =
    runtimeEnv.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) throw new BackendNotConfiguredError();

  return {
    url: url.replace(/\/$/, ""),
    secretKey,
  };
}

export function isBackendConfigured() {
  try {
    getSupabaseConfig();
    return true;
  } catch {
    return false;
  }
}

export async function supabaseRest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { url, secretKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path.replace(/^\//, "")}`, {
    ...init,
    headers: {
      Accept: "application/json",
      apikey: secretKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new SupabaseRequestError(
      detail || `Supabase request failed with ${response.status}.`,
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
