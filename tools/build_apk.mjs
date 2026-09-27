#!/usr/bin/env node
// 轻食记 APK 一键构建（本地构建、本地签名，无第三方依赖）
// aapt2/zipalign 等原生工具不支持中文路径，因此在 ASCII 中转目录 C:\Users\Public\qingshiji-build
// 中完成编译，再把签名好的 APK 拷回项目根目录。
// 用法：node tools/build_apk.mjs
import { execFileSync, execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const STAGE = "C:\\Users\\Public\\qingshiji-build"; // 纯 ASCII 路径
const SDK = path.join(ROOT, "tools", "android-sdk");
const BT_SRC = path.join(SDK, "android-14"); // build-tools 34（源位置）
const ANDROID_JAR_SRC = path.join(SDK, "android-34", "android.jar");

const BT = path.join(STAGE, "build-tools");
const ANDROID_JAR = path.join(STAGE, "android", "android.jar");
const MANIFEST = path.join(STAGE, "android", "AndroidManifest.xml");
const RES = path.join(STAGE, "android", "res");
const SRC = path.join(STAGE, "android", "src");
const BUILD = path.join(STAGE, "build");
const KEYSTORE_DIR = path.join(ROOT, "android", "keystore"); // 密钥留在项目里（java 工具链支持中文路径）
const KEYSTORE_STAGE = path.join(STAGE, "keystore.qingshiji.keystore");
const OUT_APK = path.join(ROOT, "轻食记.apk");

const exists = (p) => fs.existsSync(p);
const run = (cmd, args, opts = {}) => {
  console.log("+", path.basename(cmd), args.map((a) => path.basename(a)).join(" "));
  execFileSync(cmd, args, { stdio: "inherit", ...opts });
};
// .bat 必须经 cmd 启动；用数组参数避免引号地狱（stage 内路径均无空格）
const runBat = (bat, args) => {
  console.log("+", path.basename(bat), args.map((a) => path.basename(a)).join(" "));
  execFileSync("cmd.exe", ["/c", bat, ...args], { stdio: "inherit" });
};
const findExe = (name) => {
  for (const c of [
    path.join("C:", "Program Files", "Java", "jdk-17", "bin", name + ".exe"),
    path.join("C:", "Program Files", "Common Files", "Oracle", "Java", "javapath", name + ".exe"),
  ])
    if (exists(c)) return c;
  return name; // 交给 PATH
};

// ---------- 0. 工具自检 ----------
for (const p of ["aapt2.exe", "zipalign.exe", path.join("lib", "d8.jar"), path.join("lib", "apksigner.jar")])
  if (!exists(path.join(BT_SRC, p))) { console.error("缺少构建工具：" + p); process.exit(1); }
if (!exists(ANDROID_JAR_SRC)) { console.error("缺少 android.jar"); process.exit(1); }
const JAVA = findExe("java"), JAVAC = findExe("javac"), JAR = findExe("jar"), KEYTOOL = findExe("keytool");

// ---------- 1. 准备 ASCII 中转目录 ----------
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(BT, { recursive: true });
fs.mkdirSync(path.join(BT, "lib"), { recursive: true });
fs.mkdirSync(path.join(STAGE, "android"), { recursive: true });
fs.cpSync(path.join(A_MK(ROOT), "AndroidManifest.xml"), MANIFEST);
fs.cpSync(path.join(A_MK(ROOT), "res"), RES, { recursive: true });
fs.cpSync(path.join(A_MK(ROOT), "src"), SRC, { recursive: true });
fs.copyFileSync(ANDROID_JAR_SRC, ANDROID_JAR);
for (const f of ["aapt2.exe", "zipalign.exe", "d8.bat", "apksigner.bat", "lib/d8.jar", "lib/apksigner.jar"]) {
  const to = path.join(BT, f);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(BT_SRC, f), to);
}
// 网页产物 + 图标
fs.mkdirSync(path.join(RES), { recursive: true });
fs.cpSync(path.join(ROOT, "dist"), path.join(STAGE, "assets"), { recursive: true });
for (const [src, dir] of [["icon-192.png", "mipmap-xxhdpi"], ["icon-512.png", "mipmap-xxxhdpi"]]) {
  const to = path.join(RES, dir, "ic_launcher.png");
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "public", "icons", src), to);
}
for (const d of ["gen", "classes", "dex"]) fs.mkdirSync(path.join(BUILD, d), { recursive: true });
console.log("已就绪 ASCII 中转目录：" + STAGE);

function A_MK(root) { return path.join(root, "android"); } // android 工程目录（中文路径侧）

