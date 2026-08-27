import type { APIRoute } from "astro";

import { errorResponse, preflightResponse, successResponse, WPIIPortalAPIError, HTTP } from "@/lib/server/api.response";
import { getCatalogAppByHtiId, upsertCatalogApp } from "@/libs/app-catalog";

export const POST: APIRoute = async ({ request, params }) => {
  const appId: string | null = params.id ?? null;

  if (appId === null) {
    throw new WPIIPortalAPIError("invalid url", HTTP.NOT_FOUND);
  }

  const body = await request.json();
  const packageName = body.packageName ?? body.package_name;

  if (packageName.length === 0 || packageName === undefined || packageName === null) {
    throw new WPIIPortalAPIError("packageName is required", HTTP.BAD_REQUEST);
  }

  try {
    await upsertCatalogApp({
      packageName,
      name: packageName,
      playStoreUrl: body.playStoreUrl ?? body.play_store_url,
      iconUrl: body.iconUrl ?? body.icon_url,
      category: body.category,
      htiAppId: appId
    });

    console.log(`✅ Upserted app ${packageName} with ID ${appId}`);
    return successResponse("Created", HTTP.CREATED);
  } catch (error) {
    console.error(`❌ Error upserting app ${packageName} with ID ${appId}: ${error}`);

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
