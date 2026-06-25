import type { APIRoute } from "astro";

import { errorResponse, preflightResponse, successResponse, WPIIPortalAPIError } from "@/lib/server/api.response";
import { HTTP } from "@/lib/server/api.response";

import { LogBufferService } from "log/LogBufferService";


export const POST: APIRoute = async ({ request, params }) => {
  try {
    const imei: string = params.imei ?? "";

    if (!imei) {
      throw new WPIIPortalAPIError("invalid url");
    }

    await LogBufferService.ingest(imei, await request.json());
    return successResponse("Ok", HTTP.OK);
  } catch (error) {
      console.error(error);

      if (error instanceof WPIIPortalAPIError && error.message == "invalid url") {
        return errorResponse("Not Found", HTTP.NOT_FOUND);
      }

      return errorResponse("Internal Server Error", HTTP.INTERNAL_SERVER_ERROR);
  }
};

export const OPTIONS: APIRoute = async ({ request }) => {
  try {
    return preflightResponse();
  } catch (error) {
      console.error(error);
      return errorResponse("Internal Server Error", HTTP.INTERNAL_SERVER_ERROR);
  }
};
