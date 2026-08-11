import { expect, test, _electron as electron } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

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
