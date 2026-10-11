import { test, expect } from "@playwright/test";
test("synthetic patient to doctor journey", async ({ page }) => {
  await page.goto("/workspace?demo=1");
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByLabel("Demo role").selectOption("patient");
  await page.getByRole("button", { name: "Appointments", exact: true }).click();
  await page
    .getByRole("button", { name: "Show token", exact: true })
    .first()
    .click();
  await expect(
    page.getByAltText("Opaque appointment check-in QR code"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Demo role").selectOption("reception");
  await page.getByRole("button", { name: "Appointments", exact: true }).click();
  await page
    .getByRole("button", { name: "Check in", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Review priority", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Clinical review / override reason")
    .fill("Synthetic review for automated test");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByLabel("Demo role").selectOption("doctor");
  await page
    .getByRole("button", { name: "Call next patient", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start consultation", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Complete", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Private consultation note")
    .fill("Synthetic completed consultation");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByLabel("Demo role").selectOption("admin");
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(page.getByText("Operational measures")).toBeVisible();
});
test("simulation controls and responsive navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workspace?demo=1");
  await page
    .getByRole("button", { name: "Simulation lab", exact: true })
    .click();
  await expect(page.getByText("Simulated queue over time")).toBeVisible();
  await page.getByLabel("Available doctors").fill("4");
  await expect(
    page.getByText("Synthetic simulation only.", { exact: false }),
  ).toBeVisible();
});
