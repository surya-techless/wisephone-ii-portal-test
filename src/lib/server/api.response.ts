// simple class to help standardize API responses by providing typing and DRY helpers
// it's my goal that this code can be used to help replace many of the one-off API response logic snippets in our code


export class WPIIPortalAPIError extends Error {
  constructor(message: string, public status: number = HTTP.INTERNAL_SERVER_ERROR) {
    super(message);
    this.name = "WPIIPortalAPIError";
  }
}


// thought we can just start with the most common response codes for now
export const HTTP = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  MOVED_PERMANENTLY: 301,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

const baseHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-cache, no-store, must-revalidate",
};


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};


function json(body: unknown, status: number, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...baseHeaders,
      ...headers,
    },
  });
}


export function successResponse(message: string, status: number = HTTP.OK) {
  return json({ message }, status, corsHeaders);
}


export function errorResponse(errorMessage: string, status: number = HTTP.INTERNAL_SERVER_ERROR) {
  return json({ error: errorMessage }, status, corsHeaders);
}

export function preflightResponse() {
  return new Response(null, {
    status: HTTP.NO_CONTENT,
    headers: corsHeaders,
  });
}
