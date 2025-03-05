import { clerkMiddleware, createRouteMatcher } from "@clerk/astro/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

export const onRequest = clerkMiddleware((auth, context) => {
  const { redirectToSignIn, userId } = auth();

  if (!userId && isProtectedRoute(context.request)) {
    // Add custom logic to run before redirecting
    console.log("Unauthorized access attempt to protected route:", context.url.pathname);

    return redirectToSignIn({
      returnBackUrl: context.url.origin
    });
  }
});