// ---------- 2. aapt2 编译链接（不用 -A：Windows 版 aapt2 会把 assets 子目录写成反斜杠条目，由 ZipFix 统一追加） ----------
run(path.join(BT, "aapt2.exe"), ["compile", "--dir", RES, "-o", path.join(BUILD, "res.zip")]);
run(path.join(BT, "aapt2.exe"), [
  "link", "-o", path.join(BUILD, "base.apk"),
  "-I", ANDROID_JAR,
  "--manifest", MANIFEST,
  "--java", path.join(BUILD, "gen"),
  "--min-sdk-version", "24", "--target-sdk-version", "34",
  path.join(BUILD, "res.zip"), // 编译产物作为位置参数传入（-R 是覆盖层语义）
]);

// ---------- 3. javac ----------
const classes = [];
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) f.isDirectory() ? walk(path.join(d, f.name)) : classes.push(path.join(d, f.name)); };
run(JAVAC, [
  "-encoding", "UTF-8", "-source", "8", "-target", "8",
  "-classpath", ANDROID_JAR, "-d", path.join(BUILD, "classes"),
  path.join(BUILD, "gen", "com", "qingshiji", "app", "R.java"),
  path.join(SRC, "com", "qingshiji", "app", "MainActivity.java"),
], { stdio: "pipe" });
console.log("javac 完成（source/target 8 过时警告属正常）");

// ---------- 4. d8 转 dex ----------
walk(path.join(BUILD, "classes"));
runBat(path.join(BT, "d8.bat"), ["--min-api", "24", "--lib", ANDROID_JAR, "--output", path.join(BUILD, "dex"), ...classes]);

// ---------- 5. ZipFix 重打包（条目名统一 / + 追加 assets 与 dex） → zipalign ----------
run(JAVAC, ["-encoding", "UTF-8", "-d", path.join(BUILD, "zipfix"), path.join(ROOT, "android", "zipfix", "ZipFix.java")], { stdio: "pipe" });
run(JAVA, [
  "-cp", path.join(BUILD, "zipfix"), "ZipFix",
  path.join(BUILD, "base.apk"), path.join(BUILD, "base2.apk"),
  path.join(STAGE, "assets"), path.join(BUILD, "dex", "classes.dex"),
]);
run(path.join(BT, "zipalign.exe"), ["-f", "4", path.join(BUILD, "base2.apk"), path.join(BUILD, "aligned.apk")]);

// ---------- 6. 签名密钥（正式库存项目 android/keystore，构建时拷进 stage 使用） ----------
const KS_PROJECT = path.join(KEYSTORE_DIR, "qingshiji.keystore");
const PASS_FILE = path.join(KEYSTORE_DIR, "password.txt");
let PASS = "";
if (exists(KS_PROJECT)) {
  PASS = fs.readFileSync(PASS_FILE, "utf8").trim();
  fs.copyFileSync(KS_PROJECT, KEYSTORE_STAGE);
} else {
  fs.mkdirSync(KEYSTORE_DIR, { recursive: true });
  PASS = crypto.randomBytes(16).toString("base64url");
  fs.writeFileSync(PASS_FILE, PASS, "utf8");
  run(KEYTOOL, [
    "-genkeypair", "-keystore", KEYSTORE_STAGE, "-alias", "qingshiji",
    "-keyalg", "RSA", "-keysize", "2048", "-validity", "10950",
    "-storetype", "PKCS12", "-storepass", PASS, "-keypass", PASS,
    "-dname", "CN=Qingshiji Personal, OU=Personal, O=Personal, C=CN",
  ]);
  fs.copyFileSync(KEYSTORE_STAGE, KS_PROJECT);
  console.log("已生成新签名密钥 android/keystore/（请勿删除或泄露，丢失将无法覆盖安装）");
}

// ---------- 7. 签名 + 校验 ----------
runBat(path.join(BT, "apksigner.bat"), [
  "sign", "--ks", KEYSTORE_STAGE, "--ks-key-alias", "qingshiji",
  "--ks-pass", "pass:" + PASS, "--key-pass", "pass:" + PASS,
  "--out", path.join(STAGE, "signed.apk"), path.join(BUILD, "aligned.apk"),
]);
// 证书校验在 ASCII 目录做（apksigner 的 bat 对中文路径不友好），再拷回项目
console.log("\n===== 签名证书 =====");
execFileSync("cmd.exe", ["/c", path.join(BT, "apksigner.bat"), "verify", "--print-certs", path.join(STAGE, "signed.apk")], { stdio: "inherit" });
fs.copyFileSync(path.join(STAGE, "signed.apk"), OUT_APK);

const size = (fs.statSync(OUT_APK).size / 1024 / 1024).toFixed(2);
console.log(`\n✅ 构建完成：${OUT_APK}（${size} MB）`);
console.log("安装：把 APK 传到手机（数据线 / 微信文件传输助手），点开安装，允许一次「未知来源」即可。");
