import { CLERK_SECRET_KEY } from "astro:env/server";
import { PUBLIC_CLERK_PUBLISHABLE_KEY } from "astro:env/client";
import { createClerkClient } from "@clerk/astro/server";

const clerk = createClerkClient({
  publishableKey: PUBLIC_CLERK_PUBLISHABLE_KEY,
  secretKey: CLERK_SECRET_KEY
});

export async function getUser(userId: string) {
  try {
    // If userId is empty or not a string, return null immediately
    if (!userId || typeof userId !== "string") {
      console.warn("Invalid or missing userId provided to getUser:", userId);
      return null;
    }

    const user = await clerk.users.getUser(userId);
    return user;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}
