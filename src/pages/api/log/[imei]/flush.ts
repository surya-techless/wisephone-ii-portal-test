import type { APIRoute } from "astro";

import { androidResponse, errorResponse, preflightResponse, successResponse } from "@/lib/server/api.response";
import { HTTP } from "@/lib/server/api.response";

import { CacheClient } from "cache/CacheClient";
import { LogBufferService } from "log/LogBufferService";

export const POST: APIRoute = async ({ request }) => {
  try {
    await LogBufferService.ingest(await request.json());
      //  TODO:
      //    confirm imei in payload
      //    publish to mqtt log/<imei>/flush topic
    return androidResponse("Ok", HTTP.OK);
  } catch (error) {
    console.log(error);
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
