# ClauseEye · 契眼

> **你的合同只属于你。** 本地优先的个人合同 & 证明文档管家。

面向个人用户的**隐私优先**合同与证明文档管理工具：导入即自动分类，规则引擎帮你标出合同里的"坑"，支持多份 Offer 横向对比、关键日期到期提醒、扫描件离线 OCR。所有文档默认**本地加密存储，绝不离开你的设备**；深度分析走 **BYOK（自带大模型密钥）**，我们看不到你的任何内容。

## 核心卖点

- 🔒 **本地优先 / 零上报**：合同存在你本机（IndexedDB + AES-GCM 加密），项目本身没有任何服务端；无口令模式的主密钥由系统钥匙串（DPAPI / Keychain）保护。
- 👁 **坑点雷达**：劳动合同、租房、Offer、离职证明、工伤鉴定、保密协议、服务协议 + 通用条款，共 **150 条规则**，离线即可出结果。
- 📄 **扫描件也能读**：内置 tesseract.js 离线 OCR（中文 + 英文语言包随包分发），图片与扫描版 PDF 都能识别，识别过程不联网。
- ⏰ **到期提醒**：自动抽取合同起止、试用期结束、竞业期、救济期限等关键日期，临期/到期/逾期弹系统通知，点通知直达文档。
- ⚖️ **多 Offer 对比**：把几份 Offer 结构化抽取后并排对比，薪资、期权、试用期、违约金一目了然。
- 🔮 **BYOK 深度分析**：只有你自己填入的模型接口会收到待分析文本，ClauseEye 不做中转、不留存。

## 快速开始

### 方式一：下载桌面版（Windows / macOS / Linux）

