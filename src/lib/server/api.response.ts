export const HTTP = {
  OK: 200,
  CREATED: 201,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};

export class WisephoneIIPortalAPIError extends Error {
  constructor(message: string, public status: number = 500) {
    super(message);
    this.name = "WisephoneIIPortalAPIError";
  }
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",  // seems that we specifically set these values everywhere, so why not
    },
  });
}

export function successResponse(message: string, status: number) {
  return jsonResponse({ message: message }, status);
}

export function errorResponse(message: string, status: number) {
  return jsonResponse({ error: message }, status);
}
