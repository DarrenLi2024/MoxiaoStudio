import { expect, test, _electron as electron } from "@playwright/test";
import { readFileSync } from "node:fs";
import { validatePdfBytes } from "@moxiao/publication";

const executablePath = process.env.MOXIAO_PACKAGED_APP;
const pdfOutput = process.env.MOXIAO_E2E_PDF_PATH;

test("安装包内的桌面应用可冷启动并打开本地工作区", async () => {
  test.skip(!executablePath, "请通过 MOXIAO_PACKAGED_APP 指定安装包内的可执行文件");

  const application = await electron.launch({
    executablePath,
    env: {
      ...process.env,
      MOXIAO_PROFILE: `packaged-${process.pid}-${Date.now()}`,
      MOXIAO_THEME: "light"
    }
  });

  try {
    const page = await application.firstWindow();
    await expect(page.getByRole("heading", { name: "一卷通校" })).toBeVisible();
    await expect(page.getByText("SQLite · WAL")).toBeVisible();
    await expect(page.getByRole("button", { name: "＋ 新增作品" })).toBeEnabled();
    await page.getByRole("button", { name: "出版", exact: true }).last().click();
    const publicationDialog = page.getByRole("dialog", { name: "出版中心" });
    await expect(publicationDialog).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("预检通过，可安全导出")).toBeVisible();
    if (pdfOutput) {
      await publicationDialog.getByRole("button", { name: "导出并验证 PDF" }).click();
      await expect(publicationDialog.getByText(/已导出 \d+ 页/u)).toBeVisible({ timeout: 60_000 });
      expect(validatePdfBytes(readFileSync(pdfOutput)).ok).toBe(true);
    }
  } finally {
    await application.close();
  }
});
