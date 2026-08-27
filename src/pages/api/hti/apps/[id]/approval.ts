import type { APIRoute } from "astro";

import { errorResponse, preflightResponse, successResponse, WPIIPortalAPIError, HTTP } from "@/lib/server/api.response";
import { getCatalogAppByHtiId, upsertCatalogApp } from "@/libs/app-catalog";

export const POST: APIRoute = async ({ request, params }) => {
  try {
    const appId: string = params.id ?? "";

    if (!appId) {
      throw new WPIIPortalAPIError("invalid url", HTTP.NOT_FOUND);
    }

    if (await getCatalogAppByHtiId(appId)) {
      throw new WPIIPortalAPIError("App already exists in catalog", HTTP.BAD_REQUEST);
    }

    const body = await request.json();
    const packageName = body.packageName ?? body.package_name;

    if (!packageName) {
      throw new WPIIPortalAPIError("packageName is required", HTTP.BAD_REQUEST);
    }

    await upsertCatalogApp({
      packageName,
      name: body.name ?? packageName,
      playStoreUrl: body.playStoreUrl ?? body.play_store_url,
      iconUrl: body.iconUrl ?? body.icon_url,
      category: body.category,
      htiAppId: appId
    });

    return successResponse("Created", HTTP.CREATED);
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
