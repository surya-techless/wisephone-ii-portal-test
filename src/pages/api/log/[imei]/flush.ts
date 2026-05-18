import type { APIRoute } from "astro";

import { androidResponse, errorResponse, preflightResponse, successResponse } from "@/lib/server/api.response";
import { HTTP } from "@/lib/server/api.response";

export const POST: APIRoute = async ({ request }) => {
  try {
    // TODO:
    //  confirm imei in payload
    //  calculate whether incoming payload would overflow existing cache "buffer"
    //  if so:
    //      batch commit entire buffer + incoming log events to db within a transaction
    //      publish to mqtt log/<imei>/flush topic
    //  else:
    //      add events to cache


    // cache can probably be a simple in-memory cache
    // utilizing an external cache mechanism might be more "clean" but adds more complexity
    return androidResponse("Created", HTTP.CREATED);
  } catch (error) {
      return errorResponse("Internal Server Error", HTTP.INTERNAL_SERVER_ERROR);
  }
};

export const OPTIONS: APIRoute = async ({ request }) => {
  try {
    return preflightResponse();
  } catch (error) {
      return errorResponse("Internal Server Error", HTTP.INTERNAL_SERVER_ERROR);
  }
};

export const GET: APIRoute = async ({ request }) => {
  try {
    return successResponse("Success");
  } catch (error) {
      return errorResponse("Internal Server Error", HTTP.INTERNAL_SERVER_ERROR);
  }
};
