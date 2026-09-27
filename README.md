# 轻食记 Qingshiji

> 减脂饮食记录 App · 拍照 AI 识别 · 扫码查营养 · 多人共享一台服务器
>
> 一个可完全自托管的「薄荷健康」精简开源替代。数据 100% 存在你自己的设备上。

React + TypeScript + Hono + SQLite，无重型依赖；网页 / PWA / 安卓 APK 三种形态共用同一套代码。

## 功能特性

| 功能 | 说明 |
|---|---|
| 📷 拍照识别 | 智谱 GLM-4V-Flash（免费档）识别一餐多个食物，估算克数与三大营养素，可逐项修改后入库；AI 估算项自动沉淀进食物库 |
| 🔍 扫条码 | 调用摄像头扫商品条码，秒查 [Open Food Facts](https://world.openfoodfacts.org/) 全球开源食物库（180 万+ 商品，免密钥） |
| 🌐 全球库兜底 | 本地食物库搜不到时自动查 Open Food Facts，点一下即存入自己的食物库 |
| 🚦 红黄绿分级 | 有 Nutri-Score 的商品直接映射（a/b 绿 · c 黄 · d/e 红）；其余按能量密度 + 蛋白质/膳食纤维/脂肪/糖综合判定 |
| 🍚 基础食物库 | 内置 175 种常见食物（热量/蛋白/碳水/脂肪/膳食纤维/糖/别名），参考《中国食物成分表》整理 |
| 🎯 目标自动计算 | Mifflin-St Jeor BMR × 活动系数 − 热量缺口；蛋白 1.6g/kg、脂肪 25% 热量、碳水补足，可手动覆盖；记体重自动重算 |
| 📊 统计图表 | 7/30 天热量柱状图（含目标线）、三大营养素均值、体重折线，纯 SVG 无图表库 |
| 💧 记录全家桶 | 体重、运动（MET 公式按体重估消耗）、饮水（目标 1500ml） |
| 👨‍👩‍👧 多用户 | 服务器模式下每人生成独立 6 位口令，口令对应**独立 SQLite 数据库文件**，结构性隔离互不可见 |
| 📱 三端形态 | 局域网服务器 / 网页 PWA（添加到手机桌面）/ 纯本地安卓 APK（离线可用） |

拍照识别提示：AI 对**库内基础食物**直接给标准值，库外菜品为估算并标「AI估算」徽标；识别结果全部可改克数、改名称、删除后再入库。

## 快速开始

要求：**Node.js ≥ 22.5**（使用内置 `node:sqlite`，无需安装任何数据库）。

```bash
git clone https://github.com/BUGdefender404/qingshiji.git
cd qingshiji
npm install

cp .env.example .env    # 填入你的智谱 API Key（https://open.bigmodel.cn 免费申请）

npm run build           # 构建前端到 dist/
npm start               # 启动服务器 http://localhost:8899
```

浏览器打开 `http://localhost:8899`，输入 `.env` 里设置的 `ACCESS_PIN` 即可。手机连同一 Wi-Fi 访问启动时打印的局域网地址（控制台附二维码；Windows 防火墙弹窗选「允许访问」）。

开发模式（前端热更新）：

```bash
npm run dev:server      # 后端 :8899
npm run dev             # 前端 :5173，/api 自动代理
```

### .env 配置项

| 变量 | 说明 |
|---|---|
| `ZHIPU_API_KEY` | 智谱开放平台 API Key，拍照识别用（GLM-4V-Flash 免费） |
| `ZHIPU_MODEL` | 视觉模型名，默认 `glm-4v-flash`；可选 `glm-4.6v-flash`（效果更好，用前在控制台确认计费为 0） |
| `PORT` | 服务端口，默认 8899 |
| `ACCESS_PIN` | **管理员**口令（6 位数字）。成员口令在应用内生成，不写在这里 |

## 三种使用形态

### 1. 局域网服务器（推荐家庭共用）

电脑跑 `npm start`，手机浏览器访问局域网地址，数据存在电脑 `data/` 目录（定期复制备份即可）。

**多用户**：管理员登录 →「我的 → 多用户/家庭成员」→ 输入成员名称 → 自动生成 6 位口令。成员用任何设备打开页面输入口令，即进入完全独立的个人空间——每人一个独立 SQLite 文件（`data/users/` 下），靠文件级隔离而非查询过滤，不存在串数据的可能。删除成员会连同其数据一起删除，管理员账号不可删除。

### 2. 纯网页 PWA（免服务器）

把 `dist/` 部署到任意静态托管（本项目自带 GitHub Pages 流程，线上实例：https://bugdefender404.github.io/qingshiji/ ）。此模式数据存浏览器 IndexedDB（可「导出备份」为文件迁移），智谱 Key 存本地 localStorage。详见 [deploy/部署指南.md](deploy/部署指南.md)（含 VPS Docker 方案）。

> 注意：微信内置浏览器无法添加到主屏幕；iPhone 只有 Safari 可以。App 内「我的 → 安装到手机桌面」会自动识别你的浏览器并给出对应指引。

### 3. 安卓 APK（纯本地，离线可用）

```bash
npm run build && node tools/build_apk.mjs
```

产物为项目根目录 `轻食记.apk`（约 0.25MB）。自研构建链 `aapt2 → javac → d8 → ZipFix → zipalign → apksigner`，**无需 Android Studio**；首次运行自动从 Google 官方源下载 build-tools 34 + platform-34（约 120MB，存于 `tools/android-sdk/`，已 gitignore；需 JDK 17）。Windows 下 aapt2 不支持中文路径，脚本会自动在 `C:\Users\Public\qingshiji-build` 中转构建。

安全设计（与常见"在线打包工具"的区别）：

- 权限仅 `INTERNET` + `CAMERA` 两项，无定位/通讯录/短信/存储/电话
- 零第三方 SDK、零统计、零广告；Java 壳代码仅约 230 行（[android/src](android/src)），可逐行审计
- 网页资源整体打进 APK，经 WebView 本地拦截服务（自定义 https origin）加载，离线可用
- 数据存应用私有沙箱，`allowBackup=false`，不可被 adb 备份提取
- 签名密钥首次构建时自动生成于 `android/keystore/`（**勿删勿外传**：丢失则无法覆盖安装升级，泄露等于任何人可伪造你的更新包，故已 gitignore）

## 项目结构

```
├── server/index.mjs        # Hono 后端：API + 口令分库（AsyncLocalStorage）+ GLM 识别/营养表解析
├── src/
│   ├── api.ts              # 双模式数据层（服务器 fetch / IndexedDB 本地）+ 目标计算 + 红黄绿算法
│   ├── off.ts              # Open Food Facts 客户端（搜索/条码/营养映射）
│   ├── pages/              # 今日 / 记一餐 / 统计 / 我的
│   └── components/         # 弹层（份量编辑、自定义食物、扫条码、运动）+ SVG 图表
├── android/                # 最小 WebView 壳（Java ~230 行）+ ZipFix 重打包工具
├── tools/build_apk.mjs     # APK 一键构建脚本
├── foods.json              # 175 种基础食物营养数据（含纤维/糖/别名）
├── public/                 # PWA manifest / Service Worker（网络优先）/ 图标
└── deploy/部署指南.md      # GitHub Pages / 局域网 / VPS Docker 三种部署
```

## 数据与隐私

- 所有个人记录只存在于你指定的设备：电脑 `data/*.db`、手机应用沙箱或浏览器 IndexedDB。没有账号体系，没有云端
- 应用仅对外连接两类服务：**智谱 API**（仅拍照识别时发送压缩后的食物照片）与 **Open Food Facts**（条码/关键词查询）。均无追踪
- 费用永远为零：GLM-4V-Flash 为官方免费档，用量可在智谱控制台「用量明细」核对

## 数据来源与致谢

- 基础食物营养数据参考《中国食物成分表》（第 6 版）、[中国营养学会营养健康查询平台](https://nlc.chinanutri.cn/fq/)、[NutriData](https://www.nutridata.cn/)
- 条码商品数据来自 [Open Food Facts](https://world.openfoodfacts.org/)（ODbL 开放数据库协议），营养分级采用其 Nutri-Score
- AI 识别由 [智谱开放平台](https://open.bigmodel.cn/) GLM-4V-Flash（免费档）提供
- 交互设计参考薄荷健康（本项目为个人学习用途的精简复刻，与之无任何关联，请勿使用其品牌元素商用）

## License

[MIT](LICENSE) © 2026 BUGdefender404
