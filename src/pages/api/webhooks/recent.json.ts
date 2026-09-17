import type { APIRoute } from "astro";
import { db, WebhookEvent, desc } from "astro:db";
import { isAdmin } from "@/lib/auth/permissions";

/**
 * GET /api/webhooks/recent.json
 *
 * Returns the most recent Stripe/Gigs webhook events recorded by
 * /api/webhooks/stripe and /api/webhooks/gigs, newest first. Used by the
 * dashboard to poll and console.log incoming events in the browser, since the
 * webhooks themselves are received server-to-server (no browser involved in
 * that request at all).
 *
 * Admin-only: these events aren't scoped to the requesting user's own
 * devices — they span every IMEI, so a non-admin user could otherwise see
 * other users' subscription events.
 */
export const GET: APIRoute = async ({ locals }) => {
  const userId = locals.auth().userId;
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const user = await locals.currentUser();
  if (!user || !(await isAdmin(user.id))) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }

  const events = await db.select().from(WebhookEvent).orderBy(desc(WebhookEvent.id)).limit(20);

  return new Response(JSON.stringify({ events }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

export const ALL: APIRoute = ({ request }) => {
  return new Response(JSON.stringify({ error: `Method ${request.method} not allowed` }), {
    status: 405,
    headers: { "Content-Type": "application/json" }
  });
};
