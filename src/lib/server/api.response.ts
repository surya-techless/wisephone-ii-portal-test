// simple class to help standardize API responses by providing typing and DRY helpers
// it's my goal that this code can be used to help replace many of the one-off API response logic snippets in our code


// thought we can just start with the most common response codes for now
export const HTTP = {
  OK: 200,
  CREATED: 201,
  MOVED_PERMANENTLY: 301,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};

export class WisephoneIIPortalAPIError extends Error {
  constructor(message: string, public status: number = HTTP.INTERNAL_SERVER_ERROR) {
    super(message);
    this.name = "WisephoneIIPortalAPIError";
  }
}

export function jsonResponse(body: unknown, status = HTTP.OK) {
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

export function errorResponse(errorMessage: string, status: number) {
  return jsonResponse({ error: errorMessage }, status);
}
