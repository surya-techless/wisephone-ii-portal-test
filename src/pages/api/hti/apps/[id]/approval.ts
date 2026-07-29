import type { APIRoute } from "astro";

import { errorResponse, preflightResponse, successResponse, WPIIPortalAPIError } from "@/lib/server/api.response";
import { HTTP } from "@/lib/server/api.response";


export const POST: APIRoute = async ({ request, params }) => {
  try {
    const appId: string = params.id ?? "";

    if (!appId) {
      throw new WPIIPortalAPIError("invalid url");
    }

    let body = await request.json();
    console.log("✅ [hti/apps/1/approval]: ", body);
    // TODO add to tool drawer

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
