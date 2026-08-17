import { expect, test, _electron as electron } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createNewRecord, createWorkspace, digest, stableStringify } from "@moxiao/editorial";
import { validateEpubBytes, validatePdfBytes } from "@moxiao/publication";

const artifacts = resolve("artifacts/e2e");

test("本地工作区可新增、自动保存、筛选并查重", async () => {
  test.setTimeout(60_000);
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

    const title = `端到端试作-${String(Date.now()).slice(-7)}`;
    await page.getByRole("button", { name: "＋ 新增作品" }).click();
    let dialog = page.getByRole("dialog", { name: "新增作品" });
    await dialog.getByLabel("作品题名").fill(title);
    await dialog.getByLabel("体裁").selectOption("xinshi");
    await dialog.getByLabel("正文").fill("第一行\n第二行");
    await dialog.getByRole("button", { name: "建立草稿" }).click();
    const workList = page.getByRole("listbox", { name: "作品列表" });
    await expect(workList.getByText(title, { exact: true })).toBeVisible();

    await workList.getByText(title, { exact: true }).click();
    await page.getByLabel("作品题名").fill(`${title}·改`);
    await expect(page.getByRole("button", { name: "所有更改已保存" })).toBeVisible({ timeout: 5_000 });
    await page.reload();
    await workList.getByText(`${title}·改`, { exact: true }).click();
    await expect(page.getByLabel("作品题名")).toHaveValue(`${title}·改`);

    await page.getByRole("tab", { name: "笺读编校" }).click();
    await page.getByLabel("今译").fill("这是用于验证持久化的今译。");
    await page.getByRole("button", { name: "＋ 添加笺注" }).click();
    await page.getByLabel("第1条笺注锚点").fill("第一行");
    await page.getByLabel("第1条笺注内容").fill("锚定第一行的笺注。");
    await page.getByLabel("赏析").fill("这是用于验证完整笺读编校链路的赏析。");
    await expect(page.getByRole("button", { name: "所有更改已保存" })).toBeVisible({ timeout: 5_000 });
    await page.reload();
    await workList.getByText(`${title}·改`, { exact: true }).click();
    await page.getByRole("tab", { name: "笺读编校" }).click();
    await expect(page.getByLabel("今译")).toHaveValue("这是用于验证持久化的今译。");
    await expect(page.getByLabel("第1条笺注内容")).toHaveValue("锚定第一行的笺注。");

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

test("首次安装的演示区自动保存后仍可恢复全量备份", async () => {
  mkdirSync(artifacts, { recursive: true });
  const imported = createNewRecord({ title: "备份中的既有作品", form: "qijue", body: "一行旧作，\n二行旧作。", sequence: 20 });
  imported.operation = "update";
  imported.sourceHash = digest(imported.baseline);
  const backupPath = join(artifacts, `full-backup-${Date.now()}.json`);
  writeFileSync(backupPath, `${stableStringify(createWorkspace("full", [imported]), 2)}\n`, "utf8");
  const profile = `import-${process.pid}-${Date.now()}`;
  const launch = () => electron.launch({
    args: [resolve("apps/desktop/out/main/index.js")],
    env: { ...process.env, MOXIAO_PROFILE: profile, MOXIAO_THEME: "light", MOXIAO_E2E_IMPORT_PATH: backupPath }
  });

  let application = await launch();
  try {
    let page = await application.firstWindow();
    let workList = page.getByRole("listbox", { name: "作品列表" });
    await expect(workList.getByText("春山小记", { exact: true })).toBeVisible();
    await page.evaluate(async () => {
      const workspace = await window.moxiao!.loadWorkspace();
      await window.moxiao!.saveWorkspace(workspace);
    });
    await page.reload();
    await expect(page.getByText("修订 1", { exact: true }).last()).toBeVisible();
    workList = page.getByRole("listbox", { name: "作品列表" });
    await page.getByRole("button", { name: "导入作品" }).click();
    await expect(workList.getByText("备份中的既有作品", { exact: true })).toBeVisible();
    await expect(workList.getByText("春山小记", { exact: true })).toHaveCount(0);
    await application.close();

    application = await launch();
    page = await application.firstWindow();
    workList = page.getByRole("listbox", { name: "作品列表" });
    await expect(workList.getByText("备份中的既有作品", { exact: true })).toBeVisible();
    await expect(page.getByText("1 篇 · 已删除 0")).toBeVisible();
  } finally {
    await application.close();
  }
});

test("出版中心可预检水印页眉页脚并生成有效 PDF", async () => {
  test.setTimeout(120_000);
  mkdirSync(artifacts, { recursive: true });
  const output = join(artifacts, `publication-proof-${Date.now()}.pdf`);
  const epubOutput = join(artifacts, `publication-proof-${Date.now()}.epub`);
  const application = await electron.launch({
    args: [resolve("apps/desktop/out/main/index.js")],
    env: { ...process.env, MOXIAO_PROFILE: `publication-${process.pid}-${Date.now()}`, MOXIAO_THEME: "light", MOXIAO_E2E_PDF_PATH: output, MOXIAO_E2E_EPUB_PATH: epubOutput }
  });

  try {
    const page = await application.firstWindow();
    await expect(page.getByRole("heading", { name: "一卷通校" })).toBeVisible();
    await page.getByRole("button", { name: "出版", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "出版中心" });
    await expect(dialog).toBeVisible();
    await expect(page.frameLocator('iframe[title="出版分页预览"]').getByText("春山小记")).toBeVisible();
    const watermark = dialog.getByRole("group", { name: "水印" });
    await watermark.getByLabel("启用").check();
    await watermark.getByLabel("文字").fill("内部送审 · 禁止外传");
    await expect(dialog.getByText("预检通过，可安全导出")).toBeVisible();
    await dialog.getByRole("button", { name: "导出并验证 PDF" }).click();
    await expect(dialog.getByText(/已导出 \d+ 页/u)).toBeVisible({ timeout: 60_000 });
    expect(validatePdfBytes(readFileSync(output)).ok).toBe(true);
    await dialog.getByLabel("目标客户端").selectOption("epub");
    await watermark.getByLabel("启用").uncheck();
    await dialog.getByLabel("启用页眉页脚").uncheck();
    await expect(dialog.getByText("预检通过，可安全导出")).toBeVisible();
    await dialog.getByRole("button", { name: "导出并验证 EPUB" }).click();
    await expect(dialog.getByText(/已导出 \d+ 个条目/u)).toBeVisible({ timeout: 60_000 });
    expect(validateEpubBytes(readFileSync(epubOutput))).toMatchObject({ ok: true });
    await page.screenshot({ path: join(artifacts, "publication-center.png"), fullPage: true });
  } finally {
    await application.close();
  }
});

test("笺读编校在窄屏深色与减弱动态效果下保持可用", async () => {
  mkdirSync(artifacts, { recursive: true });
  const application = await electron.launch({
    args: [resolve("apps/desktop/out/main/index.js")],
    env: { ...process.env, MOXIAO_PROFILE: `reading-visual-${process.pid}-${Date.now()}`, MOXIAO_THEME: "dark" }
  });
  try {
    const page = await application.firstWindow();
    await page.setViewportSize({ width: 980, height: 760 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.getByRole("listbox", { name: "作品列表" }).getByText("春山小记", { exact: true }).click();
    await page.getByRole("tab", { name: "笺读编校" }).click();
    await expect(page.getByLabel("今译")).toBeVisible();
    await expect(page.getByText("正文参照", { exact: true })).toBeVisible();
    await page.screenshot({ path: join(artifacts, "reading-editor-dark-narrow.png"), fullPage: true });
  } finally {
    await application.close();
  }
});
