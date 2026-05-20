import type { APIRoute } from "astro";

import { androidResponse, errorResponse, preflightResponse, successResponse } from "@/lib/server/api.response";
import { HTTP } from "@/lib/server/api.response";

import { CacheClient } from "cache/CacheClient";
import type { LogEvent } from "cache/dto/LogEvent";

export const POST: APIRoute = async ({ request }) => {
  // TODO abstract into service method and keep this logic out of the "controller"
  try {
      let body: LogEvent = await request.json();
      console.log(body);
      await CacheClient.set(body.batchId, JSON.stringify(body));

    if (await CacheClient.getBufferSize() >= CacheClient.bufferSizeNumKeys) {
      //  TODO:
      //    confirm imei in payload
      //    batch commit entire buffer + incoming log events to db within a transaction
      //    publish to mqtt log/<imei>/flush topic
      await CacheClient.flush();
      console.log("cache flushed");
    }
    return androidResponse("Created", HTTP.CREATED);
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
