import { expect, test, _electron as electron } from "@playwright/test";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { validatePdfBytes } from "@moxiao/publication";

const databaseCopy = process.env.MOXIAO_LARGE_DB_COPY;
const pdfOutput = process.env.MOXIAO_E2E_PDF_PATH;

test("正式资料库隔离副本可完成整卷 PDF 出版", async () => {
  test.skip(!databaseCopy || !pdfOutput, "需提供数据库隔离副本与 PDF 输出路径");
  test.setTimeout(240_000);
  const profile = `large-publication-${process.pid}-${Date.now()}`;
  const userData = join(tmpdir(), `moxiao-${profile}`);
  mkdirSync(userData, { recursive: true });
  copyFileSync(databaseCopy!, join(userData, "moxiao.sqlite"));
  const application = await electron.launch({
    args: [resolve("apps/desktop/out/main/index.js")],
    env: { ...process.env, MOXIAO_PROFILE: profile, MOXIAO_THEME: "light", MOXIAO_E2E_PDF_PATH: pdfOutput }
  });
  try {
    const page = await application.firstWindow();
    await expect(page.getByRole("heading", { name: "一卷通校" })).toBeVisible();
    await expect(page.getByText(/2\d\d 篇 · 已删除/u).last()).toBeVisible();
    await page.evaluate(async () => {
      const project = await window.moxiao!.publicationProject();
      await window.moxiao!.savePublicationProject({ ...project, genreFilters: [], chronologyFilter: "all", placements: [] });
    });
    await page.getByRole("button", { name: "出版", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "出版中心" });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole("button", { name: "2 编排", exact: true }).click();
    await expect(dialog.getByRole("group", { name: "出版按体裁多选" })).toBeVisible();
    await dialog.getByLabel("出版按系年筛选").selectOption("all");
    await dialog.getByRole("button", { name: "6 导出", exact: true }).click();
    const exportButton = dialog.getByRole("button", { name: "导出并验证 PDF" });
    await expect(exportButton).toBeEnabled();
    await exportButton.click();
    await expect(dialog.getByText(/已导出 \d+ 页/u)).toBeVisible({ timeout: 180_000 });
    const validation = validatePdfBytes(readFileSync(pdfOutput!));
    expect(validation.ok).toBe(true);
    expect(validation.pageCount).toBeGreaterThan(220);
  } finally {
    await application.close();
  }
});
