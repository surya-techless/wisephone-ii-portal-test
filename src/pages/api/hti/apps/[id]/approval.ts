import type { APIRoute } from "astro";

import { errorResponse, preflightResponse, successResponse, WPIIPortalAPIError, HTTP } from "@/lib/server/api.response";
import { insertCatalogApp } from "@/libs/app-catalog";

export const POST: APIRoute = async ({ request, params }) => {
  try {
    const appId: string = params.id ?? "";

    if (!appId) {
      throw new WPIIPortalAPIError("invalid url", HTTP.NOT_FOUND);
    }

    const body = await request.json();
    const packageName = body.packageName ?? body.package_name;
    console.log("✅ [hti/apps/1/approval]: ", body);

    if (!packageName) {
      throw new WPIIPortalAPIError("packageName is required", HTTP.BAD_REQUEST);
    }

    await insertCatalogApp({
      packageName,
      name: body.name ?? packageName,
      playStoreUrl: body.playStoreUrl ?? body.play_store_url,
      iconUrl: body.iconUrl ?? body.icon_url,
      category: body.category,
      htiAppId: appId
    });

    return successResponse("Ok", HTTP.OK);
  } catch (error) {
    console.error(error);

    if (error instanceof WPIIPortalAPIError) {
      return errorResponse(error.message, error.status);
    }

    return errorResponse("Internal Server Error", HTTP.INTERNAL_SERVER_ERROR);
  }
};

export const OPTIONS: APIRoute = async () => {
  try {
    return preflightResponse();
  } catch (error) {
    console.error(error);
    return errorResponse("Internal Server Error", HTTP.INTERNAL_SERVER_ERROR);
  }
};
