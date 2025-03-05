import { db, eq, UserPermission } from "astro:db";

/**
 * User permission roles
 */
export enum UserRole {
  MEMBER = "member",
  ADMIN = "admin"
}

/**
 * Check if a user has admin permissions
 * @param userId The Clerk user ID to check
 * @returns Promise that resolves to boolean indicating if user is an admin
 */
export async function isAdmin(userId: string): Promise<boolean> {
  if (!userId) {
    console.error("No user ID provided");
    return false;
  }

  try {
    // Query the UserPermission table for this user
    const userPermission = await db.select().from(UserPermission).where(eq(UserPermission.userId, userId)).get();

    // Return true if the user has admin role
    return userPermission?.role === UserRole.ADMIN;
  } catch (error) {
    console.error("Error checking admin permissions:", error);
    return false;
  }
}

/**
 * Ensure a user is created in the permissions system
 * @param userId The Clerk user ID to ensure exists
 * @param role Optional role to assign (defaults to member)
 */
export async function ensureUserPermission(userId: string, role: UserRole = UserRole.MEMBER): Promise<void> {
  if (!userId) return;

  try {
    // Check if user already exists
    const existingPermission = await db.select().from(UserPermission).where(eq(UserPermission.userId, userId)).get();

    if (!existingPermission) {
      // Create new permission entry for this user
      await db.insert(UserPermission).values({
        userId,
        role,
        createdAt: new Date()
      });
    }
  } catch (error) {
    console.error("Error ensuring user permission:", error);
  }
}

/**
 * Update a user's role in the system
 * @param userId The Clerk user ID to update
 * @param role The new role to assign
 */
export async function updateUserRole(userId: string, role: UserRole): Promise<boolean> {
  if (!userId) return false;

  try {
    await db
      .update(UserPermission)
      .set({
        role,
        updatedAt: new Date()
      })
      .where(eq(UserPermission.userId, userId));
    return true;
  } catch (error) {
    console.error("Error updating user role:", error);
    return false;
  }
}
