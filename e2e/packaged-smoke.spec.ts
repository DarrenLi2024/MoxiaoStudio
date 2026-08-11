import { expect, test, _electron as electron } from "@playwright/test";

const executablePath = process.env.MOXIAO_PACKAGED_APP;

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
  } finally {
    await application.close();
  }
});
