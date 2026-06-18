import { expect, test } from "@playwright/test";

/**
 * Full happy-path E2E over the real stack (browser → Next.js → DRF → Postgres-
 * shaped sqlite): register → create a note → confirm it autosaved & persisted
 * across a reload → delete it. Each run uses a unique email so the shared DB
 * never collides between runs.
 */

// A dissimilar email/password pair: Django's UserAttributeSimilarityValidator
// rejects passwords that overlap the email, so keep them unrelated.
function uniqueEmail() {
  return `qa-${Date.now()}@example.com`;
}
const PASSWORD = "Tortuga-Verde-77";

test("register → create → autosave persists → delete", async ({ page }) => {
  const email = uniqueEmail();
  const title = `E2E note ${Date.now()}`;

  // --- Register (auto-logs in and lands on the board) ---
  await page.goto("/signup");
  await page.getByPlaceholder("Email address").fill(email);
  await page.getByPlaceholder("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign Up" }).click();

  const newNote = page.getByRole("button", { name: "New Note" });
  await expect(newNote).toBeVisible();

  // --- Create a note (no save button — autosave; close flushes) ---
  await newNote.click();
  await page.getByPlaceholder("Note Title").fill(title);
  await page
    .getByPlaceholder("Pour your heart out...")
    .fill("Written by the Playwright E2E.");
  await page.getByRole("button", { name: "Close editor" }).click();

  // The new card appears on the board after the forming-card transition.
  const card = page.getByRole("button", { name: `Edit note: ${title}` });
  await expect(card).toBeVisible();

  // --- Reload: the note must have actually persisted (autosave worked) ---
  await page.reload();
  await expect(
    page.getByRole("button", { name: `Edit note: ${title}` }),
  ).toBeVisible();

  // --- Delete it (card delete → confirm dialog → confirm) ---
  await page.getByRole("button", { name: `Delete note: ${title}` }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete" }).click();

  await expect(
    page.getByRole("button", { name: `Edit note: ${title}` }),
  ).toHaveCount(0);
});

test("the board is protected: anonymous visit redirects to /login", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: /yay, you're back/i })).toBeVisible();
});
