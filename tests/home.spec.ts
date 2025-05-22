import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

async function signIn(page: Page) {
  await setupClerkTestingToken({ page, options: { frontendApiUrl: "localhost:4321" } });

  // Set isOver18 to true in localStorage before navigating
  await page.addInitScript(() => {
    localStorage.setItem("_x_isOver18", "true");
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();

  // Wait for the Clerk modal to appear and verify its contents
  const clerkModal = page.locator(".cl-modalContent");
  await expect(clerkModal).toBeVisible();
  await expect(clerkModal.getByText("Sign in to Wisephone Portal")).toBeVisible();
  await expect(clerkModal.getByLabel("Email address")).toBeVisible();
  await expect(clerkModal.getByRole("button", { name: "Continue" })).toBeVisible();

  // Fill in the email address and click continue
  await clerkModal.getByLabel("Email address").fill("cameronandrewpak+clerk_test@gmail.com");
  await clerkModal.getByRole("button", { name: "Continue" }).click();

  await page.waitForTimeout(1000);

  await expect(clerkModal.getByText(/Didn't receive a code\?/)).toBeVisible();
  // Fill in the OTP code with 424242
  await clerkModal.getByLabel("Enter verification code. Digit 1").fill("424242");

  // Check that I'm on the dashboard page.
  await expect(page.getByRole("heading", { name: /Connect to your Wisephone/i })).toBeVisible();
  // verify url is /dashboard
  await expect(page).toHaveURL("/dashboard");

  // Wait for the Clerk modal to disappear
  await expect(clerkModal).not.toBeVisible();
}

test.describe("Home Page", () => {
  test("should handle age verification flow correctly", async ({ page }) => {
    await page.goto("/");

    // Verify initial state - Get Started button should be visible
    const getStartedButton = page.getByRole("button", { name: "Get Started" });
    await expect(getStartedButton).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Sign up" })).not.toBeVisible();

    // Click Get Started and verify modal appears
    await getStartedButton.click();
    const modal = page.locator(".modal-box");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Before we get started")).toBeVisible();

    // Verify checkbox is present and unchecked
    const ageCheckbox = page.getByRole("checkbox");
    await expect(ageCheckbox).toBeVisible();
    await expect(ageCheckbox).not.toBeChecked();

    // Check the age verification checkbox
    await ageCheckbox.check();
    await expect(ageCheckbox).toBeChecked();

    // Click continue and verify modal closes
    await page.getByRole("button", { name: "Continue" }).click();
    const modalParent = page.getByRole("dialog");
    await expect(modalParent).toHaveCSS("pointer-events", "none");
    await expect(modalParent).toHaveCSS("opacity", "0");

    // Verify final state - Get Started button should be gone, Sign in and Sign up buttons should be visible
    await expect(getStartedButton).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign up" })).toBeVisible();
  });

  test("I can add a Wisephone", async ({ page }) => {
    await signIn(page);

    await expect(page.getByRole("heading", { name: /Connect to your Wisephone/i })).toBeVisible();

    // Click Get Started to show the form
    await page.getByRole("button", { name: "Get Started" }).click();

    await expect(page.getByRole("heading", { name: /Add a Wisephone/i })).toBeVisible();

    // Fill in the IMEI fields
    await page.getByLabel("Wisephone IMEI (slot 1)").fill("353994911040860");
    await page.getByLabel("Enter the IMEI one more time").fill("353994911040860");

    // Fill in the phone number
    await page.getByLabel("Wisephone Phone Number").fill("405-206-0654");

    // Fill in the nickname
    await page.getByLabel("Give this Wisephone a name or owner").fill("A16 5G");

    // Submit the form
    await page.getByRole("button", { name: "Done" }).click();

    // Verify the form is hidden and the device list is shown
    await expect(page.getByRole("heading", { name: "Your Devices" })).toBeVisible();

    // Verify the new device appears in the list
    const deviceLink = page.getByText("A16 5G").first();
    await expect(deviceLink).toBeVisible();
    await expect(page.getByText("405-206-0654")).toBeVisible();

    // Click the device link to navigate to the device page
    await page.locator("a", { hasText: "A16 5G" }).click();

    // Verify the page is redirected to the device page with the correct URL format
    await expect(page).toHaveURL("/dashboard/device/353994911040860");

    // Verify we're on the Features page
    await expect(page.getByRole("heading", { name: "Features" })).toBeVisible();

    // Now, remove the Wisephone from the list
    // The button text is "Remove Wisephone from My Devices" with a trash icon
    const removeButton = page.getByRole("button", { name: /Remove Wisephone from My Devices/i });
    await expect(removeButton).toBeVisible();

    // Set up dialog handler to accept the confirmation dialog
    page.once("dialog", (dialog) => dialog.accept());

    // Click the remove button
    await removeButton.click();

    // Verify we are redirected back to the dashboard
    await expect(page).toHaveURL("/dashboard");

    // Verify the device is no longer in the list
    await expect(page.getByText("A16 5G")).not.toBeVisible();
  });
});
