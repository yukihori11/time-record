// クライアントから API を叩く唯一の入口。
// Supabase の SDK も接続情報もクライアントには存在しない。
// 認証は httpOnly Cookie が自動で送られることで成立する。

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const { json, ...rest } = init ?? {};

  const response = await fetch(path, {
    ...rest,
    credentials: 'same-origin',
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...rest.headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const err = (payload as { error?: { code?: string; message?: string } })
      ?.error;
    throw new ApiClientError(
      err?.code ?? 'INTERNAL_ERROR',
      err?.message ?? 'エラーが発生しました',
      response.status
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, json?: unknown) =>
    request<T>(path, { method: 'POST', json: json ?? {} }),
  patch: <T>(path: string, json?: unknown) =>
    request<T>(path, { method: 'PATCH', json: json ?? {} }),
  put: <T>(path: string, json?: unknown) =>
    request<T>(path, { method: 'PUT', json: json ?? {} }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** API のエラーメッセージを取り出す */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'エラーが発生しました';
}
