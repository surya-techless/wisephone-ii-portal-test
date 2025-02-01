import type { APIRoute } from "astro";
import { SamsungKnoxService } from "@/libs/samsung-knox-service";
import { KNOX_REGION, KNOX_CLIENT_ID, KNOX_CLIENT_SECRET } from "astro:env/server";

const getKnoxService = () =>
  SamsungKnoxService.getInstance({
    region: KNOX_REGION,
    clientId: KNOX_CLIENT_ID,
    clientSecret: KNOX_CLIENT_SECRET
  });

export const GET: APIRoute = async ({ params, request }) => {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const imei = url.searchParams.get("imei");

  try {
    switch (action) {
      case "get-token":
        return new Response(
          JSON.stringify({
            token: await getKnoxService().getKnoxToken()
          }),
          { status: 200 }
        );

      case "get-device-groups":
        if (!imei) throw new Error("IMEI parameter required");
        return new Response(
          JSON.stringify({
            groups: await getKnoxService().getGroupsForDevice(imei)
          }),
          { status: 200 }
        );

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
  const data = await request.json();

  try {
    switch (data.action) {
      case "apply-feature":
        return new Response(
          JSON.stringify({
            result: await getKnoxService().applyFeature(data.groupId, data.imei)
          }),
          { status: 200 }
        );

      case "remove-feature":
        return new Response(
          JSON.stringify({
            result: await getKnoxService().removeFeature(data.groupId, data.imei)
          }),
          { status: 200 }
        );

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
