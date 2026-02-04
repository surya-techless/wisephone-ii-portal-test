import { clerkMiddleware, createRouteMatcher } from "@clerk/astro/server";
import { devLog } from "@/libs/utils";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

export const onRequest = clerkMiddleware((auth, context) => {
  const { redirectToSignIn, userId } = auth();

  if (!userId && isProtectedRoute(context.request)) {
    // Add custom logic to run before redirecting
    devLog.log("Unauthorized access attempt to protected route:", context.url.pathname);

    return redirectToSignIn({
      returnBackUrl: context.url.origin
    });
  }
});
