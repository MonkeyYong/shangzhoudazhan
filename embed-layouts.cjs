// 构建脚本：把 codes/layouts/*.json 嵌入 index.html，消除 file:// 协议下 fetch 被拦截的问题
// 用法：node embed-layouts.cjs
//     从 codes/商周大战.html（源）→ index.html（嵌有布局数据的发行版）
const fs = require("fs");
const path = require("path");
const root = __dirname;

// 1. 读 4 个 JSON 布局文件
const LAYOUT_KEYS = ["small", "battle", "final", "custom"];
const embedded = {};
for (const key of LAYOUT_KEYS) {
  const file = path.join(root, "codes", "layouts", key + ".json");
  try {
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(json.layout)) {
      embedded[key] = json.layout;
    }
  } catch (e) {
    // 文件不存在或格式错误 → 该档位留空，由游戏代码走 validateLoadedLayout → null → PRESETS 兜底
    console.warn("[embed] " + key + ".json 跳过: " + e.message);
  }
}

// 2. 生成嵌入片段
const embedCode = "<script>window.__EMBEDDED_LAYOUTS__ = " + JSON.stringify(embedded) + ";</script>\n";

// 3. 从源 HTML 注入到发行版
const src = path.join(root, "codes", "商周大战.html");
let html = fs.readFileSync(src, "utf8");

// 注入到第一个 <script> 前，确保嵌入式数据在游戏脚本执行前就位
html = html.replace("<script>", embedCode + "<script>");

const dst = path.join(root, "index.html");
fs.writeFileSync(dst, html, "utf8");

const counts = Object.entries(embedded).map(([k, v]) => k + ": " + v.length + " 枚");
console.log("[embed] Layouts embedded into index.html (" + counts.join(", ") + ")");