到 [Releases](https://github.com/1576584678/ClauseEye/releases) 下载对应平台的文件，**双击即可运行，不需要安装 Node.js 或任何其它依赖**：

| 平台 | 文件 | 说明 |
|---|---|---|
| Windows | `ClauseEye-0.4.0-win-x64-setup.exe` | **安装版（推荐）**：安装后可在应用内一键自动更新，以后无需再手动下载 |
| Windows | `ClauseEye-0.4.0-win-x64-portable.exe` | 单文件便携版，双击直接运行；免安装版不能自我更新，新版本会提示你到 Releases 下载 |
| Windows | `ClauseEye-green-win-x64.zip` | 绿色版目录，解压后双击 `ClauseEye.exe`。若单文件版被 Windows 11「智能应用控制」拦截，请改用这个 |
| macOS | `ClauseEye-0.4.0-mac-arm64.dmg` | Apple 芯片（M 系列）安装包；另附同架构 `.zip`（自动更新元数据载体） |
| macOS | `ClauseEye-0.4.0-mac-x64.dmg` | Intel 芯片安装包 |
| Linux | `ClauseEye-0.4.0-linux-x64.AppImage` | 免安装单文件：`chmod +x ClauseEye-*.AppImage` 后直接运行；支持应用内自动更新 |
| Linux | `ClauseEye-0.4.0-linux-x64.deb` | Debian / Ubuntu 安装包：`sudo dpkg -i ClauseEye-*.deb` |

当前版本 **0.4.0**（新增 macOS / Linux 打包：dmg + AppImage + deb；Windows 产物与之前一致）。

数据默认存放在本机用户目录（Windows `%APPDATA%\ClauseEye\`、macOS `~/Library/Application Support/ClauseEye`、Linux `~/.config/ClauseEye`），全部本地加密。

装好之后不用再管更新：**Windows 安装版与 Linux AppImage**启动 20 秒后会自动检查新版本，发现更新会在应用顶部弹出横幅，点一下就能下载并重启安装；也可以随时在「设置 → 软件更新」里手动检查。**便携版 / 绿色版 / macOS 版**无法自我替换文件，会弹系统通知提示你到本页下载新版本。

**macOS 首次打开**：当前构建未做 Apple 开发者签名与公证，系统会提示「无法验证开发者」。在「访达」里**右键点图标 → 打开**（或执行 `xattr -dr com.apple.quarantine /Applications/ClauseEye.app`）即可运行。因为未签名，macOS 版只提示下载新版本，不做自动替换；将来接入 Apple Developer ID 签名与公证后可升级为自动更新。

### 方式二：从源码运行

```bash
npm install          # 首次安装依赖
npm run tessdata     # 下载离线 OCR 语言包（约 6.5 MB，只需一次）
npm run dev          # 浏览器打开 http://localhost:5173
npm run electron     # 或在 Electron 桌面壳中运行
npm test             # 核心逻辑单测
npm run benchmark    # 规则库评测基准（召回 / 误报 / 引用可定位率）
```

首次打开会要求创建「保险箱」：

- 设置口令 → 口令经 PBKDF2（250k 次）派生密钥，主密钥被口令包裹后存储；
- 或选择「无口令模式」→ 主密钥交给**系统钥匙串**（Windows DPAPI / macOS 钥匙串）加密保管。

想立刻看到效果，点「载入示例文档」即可一键导入 6 份虚构示例（劳动合同 / 租房 / 两份 Offer / 离职证明 / 工伤鉴定）。

## 功能实现状态

| # | 功能 | 状态 | 实现说明 |
|---|---|---|---|
| 1 | 文档导入 | ✅ V1 | PDF（pdfjs 文字层）、DOCX、TXT/MD/CSV/JSON（UTF-8/GBK 自动回退）、粘贴文本；**图片与扫描版 PDF 走本地 OCR** |
| 2 | 自动分类 | ✅ | 关键词加权打分 → 8 类场景 + 兜底「其他」，输出置信度与命中依据，可手动纠正并重跑规则 |
| 3 | 本地加密存储 | ✅ V1 | IndexedDB + WebCrypto AES-GCM；主密钥可由系统钥匙串（safeStorage）保护 |
| 4 | 坑点清单 | ✅ V1 | **150 条规则**，输出「高/中/低 + 原文引用 + 通俗解释 + 修订建议 + 法条依据」，支持确认/标记误报 |
| 5 | 多 Offer 对比 | ✅ | 15 个字段结构化抽取 → 对比矩阵（自动高亮最优/最差）+ 启发式评分排名 + 本地简评 |
| 6 | 关键日期提醒 | ✅ V1 | 本地规则抽取关键日期 → 提前 N 天 / 到期 / 逾期各提醒一次，系统通知点击跳转 |
| 7 | 离线 OCR | ✅ V1 | tesseract.js（WASM，主进程运行）+ 随包分发的中文/英文语言包，单页平均 0.5～2 秒 |
| 8 | 应用更新 | ✅ V1 | 安装版走 electron-updater 自动更新（检查 → 下载 → 重启安装）；便携版提示到发布页下载；启动后自动检查可关闭 |
| 9 | 设置页 | ✅ V1 | BYOK 配置与连通性自检、离线模式、通知与提前天数、钥匙串开关、口令开关、更新检查、备份导出、一键清空 |

## 隐私是如何落地的

| 设计承诺 | 代码位置 | 说明 |
|---|---|---|
| 零上报 | 全仓库 | 没有任何 `fetch` 指向自有服务；`grep fetch` 只会在 `src/llm/byok.ts` 命中 |
| 离线模式 | `src/llm/byok.ts` | 默认开启，开启后 BYOK 请求直接抛 `OfflineModeError`，可断网使用 |
| 离线 OCR | `electron/ocr.cjs` | 语言包随包分发，识别在本机 WASM 引擎完成，**不访问任何 CDN** |
| 本地加密 | `src/storage/crypto.ts`、`src/storage/vault.ts` | PBKDF2-SHA256(250k) 派生子密钥包裹随机主密钥，AES-GCM-256 加密每条记录 |
| 密钥不出本机 | `src/storage/vault.ts`、`electron/main.cjs` | BYOK 密钥是加密记录；无口令模式的主密钥经 safeStorage（DPAPI）后再落盘；导出备份剔除密钥 |
| 引用可验证 | `src/core/analyze.ts` | BYOK 返回的每条风险必须能在原文中逐字定位，否则以「疑似幻觉」丢弃 |
| 通知不泄密 | `src/core/reminders.ts` | 通知正文只包含文档标题与日期，不含正文片段 |
| 更新不采集 | `electron/updater.cjs` | 检查更新只读取 GitHub 发布页的版本号与说明；除这一项外应用不会主动联网（可在设置里关闭） |

> 没有后端进程，也就没有"数据上传"这条路径。桌面壳用自定义 `app://` 协议承载前端产物（不用本地 HTTP 端口），因此 IndexedDB 的源固定、数据不会因端口变化而"丢失"。

## 内置规则库（150 条）

| 规则包 | 条数 | 覆盖场景（节选） |
|---|---|---|
| `labor` 劳动合同 | 25 | 试用期超上限（按合同期限分级）、试用期不缴社保、放弃社保/加班费/年休假、违约金与罚款、单方解除、竞业超 2 年或无补偿、工资已含加班费、押金扣证、服务期违约金依据不明、不定时工时 |
| `rent` 租房 | 25 | 押金不退/可任意扣除、自动续租、单方涨租、房东随时进入、提前收回、维修全归租客、强制清洁费、中介费转嫁、禁止换锁、居住人限制、复利滞纳金、放弃优先购买权、交接无清单 |
| `offer` Offer | 22 | 可单方撤销、附条件生效、薪资打包加班费、薪资未给数字、试用期偏长或未明确、期权描述模糊/无归属/离职回购、违约金与服务期绑定、竞业无补偿、年终奖酌情发放、社保按最低基数、关键条款推给劳动合同 |
| `nda` 保密协议 | 16 | 保密期限无上限、单向高额违约、范围过宽、未约定返还销毁、披露方可单方变更、知识产权概括转让、禁止招揽过宽、无依法披露例外、放弃署名权、境外管辖 |
| `service` 服务协议 | 18 | 付款周期过长/挂钩验收、成果知识产权全归对方、无限次修改、单向违约、质保金偏高、"合作"实为用工、全额预付、验收视为通过、仅委托方可无责终止、禁止展示作品 |
| `resignation` 离职证明 | 13 | "双方再无争议"、负面评价、原因被写成"个人原因"、法定要素缺失、工作起止日期/岗位缺失、以交接为条件扣押证明、未载明经济补偿、未盖章 |
| `injury` 工伤鉴定 | 13 | 未载明伤残等级/自理障碍等级、一次性了结、未提示 15 日再次鉴定期限、结论含糊、缺机构或日期、停工留薪期缺失、赔偿责任主体不明 |
| `common` 通用 | 18 | 自动续约、管辖不利、无限连带责任、空白占位符、单方变更、免责条款、强制仲裁、预先放弃抗辩、送达视为条款、不可抗力缩小、禁止公开评价、违约金不设上限、最终解释权归一方 |

规则全部是**可解释的关键词/数值判定**，不调用模型；每条命中都带原文引用与法条依据，且**引用必须是原文精确子串**（有单测锁死）。规则版本号随分析结果一起存档（当前 `0.2.0-v1`）。

改动规则后可跑评测基准确认没有退化：

```bash
npm run benchmark
```

## 目录结构

```
src/
├─ core/            纯逻辑（无 UI / 无浏览器依赖，可单测）
│  ├─ classify.ts     自动分类器
│  ├─ rules/          规则引擎 + 8 个场景包（种子包 + v1 扩充包）
│  ├─ eval/           规则库评测基准与用例集
│  ├─ reminders.ts    关键日期 → 通知计划（纯函数）
│  ├─ analyze.ts      分析管线 + BYOK 结果合并（防幻觉）
│  ├─ offer.ts        Offer 结构化抽取与对比
│  ├─ dates.ts        关键日期抽取
│  └─ text.ts         中文数字/金额/期限/日期解析、条款切分
├─ ingest/          PDF / DOCX / 文本 → 纯文本；ocr.ts 负责光栅化 + 本地 OCR
├─ desktop/         Electron 能力桥接（提醒 / 钥匙串 / OCR）+ 提醒调度
├─ storage/         crypto(AES-GCM) / db(IndexedDB) / vault(本地保险箱)
├─ llm/byok.ts      OpenAI 兼容接口客户端（受离线模式拦截）
├─ state/store.tsx  React 状态与动作
└─ ui/              页面与组件（保险箱 / 文档详情 / Offer 对比 / 提醒 / 设置）

electron/           桌面壳（主进程 + preload + 本地 OCR 引擎）
scripts/            打包、绿色版、图标、OCR 语言包下载
samples/            6 份虚构示例文档（同时被单测与评测基准用作回归样本）
```

## 测试与自检

```bash
npm test              # 62 项单测：文本解析、分类、规则命中、引用可定位、Offer 对比、防幻觉、提醒计划
npm run benchmark     # 评测基准：召回率 / 误报数 / 引用可定位率
npm run electron:smoke  # 桌面壳冒烟自检：页面渲染、IndexedDB、资源加载、Worker、preload 桥、OCR 端到端
```

回归保护重点：**所有命中引用必须能在原文中精确定位**、日期不得被误读为期限、通用规则不与场景规则重复报告、评测基准不得出现漏报与误报。

## 文档索引

| 文件 | 内容 |
|---|---|
| `docs/产品方案_PRD.md` | 产品定位、目标用户、功能清单、商业模式、竞品、路线图 |
| `docs/设计文档.md` | 总体架构、技术选型、数据模型、坑点引擎、多 Offer 对比、隐私与安全设计、实现状态 |
| `docs/MVP实现说明.md` | MVP（v0.1.0）的实现范围、关键决策与差异说明 |
| `docs/V1实现说明.md` | V1（v0.2.0）的增量：规则库、评测基准、系统提醒、离线 OCR、系统钥匙串、自动更新、打包发布 |

## 技术底座（开源轮子）

- **pdfjs-dist / jszip** — 本地解析 PDF 文字层与 DOCX
- **tesseract.js + tessdata_fast** — 离线 OCR（WASM，无需原生编译）
- **Electron safeStorage** — 借操作系统钥匙串保护主密钥
- **OpenContracts**（MIT，可自托管）— 条款抽取 / 标注 / 版本对比 / RAG 底座（后续演进参考）

## 发布流程（维护者）

```bash
git push origin main
git tag v0.4.0 && git push origin v0.4.0   # 打 tag 即自动触发构建与发布
```

`.github/workflows/release.yml` 在 tag 推送后自动完成：

1. **三个平台并行构建**（`windows-latest` / `macos-latest` / `ubuntu-latest`），每个平台各自跑类型检查 + 单测，再打包自己的产物；
2. **汇总到一个发布 job**：把三份产物合并后去重、上传 `setup.exe` / `portable.exe` / `dmg` / `AppImage` / `deb` / `latest*.yml` / `*.blockmap`，创建或更新 Release 并写入发布说明（同时清理同一 tag 上重复的 Release 条目）；
3. **产物校验**：分平台检查产物是否存在，缺平台会在日志里给出 `::warning::`，Windows 一个 exe 都没有则整次失败。

手动触发（Actions → Build & Release → Run workflow）只构建、不发布，用来验证多平台链路。

发布完成后已安装用户**无需任何操作**：Windows 安装版与 Linux AppImage 下次启动或手动检查发现版本变化即可一键自动更新；便携版、绿色版与 macOS 版会收到「有新版本」的系统通知与下载页提示。

## 状态

✅ **V1 已完成**：150 条规则库 + 评测基准 + 系统级到期提醒 + 离线 OCR + 系统钥匙串 + Windows 安装版/便携版 + 自动更新。

下一步（v2）：多人协作复核、条款库云端增量更新（可选订阅）、私有同步。
