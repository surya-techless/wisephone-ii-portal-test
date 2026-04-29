import type { APIRoute } from "astro";
import { db, App } from "astro:db";

import { sendSysProbe } from "@/libs/mqtt";

// TODO configure auth
export const GET: APIRoute = async () => {
  const now = new Date().toISOString();
  const payload = { awsSysprobeSignalReceivedAt: now };

  try {  
    // await db.select().from(App).limit(1);  // TODO: confirm that probe will not burn through db capacity
    await sendSysProbe(payload);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    });
  } catch (error) {
      return new Response(JSON.stringify({
        payload,
        error: error instanceof Error ? error.message : "Unknown error",
      }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate"
        }
      });
  }
};
