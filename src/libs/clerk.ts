import { PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY } from "astro:env/server";
import { createClerkClient } from "@clerk/astro/server";

const clerk = createClerkClient({
  publishableKey: PUBLIC_CLERK_PUBLISHABLE_KEY,
  secretKey: CLERK_SECRET_KEY
});

export async function getUser(userId: string) {
  try {
    const user = await clerk.users.getUser(userId);
    return user;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}
