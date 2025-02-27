import type { APIRoute } from "astro";
import { SamsungKnoxService } from "@/libs/samsung-knox-service";

type GetKnoxAction = "get-token" | "get-device-groups";
type PostKnoxAction = "apply-feature" | "remove-feature" | "install-app" | "uninstall-app";

export const GET: APIRoute = async (props) => {
  const { request } = props;
  const url = new URL(request.url);
  const action: GetKnoxAction = url.searchParams.get("action") as GetKnoxAction;
  const imei = url.searchParams.get("imei");

  try {
    switch (action) {
      case "get-token":
        return new Response(
          JSON.stringify({
            token: await SamsungKnoxService.getKnoxToken()
          }),
          { status: 200 }
        );

      case "get-device-groups":
        if (!imei) {
          throw new Error("IMEI parameter required");
        }

        const groups = await SamsungKnoxService.getGroupsForDevice(imei);
        return new Response(JSON.stringify(groups), { status: 200 });

      default:
        return new Response(
          JSON.stringify({
            error: "Invalid action parameter"
          }),
          { status: 400 }
        );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error"
      }),
      { status: 500 }
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const action: PostKnoxAction = url.searchParams.get("action") as PostKnoxAction;
  const imei = url.searchParams.get("imei");

  if (!imei) {
    return new Response(JSON.stringify({ error: "IMEI is required" }), { status: 400 });
  }

  try {
    switch (action) {
      case "apply-feature": {
        const knoxManageId = url.searchParams.get("knoxManageId");
        if (!knoxManageId) {
          return new Response(JSON.stringify({ error: "Knox Manage ID is required" }), { status: 400 });
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
        return new Response(JSON.stringify(response), { status: 200 });
      }
      case "remove-feature": {
        const knoxManageId = url.searchParams.get("knoxManageId");
        if (!knoxManageId) {
          return new Response(JSON.stringify({ error: "Knox Manage ID is required" }), { status: 400 });
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
        return new Response(JSON.stringify(response), { status: 200 });
      }
      case "install-app": {
        const appPackage = url.searchParams.get("appPackage");

        if (!appPackage) {
          return new Response(JSON.stringify({ error: "App package is required" }), { status: 400 });
        }

        const response = await SamsungKnoxService.installAndroidApp(imei, {
          appPackage
        });

        return new Response(JSON.stringify(response), { status: 200 });
      }
      case "uninstall-app": {
        const appPackage = url.searchParams.get("appPackage");

        if (!appPackage) {
          return new Response(JSON.stringify({ error: "App package is required" }), { status: 400 });
        }

        const response = await SamsungKnoxService.uninstallAndroidApp(imei, appPackage);
        return new Response(JSON.stringify(response), { status: 200 });
      }
      default: {
        return new Response(
          JSON.stringify({
            error: "Invalid action parameter"
          }),
          { status: 400 }
        );
      }
    }
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error"
      }),
      { status: 500 }
    );
  }
};

export const ALL: APIRoute = ({ request }) => {
  return new Response(
    JSON.stringify({
      error: `Method ${request.method} not allowed`
    }),
    {
      status: 405,
      headers: {
        Allow: "GET, POST"
      }
    }
  );
};
