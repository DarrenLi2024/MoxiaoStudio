import { expect, test, _electron as electron } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validatePdfBytes } from "@moxiao/publication";

const artifacts = resolve("artifacts/e2e");

test("本地工作区可新增、自动保存、筛选并查重", async () => {
  mkdirSync(artifacts, { recursive: true });
  const profile = `e2e-${process.pid}-${Date.now()}`;
  const application = await electron.launch({
    args: [resolve("apps/desktop/out/main/index.js")],
    env: { ...process.env, MOXIAO_PROFILE: profile, MOXIAO_THEME: "light" }
  });

  try {
    const page = await application.firstWindow();
    await expect(page.getByRole("heading", { name: "一卷通校" })).toBeVisible();
    await expect(page.getByText("SQLite · WAL")).toBeVisible();

    const title = `端到端试作-${Date.now()}`;
    await page.getByRole("button", { name: "＋ 新增作品" }).click();
    let dialog = page.getByRole("dialog", { name: "新增作品" });
    await dialog.getByLabel("作品题名").fill(title);
    await dialog.getByLabel("体裁").selectOption("xinshi");
    await dialog.getByLabel("正文").fill("第一行\n第二行");
    await dialog.getByRole("button", { name: "建立草稿" }).click();
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();

    await page.getByText(title, { exact: true }).first().click();
    await page.getByLabel("作品题名").fill(`${title}·改`);
    await expect(page.getByRole("button", { name: "所有更改已保存" })).toBeVisible({ timeout: 5_000 });
    await page.reload();
    await page.getByText(`${title}·改`, { exact: true }).first().click();
    await expect(page.getByLabel("作品题名")).toHaveValue(`${title}·改`);

    await page.getByLabel("按体裁筛选").selectOption("qijue");
    await expect(page.getByText("江城夜雨", { exact: true })).toBeVisible();
    await expect(page.getByRole("listbox", { name: "作品列表" }).getByText(`${title}·改`, { exact: true })).toHaveCount(0);
    await page.getByLabel("按体裁筛选").selectOption("all");

    await page.getByRole("button", { name: "＋ 新增作品" }).click();
    dialog = page.getByRole("dialog", { name: "新增作品" });
    await dialog.getByLabel("作品题名").fill(`${title}·改`);
    await dialog.getByLabel("正文").fill("第一行\n第二行");
    await dialog.getByRole("button", { name: "建立草稿" }).click();

    await page.getByRole("button", { name: "查重" }).click();
    await expect(page.getByRole("dialog", { name: "作品查重" })).toBeVisible();
    await expect(page.getByText(/候选 1 \/ /u)).toBeVisible();
    await page.screenshot({ path: join(artifacts, "editorial-workflow.png"), fullPage: true });
  } finally {
    await application.close();
  }
});

test("出版中心可预检水印页眉页脚并生成有效 PDF", async () => {
  mkdirSync(artifacts, { recursive: true });
  const output = join(artifacts, `publication-proof-${Date.now()}.pdf`);
  const application = await electron.launch({
    args: [resolve("apps/desktop/out/main/index.js")],
    env: { ...process.env, MOXIAO_PROFILE: `publication-${process.pid}-${Date.now()}`, MOXIAO_THEME: "light", MOXIAO_E2E_PDF_PATH: output }
  });

  try {
    const page = await application.firstWindow();
    await expect(page.getByRole("heading", { name: "一卷通校" })).toBeVisible();
    await page.getByRole("button", { name: "出版", exact: true }).last().click();
    const dialog = page.getByRole("dialog", { name: "出版中心" });
    await expect(dialog).toBeVisible();
    await expect(page.frameLocator('iframe[title="出版分页预览"]').getByText("春山小记")).toBeVisible();
    const watermark = dialog.getByRole("group", { name: "水印" });
    await watermark.getByLabel("启用").check();
    await watermark.getByLabel("文字").fill("内部送审 · 禁止外传");
    await expect(dialog.getByText("预检通过，可安全导出")).toBeVisible();
    await dialog.getByRole("button", { name: "导出并验证 PDF" }).click();
    await expect(dialog.getByText(/已导出 \d+ 页/u)).toBeVisible({ timeout: 10_000 });
    expect(validatePdfBytes(readFileSync(output)).ok).toBe(true);
    await page.screenshot({ path: join(artifacts, "publication-center.png"), fullPage: true });
  } finally {
    await application.close();
  }
});
