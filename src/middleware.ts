import { clerkMiddleware, createRouteMatcher } from "@clerk/astro/server";
import { devLog } from "@/libs/utils";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

export const onRequest = clerkMiddleware((auth, context) => {
  const { userId } = auth();

  if (!userId && isProtectedRoute(context.request)) {
    devLog.log("Unauthorized access attempt to protected route:", context.url.pathname);
    // Redirect to portal homepage (which has the sign-in modal) instead of
    // Clerk's Account Portal, to avoid cross-origin redirect_url issues on tunnels.
    return context.redirect("/");
  }
});
