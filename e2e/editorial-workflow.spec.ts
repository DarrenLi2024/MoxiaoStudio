import { expect, test, _electron as electron } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createNewRecord, createWorkspace, digest, stableStringify } from "@moxiao/editorial";
import { validateEpubBytes, validatePdfBytes } from "@moxiao/publication";

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
  const illustration = join(artifacts, `publication-illustration-${Date.now()}.png`);
  writeFileSync(illustration, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
  const application = await electron.launch({
    args: [resolve("apps/desktop/out/main/index.js")],
    env: { ...process.env, MOXIAO_PROFILE: `publication-${process.pid}-${Date.now()}`, MOXIAO_THEME: "light", MOXIAO_E2E_PDF_PATH: output, MOXIAO_E2E_EPUB_PATH: epubOutput, MOXIAO_E2E_ASSET_PATH: illustration }
  });

  try {
    const page = await application.firstWindow();
    await expect(page.getByRole("heading", { name: "一卷通校" })).toBeVisible();
    await page.getByRole("button", { name: "出版", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "出版中心" });
    await expect(dialog).toBeVisible();
    await expect(page.frameLocator('iframe[title="出版分页预览"]').getByRole("heading", { name: "春山小记" })).toBeVisible();
    await dialog.getByRole("button", { name: "编排" }).click();
    const genreGroup = dialog.getByRole("group", { name: "出版按体裁多选" });
    await expect(genreGroup.getByRole("button")).toHaveCount(5);
    const qijueGenre = genreGroup.getByRole("button", { name: /七绝/u });
    await qijueGenre.click();
    await expect(qijueGenre).toHaveAttribute("aria-pressed", "false");
    await qijueGenre.click();
    await dialog.getByLabel("出版排序方式").selectOption("chronology-desc");
    await expect(dialog.locator(".publication-selection-list .publication-entry strong").first()).toContainText("临江仙·秋思");
    await dialog.getByRole("button", { name: "固化当前顺序" }).click();
    await expect(dialog.getByLabel("出版排序方式")).toHaveValue("author-intent");
    await dialog.getByRole("button", { name: "意境", exact: true }).click();
    await expect(dialog.getByText(/候选方案 · mood/u)).toBeVisible();
    await dialog.getByRole("button", { name: "应用此顺序" }).click();
    await dialog.getByRole("button", { name: "前置页" }).click();
    await expect(dialog.getByLabel("版权所有者")).toBeVisible();
    await dialog.getByLabel("前言确认状态").selectOption("confirmed");
    await dialog.getByLabel("作者简介确认状态").selectOption("confirmed");
    await dialog.getByRole("button", { name: "样式" }).click();
    await dialog.getByRole("button", { name: /当代清集/u }).click();
    await expect(page.frameLocator('iframe[title="出版分页预览"]').getByRole("heading", { name: "春山小记" })).toHaveCSS("text-align", "start");
    await dialog.getByRole("button", { name: /典藏书稿/u }).click();
    await dialog.getByRole("button", { name: "5 插图", exact: true }).click();
    await dialog.getByRole("button", { name: "为本篇添加插图" }).click();
    const placement = dialog.locator(".placement-editor").first();
    await placement.getByLabel("位置").selectOption("inline");
    await placement.getByLabel("插入锚点").fill("松风过处");
    await placement.getByLabel("替代文字").fill("春山意境插图");
    await placement.getByLabel("使用权").selectOption("owned");
    await expect(page.frameLocator('iframe[title="出版分页预览"]').getByAltText("春山意境插图")).toBeVisible();
    await dialog.getByRole("button", { name: "6 导出", exact: true }).click();
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
    await expect(page.getByRole("complementary", { name: "语义检查器" })).toBeHidden();
    await page.getByRole("listbox", { name: "作品列表" }).getByText("春山小记", { exact: true }).click();
    await page.getByRole("tab", { name: "笺读编校" }).click();
    await expect(page.getByLabel("今译")).toBeVisible();
    await expect(page.getByText("正文参照", { exact: true })).toBeVisible();
    await page.screenshot({ path: join(artifacts, "reading-editor-dark-narrow.png"), fullPage: true });
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1.15));
    await page.getByRole("button", { name: "出版", exact: true }).first().click();
    const publication = page.getByRole("dialog", { name: "出版中心" });
    await expect(publication).toBeVisible();
    await publication.getByRole("button", { name: "4 样式", exact: true }).click();
    await expect(publication.getByRole("button", { name: /素笺雅集/u })).toBeVisible();
    await expect(publication.getByRole("group", { name: "前置页与出版事实" })).toBeHidden();
    await expect(publication.getByRole("group", { name: "语义样式系统" })).toBeVisible();
    expect(await publication.locator(".publication-controls").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: join(artifacts, "publication-dark-narrow-large.png"), fullPage: true });
  } finally {
    await application.close();
  }
});
