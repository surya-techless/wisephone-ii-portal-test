import type { APIRoute } from "astro";
import { SamsungKnoxService } from "@/libs/samsung-knox-service";
import { FEATURES, UNPAID_GROUP_ID } from "@/libs/utils";

export const GET: APIRoute = async (props) => {
  const { request } = props;
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
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

/**
 * @description Removes the Unpaid user group from the device if the feature is being applied.
 * This is needed because Unpaid user group conflicts with these user groups.
 * @param knoxManageId - Samsung Knox Manage Group ID of the feature being applied.
 * @param imei - IMEI of the device.
 */
async function removeUnpaidGroup(knoxManageId: string, imei: string) {
  if (
    knoxManageId === FEATURES.TOOL_DRAWER.knoxManageId ||
    knoxManageId === FEATURES.FAITH_TOOLS.knoxManageId ||
    knoxManageId === FEATURES.GOOGLE_APPS.knoxManageId
  ) {
    await SamsungKnoxService.removeFeature(UNPAID_GROUP_ID, imei, false);
  }
}

export const POST: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const imei = url.searchParams.get("imei");
  const knoxManageId = url.searchParams.get("knoxManageId");

  if (!imei || !knoxManageId) {
    return new Response(JSON.stringify({ error: "IMEI and groupId are required" }), { status: 400 });
  }

  try {
    switch (action) {
      case "apply-feature": {
        // @TODO: Make it where Unpaid user group isn't even needed one day.
        await removeUnpaidGroup(knoxManageId, imei);

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
