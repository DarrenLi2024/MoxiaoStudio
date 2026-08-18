import { expect, test, _electron as electron } from "@playwright/test";
import { copyFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const databaseCopy = process.env.MOXIAO_PRODUCTION_DB_COPY;

test("正式资料库隔离副本可渲染出版样式并按素材归并预检", async () => {
  test.skip(!databaseCopy, "需提供正式资料库隔离副本");
  test.setTimeout(120_000);
  const profile = `production-preflight-${process.pid}-${Date.now()}`;
  const userData = join(tmpdir(), `moxiao-${profile}`);
  mkdirSync(userData, { recursive: true });
  copyFileSync(databaseCopy!, join(userData, "moxiao.sqlite"));
  const cspErrors: string[] = [];
  const application = await electron.launch({
    args: [resolve("apps/desktop/out/main/index.js")],
    env: { ...process.env, MOXIAO_PROFILE: profile, MOXIAO_THEME: "light" }
  });
  try {
    const page = await application.firstWindow();
    page.on("console", (message) => {
      if (message.type() === "error" && /content security policy|style-src|inline style/iu.test(message.text())) cspErrors.push(message.text());
    });
    await page.evaluate(async () => {
      const project = await window.moxiao!.publicationProject();
      const placement = project.placements.find((item) => !project.assets.find((asset) => asset.id === item.assetId)?.alt.trim());
      const secondRecord = project.entries.find((entry) => entry.recordId !== placement?.recordId);
      if (placement && secondRecord) await window.moxiao!.savePublicationProject({ ...project, placements: [...project.placements, { ...placement, recordId: secondRecord.recordId }] });
    });
    await page.getByRole("button", { name: "出版", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "出版中心" });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    const preview = page.frameLocator('iframe[title="出版分页预览"]');
    expect(await preview.locator("html").evaluate(() => document.styleSheets.length)).toBeGreaterThan(0);
    const firstHeading = preview.locator("h1").first();
    await expect(firstHeading).toHaveCSS("text-align", "center");
    await dialog.getByRole("button", { name: "6 导出", exact: true }).click();
    const issueStats = await page.evaluate(async () => {
      const result = await window.moxiao!.publicationPreview();
      const assetIssues = result.preflight.issues.filter((issue) => issue.assetId);
      return { raw: assetIssues.length, grouped: new Set(assetIssues.map((issue) => issue.assetId)).size };
    });
    expect(issueStats.grouped).toBeGreaterThan(0);
    expect(issueStats.raw).toBeGreaterThan(issueStats.grouped);
    await expect(dialog.locator(".preflight-asset-task")).toHaveCount(issueStats.grouped);
    mkdirSync(resolve("artifacts/e2e"), { recursive: true });
    await page.screenshot({ path: resolve("artifacts/e2e/publication-preflight-workbench.png"), fullPage: true });
    await dialog.locator(".preflight-card").screenshot({ path: resolve("artifacts/e2e/publication-preflight-card.png") });
    expect(cspErrors).toEqual([]);
  } finally {
    await application.close();
  }
});
