export class ApiResponseError extends Error {
  readonly status: number;
  readonly contentType: string;
  readonly redirected: boolean;
  readonly endpoint: string;

  constructor(
    message: string,
    details: {
      status: number;
      contentType: string;
      redirected: boolean;
      endpoint: string;
    },
  ) {
    super(message);
    this.name = "ApiResponseError";
    this.status = details.status;
    this.contentType = details.contentType;
    this.redirected = details.redirected;
    this.endpoint = details.endpoint;
  }
}

function resolveEndpointLabel(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.pathname;
  return input.url;
}

function looksLikeHtml(contentType: string, body: string): boolean {
  const lowerCt = contentType.toLowerCase();
  if (lowerCt.includes("text/html") || lowerCt.includes("application/xhtml")) {
    return true;
  }
  const trimmed = body.trimStart().toLowerCase();
  return (
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<head") ||
    trimmed.startsWith("<body")
  );
}

export async function parseApiJsonResponse<T>(
  response: Response,
  endpointLabel: string,
  method = "GET",
): Promise<T> {
  const status = response.status;
  const contentType = response.headers.get("content-type") || "";
  const redirected = Boolean(response.redirected);
  const raw = await response.text();

  if (looksLikeHtml(contentType, raw)) {
    console.warn("[Órion API] Resposta HTML inesperada em rota JSON", {
      endpoint: endpointLabel,
      method,
      status,
      contentType: contentType || "desconhecido",
      redirected,
    });
    const message = redirected
      ? `A requisição para ${endpointLabel} foi redirecionada para uma página HTML (HTTP ${status}). Atualize a página e confirme sua sessão no preview antes de tentar novamente.`
      : `O servidor retornou uma página HTML (HTTP ${status}) em vez de JSON ao acessar ${endpointLabel}. Verifique se o backend de API está ativo neste endereço.`;
    throw new ApiResponseError(message, {
      status,
      contentType,
      redirected,
      endpoint: endpointLabel,
    });
  }

  let parsed: unknown = null;
  if (raw.trim().length > 0) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn("[Órion API] Corpo não-JSON retornado pela API", {
        endpoint: endpointLabel,
        method,
        status,
        contentType: contentType || "desconhecido",
        redirected,
      });
      throw new ApiResponseError(
        `Resposta inválida do servidor em ${endpointLabel} (HTTP ${status}, Content-Type: ${contentType || "ausente"}).`,
        {
          status,
          contentType,
          redirected,
          endpoint: endpointLabel,
        },
      );
    }
  }

  if (!response.ok) {
    const errObj = (parsed && typeof parsed === "object" ? parsed : {}) as {
      error?: unknown;
      message?: unknown;
    };
    const msg =
      (typeof errObj.error === "string" && errObj.error) ||
      (typeof errObj.message === "string" && errObj.message) ||
      `Erro HTTP ${status} ao acessar ${endpointLabel}.`;
    throw new ApiResponseError(msg, {
      status,
      contentType,
      redirected,
      endpoint: endpointLabel,
    });
  }

  return (parsed ?? {}) as T;
}

export async function fetchApiJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const endpointLabel = resolveEndpointLabel(input);
  const method = (init?.method || "GET").toUpperCase();
  const response = await fetch(input, init);
  return parseApiJsonResponse<T>(response, endpointLabel, method);
}
