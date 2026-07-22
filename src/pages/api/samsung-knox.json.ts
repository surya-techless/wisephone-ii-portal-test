import type { APIRoute } from "astro";
import { captureException } from "@sentry/astro";
import { SamsungKnoxService } from "@/libs/samsung-knox-service";
import { devLog } from "@/libs/utils";
import { HTTP, jsonResponse, errorResponse, preflightResponse } from "@/lib/server/api.response";

type GetKnoxAction = "get-token" | "get-device-groups" | "get-device-info";
type PostKnoxAction = "apply-feature" | "remove-feature" | "install-app" | "uninstall-app";

export const OPTIONS: APIRoute = async () => {
  try {
    return preflightResponse();
  } catch (error) {
    console.error(error);
    return errorResponse("Internal Server Error", HTTP.INTERNAL_SERVER_ERROR);
  }
};

export const GET: APIRoute = async (props) => {
  const { request } = props;
  const url = new URL(request.url);
  const action: GetKnoxAction = url.searchParams.get("action") as GetKnoxAction;
  const imei = url.searchParams.get("imei");

  try {
    switch (action) {
      case "get-token":
        return jsonResponse({ token: await SamsungKnoxService.getKnoxToken() });

      case "get-device-groups":
        if (!imei) {
          return errorResponse("IMEI parameter required", HTTP.BAD_REQUEST);
        }

        // Fetch both groups and device info in parallel
        const [groups, deviceInfo] = await Promise.all([
          SamsungKnoxService.getGroupsForDevice(imei),
          SamsungKnoxService.getDeviceFromImei(imei)
        ]);

        return jsonResponse({ groups, deviceInfo });

      case "get-device-info":
        if (!imei) {
          return errorResponse("IMEI parameter required", HTTP.BAD_REQUEST);
        }

        const deviceInfoResult = await SamsungKnoxService.getDeviceFromImei(imei);
        return jsonResponse(deviceInfoResult);

      default:
        return errorResponse("Invalid action parameter", HTTP.BAD_REQUEST);
    }
  } catch (error) {
    captureException(error);
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
      HTTP.INTERNAL_SERVER_ERROR
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const action: PostKnoxAction = url.searchParams.get("action") as PostKnoxAction;
  const imei = url.searchParams.get("imei");

  if (!imei) {
    return errorResponse("IMEI is required", HTTP.BAD_REQUEST);
  }

  try {
    switch (action) {
      case "apply-feature": {
        const knoxManageId = url.searchParams.get("knoxManageId");
        if (!knoxManageId) {
          return errorResponse("Knox Manage ID is required", HTTP.BAD_REQUEST);
        }
        const response = await SamsungKnoxService.applyFeature(knoxManageId, imei, true);
        await SamsungKnoxService.sendNotification(
          imei,
          "Syncing Wisephone II",
          "Please wait a moment for your device to reflect the changes.",
          {
            sendType: "Notification"
          }
        );
        return jsonResponse(response);
      }
      case "remove-feature": {
        const knoxManageId = url.searchParams.get("knoxManageId");
        if (!knoxManageId) {
          return errorResponse("Knox Manage ID is required", HTTP.BAD_REQUEST);
        }
        const response = await SamsungKnoxService.removeFeature(knoxManageId, imei, true);
        await SamsungKnoxService.sendNotification(
          imei,
          "Syncing Wisephone II",
          "Please wait a moment for your device to reflect the changes.",
          {
            sendType: "Notification"
          }
        );
        return jsonResponse(response);
      }
      case "install-app": {
        const appPackage = url.searchParams.get("appPackage");

        if (!appPackage) {
          return errorResponse("App package is required", HTTP.BAD_REQUEST);
        }

        const response = await SamsungKnoxService.installAndroidApp(imei, {
          appPackage
        });

        return jsonResponse(response);
      }
      case "uninstall-app": {
        const appPackage = url.searchParams.get("appPackage");

        if (!appPackage) {
          return errorResponse("App package is required", HTTP.BAD_REQUEST);
        }

        const response = await SamsungKnoxService.uninstallAndroidApp(imei, appPackage);
        return jsonResponse(response);
      }
      default: {
        return errorResponse("Invalid action parameter", HTTP.BAD_REQUEST);
      }
    }
  } catch (error) {
    captureException(error);
    devLog.error(error);
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
      HTTP.INTERNAL_SERVER_ERROR
    );
  }
};

export const ALL: APIRoute = ({ request }) => {
  return errorResponse(`Method ${request.method} not allowed`, HTTP.METHOD_NOT_ALLOWED);
};
