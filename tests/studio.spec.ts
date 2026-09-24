import { expect, test, type Download, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { PortfolioData } from "../src/types";

test.describe.configure({ mode: "serial" });

async function openStudio(page: Page) {
  await page.goto("/studio");
  await expect(
    page.getByRole("heading", { name: "A little more you." }),
  ).toBeVisible();
}

async function saveDraft(page: Page) {
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Draft saved. Your public site hasn’t changed.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeDisabled();
}

async function preview(page: Page) {
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Back to studio" }),
  ).toBeVisible();
}

async function downloadText(download: Download) {
  const filename = await download.path();
  expect(filename).not.toBeNull();
  return readFile(filename!, "utf8");
}

async function chooseFile(
  page: Page,
  button: string,
  name: string,
  mimeType: string,
  content: string,
) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button, exact: true }).click();
  await (
    await chooser
  ).setFiles({ name, mimeType, buffer: Buffer.from(content) });
}

test("saved edits survive reload; publication and version restoration have separate effects", async ({
  page,
  context,
}) => {
  const visitor = await context.newPage();
  await visitor.goto("/");
  await expect(
    visitor.getByRole("heading", { name: /Selected work/ }),
  ).toBeVisible();
  await expect(
    visitor.getByRole("heading", { name: /Private review notes/ }),
  ).toHaveCount(0);
  await expect(
    visitor.getByRole("heading", { name: "Blog + Weather App", exact: true }),
  ).toHaveCount(0);
  const startingPublic: PortfolioData = await (
    await page.request.get("/api/portfolio")
  ).json();
  expect(JSON.stringify(startingPublic)).not.toContain("review-notes");
  expect(
    startingPublic.sections
      .flatMap((section) => section.items)
      .some((item) => item.id === "weather"),
  ).toBe(false);

  await openStudio(page);
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await page
    .getByLabel("What you do", { exact: false })
    .fill("Developer exploring the next chapter");
  await saveDraft(page);
  await page.reload();
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await expect(page.getByLabel("What you do", { exact: false })).toHaveValue(
    "Developer exploring the next chapter",
  );

  await visitor.reload();
  await expect(
    visitor.getByText("Developer exploring the next chapter", { exact: true }),
  ).toHaveCount(0);
  await expect(
    visitor.getByText(startingPublic.profile.role, { exact: false }),
  ).toBeVisible();
  await preview(page);
  await expect(
    page.getByText("Developer exploring the next chapter", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to studio" }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    page.getByText("Published. Your public portfolio is up to date.", {
      exact: true,
    }),
  ).toBeVisible();
  await visitor.reload();
  await expect(
    visitor.getByText("Developer exploring the next chapter", { exact: false }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  await page
    .locator(".history-row")
    .filter({ hasText: "Starting portfolio" })
    .getByRole("button", { name: "Restore to draft" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restore to draft", exact: true })
    .click();
  await expect(
    page.getByText(
      "Version restored to your draft. Preview it before publishing.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await expect(page.getByLabel("What you do", { exact: false })).toHaveValue(
    startingPublic.profile.role,
  );
  await preview(page);
  await expect(
    page.getByText(startingPublic.profile.role, { exact: false }),
  ).toBeVisible();
  await visitor.reload();
  await expect(
    visitor.getByText("Developer exploring the next chapter", { exact: false }),
  ).toBeVisible();
  await visitor.close();
});

test("custom content, visibility, order, and appearance work together in a private preview", async ({
  page,
  context,
}) => {
  await openStudio(page);
  await page
    .getByRole("button", { name: "Content & sections", exact: true })
    .click();
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Custom section/ }).click();
  await dialog.getByLabel("Give it a name").fill("Writing & experiments");
  await dialog
    .getByRole("button", { name: "Add section", exact: true })
    .click();
  await expect(page.getByLabel("Section title")).toHaveValue(
    "Writing & experiments",
  );

  for (const entry of [
    {
      title: "A first field note",
      description: "A small experiment worth sharing.",
      visible: true,
    },
    {
      title: "A newer field note",
      description: "A second story that belongs at the top.",
      visible: true,
    },
    {
      title: "An unfinished private thought",
      description: "This should remain private in the studio.",
      visible: false,
    },
  ]) {
    await page.getByRole("button", { name: "Add entry", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Title", exact: true })
      .fill(entry.title);
    await page
      .getByRole("textbox", { name: "Description", exact: true })
      .fill(entry.description);
    if (!entry.visible)
      await page.getByRole("checkbox", { name: "Show this entry" }).uncheck();
  }
  await page
    .getByRole("button", { name: "Move A newer field note up", exact: true })
    .click();
  const moveSectionUp = page.getByRole("button", {
    name: "Move Writing & experiments up",
    exact: true,
  });
  for (
    let index = 0;
    index < 30 && (await moveSectionUp.isEnabled());
    index += 1
  )
    await moveSectionUp.click();
  await expect(moveSectionUp).toBeDisabled();

  await preview(page);
  const customRegion = page.getByRole("region", {
    name: "Writing & experiments.",
  });
  await expect(customRegion.getByRole("heading", { level: 3 })).toHaveText([
    "A newer field note",
    "A first field note",
  ]);
  await expect(
    page.getByRole("heading", { name: "An unfinished private thought" }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link")
      .first(),
  ).toHaveText("Writing & experiments");

  await page.getByRole("button", { name: "Back to studio" }).click();
  await page
    .getByRole("switch", { name: "Show Writing & experiments publicly" })
    .click();
  await preview(page);
  await expect(
    page.getByRole("heading", { name: "Writing & experiments." }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Back to studio" }).click();
  await page
    .getByRole("switch", { name: "Show Writing & experiments publicly" })
    .click();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("button", { name: "Clear skies", exact: true }).click();
  await page.getByRole("button", { name: "After hours", exact: true }).click();
  await page.getByRole("button", { name: /Modern.*Clean & direct/ }).click();
  await saveDraft(page);
  await page.reload();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Clear skies", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "After hours", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await preview(page);
  await expect(page.locator(".portfolio")).toHaveAttribute(
    "data-accent",
    "blue",
  );
  await expect(page.locator(".portfolio")).toHaveAttribute(
    "data-surface",
    "dark",
  );
  await expect(page.locator(".portfolio")).toHaveAttribute(
    "data-font",
    "modern",
  );
  await expect(
    page.getByRole("region", { name: "Writing & experiments." }),
  ).toBeVisible();

  const visitor = await context.newPage();
  await visitor.goto("/");
  await expect(
    visitor.getByRole("heading", { name: /Selected work/ }),
  ).toBeVisible();
  await expect(
    visitor.getByRole("heading", { name: "Writing & experiments." }),
  ).toHaveCount(0);
  await expect(visitor.locator(".portfolio")).toHaveAttribute(
    "data-surface",
    "paper",
  );
  await visitor.close();
});

test("source files download and delete; private JSON backups validate before replacing the draft", async ({
  page,
  context,
}) => {
  await openStudio(page);
  await page
    .getByRole("button", { name: "Source library", exact: true })
    .click();
  await page
    .getByLabel("A note for this file (optional)")
    .fill("Check these project dates before editing.");
  const sourceText = "Private source note: a new project awaits review.";
  await chooseFile(
    page,
    "Choose a file",
    "project-notes.txt",
    "text/plain",
    sourceText,
  );
  await expect(
    page.getByRole("link", { name: "project-notes.txt", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Check these project dates before editing.", {
      exact: true,
    }),
  ).toBeVisible();
  const sourceDownload = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download project-notes.txt", exact: true })
    .click();
  expect(await downloadText(await sourceDownload)).toBe(sourceText);
  const publicResponse = await page.request.get("/api/portfolio");
  expect(await publicResponse.text()).not.toContain("project-notes.txt");

  const backupDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export draft", exact: true }).click();
  const backup: PortfolioData = JSON.parse(
    await downloadText(await backupDownload),
  );
  expect(
    backup.sections.find((section) => section.id === "review-notes")?.visible,
  ).toBe(false);
  expect(
    backup.sections
      .flatMap((section) => section.items)
      .some(
        (item) =>
          item.title === "An unfinished private thought" && !item.visible,
      ),
  ).toBe(true);
  expect("sources" in backup).toBe(false);

  await page
    .getByRole("button", { name: "Delete project-notes.txt", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete file", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "project-notes.txt", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Your shelf is ready." }),
  ).toBeVisible();

  await chooseFile(
    page,
    "Import backup",
    "invalid-backup.json",
    "application/json",
    JSON.stringify({ schemaVersion: 999 }),
  );
  await expect(page.getByRole("alert")).toContainText(
    "This file is not a valid portfolio backup.",
  );
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Dismiss error" }).click();
  backup.profile.role = "Imported draft, still private";
  await chooseFile(
    page,
    "Import backup",
    "portfolio-backup.json",
    "application/json",
    JSON.stringify(backup),
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Replace draft", exact: true })
    .click();
  await saveDraft(page);
  await page.reload();
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await expect(page.getByLabel("What you do", { exact: false })).toHaveValue(
    "Imported draft, still private",
  );
  await preview(page);
  await expect(
    page.getByText("Imported draft, still private", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "An unfinished private thought" }),
  ).toHaveCount(0);

  const visitor = await context.newPage();
  await visitor.goto("/");
  await expect(
    visitor.getByText("Developer exploring the next chapter", { exact: false }),
  ).toBeVisible();
  await expect(
    visitor.getByText("Imported draft, still private", { exact: false }),
  ).toHaveCount(0);
  await visitor.close();
});

test("browser Back protects unsaved edits and reloading conflicts updates tag fields", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Portfolio studio", exact: true })
    .click();
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await page.getByLabel("What you do").fill("Keep my unsaved thought");
  await page.goBack();
  await expect(page.getByRole("dialog")).toContainText(
    "Save before you leave?",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("What you do")).toHaveValue(
    "Keep my unsaved thought",
  );
  await saveDraft(page);
  await page
    .getByRole("button", { name: "Content & sections", exact: true })
    .click();
  await page
    .locator(".section-select")
    .filter({ hasText: "Selected work" })
    .click();
  await page
    .locator(".entry-expand")
    .filter({ hasText: "Safari Marketplace" })
    .click();
  const state = await (await page.request.get("/api/studio")).json();
  state.draft.sections.find(
    (s: { id: string }) => s.id === "work",
  ).items[0].tags = ["Newest server tag"];
  expect(
    (
      await page.request.put("/api/draft", {
        data: { portfolio: state.draft, revision: state.revision },
      })
    ).ok(),
  ).toBe(true);
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("An edit from an older session");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("another session");
  await page.getByRole("button", { name: "Reload draft", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Reload draft", exact: true })
    .click();
  await expect(page.getByLabel("Tags (comma separated)")).toHaveValue(
    "Newest server tag",
  );
});

test("public and studio screens remain accessible and usable on small screens", async ({
  page,
}) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of ["/", "/studio"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(result.violations).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hello, you." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});
