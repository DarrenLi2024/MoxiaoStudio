import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface SigningIdentity {
  sha1: string;
  name: string;
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} 执行失败，退出码 ${result.status ?? "未知"}`);
}

function capture(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): string {
  const result = spawnSync(command, args, { encoding: "utf8", env, maxBuffer: 16 * 1024 * 1024 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0) throw new Error(`${command} 执行失败：\n${output.trim()}`);
  return output;
}

function signingIdentities(): SigningIdentity[] {
  const output = capture("security", ["find-identity", "-v", "-p", "codesigning"]);
  return [...output.matchAll(/\d+\)\s+([A-F0-9]{40})\s+"(Developer ID Application:[^"]+)"/gu)]
    .map((match) => ({ sha1: match[1], name: match[2] }));
}

function selectIdentity(identities: SigningIdentity[]): SigningIdentity {
  if (!identities.length) throw new Error("未找到 Developer ID Application 证书；拒绝生成可公开下载的未签名包");
  const requested = process.env.MOXIAO_SIGNING_IDENTITY?.trim();
  if (requested) {
    const match = identities.find((identity) => identity.sha1 === requested || identity.name === requested);
    if (!match) throw new Error(`MOXIAO_SIGNING_IDENTITY 未匹配有效证书：${requested}`);
    return match;
  }
  if (identities.length > 1) console.warn(`检测到 ${identities.length} 枚 Developer ID Application 证书，将使用钥匙串返回的第一枚；可用 MOXIAO_SIGNING_IDENTITY 显式指定 SHA-1。`);
  return identities[0];
}

if (process.platform !== "darwin") throw new Error("macOS 签名和公证只能在 macOS 上执行");

const root = resolve(import.meta.dirname, "..");
const desktopPackage = JSON.parse(readFileSync(resolve(root, "apps/desktop/package.json"), "utf8")) as { version: string };
const version = desktopPackage.version;
const profile = process.env.MOXIAO_NOTARY_PROFILE?.trim() || "moxiao-notary";
const identity = selectIdentity(signingIdentities());
const appPath = resolve(root, "release/mac-arm64/墨校台文枢.app");
const appZipPath = resolve(root, "release/墨校台文枢.zip");
const dmgPath = resolve(root, `release/Moxiao-Studio-${version}-arm64.dmg`);
const releaseEnv = { ...process.env, APPLE_KEYCHAIN_PROFILE: profile, CSC_NAME: identity.sha1 };

console.log(`签名身份：${identity.name} [${identity.sha1.slice(0, 10)}…]`);
console.log(`公证凭据：钥匙串配置 ${profile}`);
capture("xcrun", ["notarytool", "history", "--keychain-profile", profile, "--output-format", "json"]);

run("pnpm", ["--filter", "@moxiao/desktop", "run", "pack:mac"], releaseEnv);

const signature = capture("codesign", ["-dvv", appPath]);
for (const required of ["Authority=Developer ID Application:", "TeamIdentifier=38J989274V", "Timestamp="]) {
  if (!signature.includes(required)) throw new Error(`应用签名缺少 ${required}`);
}
run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
rmSync(appZipPath, { force: true });
run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", appPath, appZipPath]);
const appSubmission = capture("xcrun", ["notarytool", "submit", appZipPath, "--keychain-profile", profile, "--wait", "--output-format", "json"]);
const appResult = JSON.parse(appSubmission) as { id?: string; status?: string };
if (appResult.status !== "Accepted") throw new Error(`应用公证未通过：${appSubmission}`);
run("xcrun", ["stapler", "staple", appPath]);
run("xcrun", ["stapler", "validate", appPath]);
rmSync(appZipPath, { force: true });

// 只有应用已经装订 Apple 票据后才制作 DMG，保证磁盘映像内部也是完整可离线验证的应用。
run("pnpm", ["--filter", "@moxiao/desktop", "exec", "electron-builder", "--mac", "dmg", "--arm64", "--prepackaged", appPath, "--publish", "never"], releaseEnv);

// electron-builder 会签名应用，但生成的 DMG 容器默认没有 Developer ID 签名。
// 必须先签名 DMG，再把签名后的最终字节提交公证；否则 stapler 虽可验证，
// Gatekeeper 仍会以 `source=no usable signature` 拒绝打开磁盘映像。
run("codesign", ["--force", "--timestamp", "--sign", identity.sha1, dmgPath]);
const dmgSignature = capture("codesign", ["-dvv", dmgPath]);
for (const required of ["Authority=Developer ID Application:", "TeamIdentifier=38J989274V", "Timestamp="]) {
  if (!dmgSignature.includes(required)) throw new Error(`DMG 签名缺少 ${required}`);
}
run("codesign", ["--verify", "--verbose=2", dmgPath]);

const submission = capture("xcrun", ["notarytool", "submit", dmgPath, "--keychain-profile", profile, "--wait", "--output-format", "json"]);
const result = JSON.parse(submission) as { id?: string; status?: string };
if (result.status !== "Accepted") throw new Error(`DMG 公证未通过：${submission}`);
run("xcrun", ["stapler", "staple", dmgPath]);
run("xcrun", ["stapler", "validate", dmgPath]);
run("spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "-vv", dmgPath]);

const bytes = readFileSync(dmgPath);
const digest = createHash("sha256").update(bytes).digest("hex");
const manifestPath = resolve(root, `release/Moxiao-Studio-${version}-arm64.sha256.txt`);
writeFileSync(manifestPath, `${digest}  Moxiao-Studio-${version}-arm64.dmg\n`, "utf8");
console.log(`发布包已签名、公证并装订：${dmgPath}`);
console.log(`SHA-256：${digest}`);
console.log(`应用公证提交：${appResult.id ?? "未返回编号"}`);
console.log(`DMG 公证提交：${result.id ?? "未返回编号"}`);
