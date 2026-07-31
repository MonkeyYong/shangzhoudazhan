// 把 codes/layouts/*.json 硬编码进 codes/商周大战.html 源码
// 用法：node update-layouts.cjs
//     读 4 个 JSON → 写到 codes/商周大战.html 的 </head> 之前（新建 <script>window.__DEFAULT_LAYOUTS__ = {...}</script>）
//     旧的嵌入块（__EMBEDDED_LAYOUTS__ / __EMBEDDED_LAYOUTS_BUILD__）同步移除（已统一为源码硬编码）
const fs = require("fs");
const path = require("path");
const root = __dirname;

// 1. 读 4 个 JSON 布局
const LAYOUT_KEYS = ["small", "battle", "final", "custom"];
const embedded = {};
for (const key of LAYOUT_KEYS) {
  const file = path.join(root, "codes", "layouts", key + ".json");
  try {
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(json.layout)) embedded[key] = json.layout;
  } catch (e) {
    console.warn("[update] " + key + ".json 跳过: " + e.message);
  }
}

// 2. 构造新的源码注入块
const buildTime = new Date().toISOString();
const injectBlock =
  '<script>\n' +
  '/* 默认布局（从 codes/layouts/*.json 嵌入）；可被游戏内"摆子"模式修改并保存为 JSON。 */\n' +
  'window.__DEFAULT_LAYOUTS__ = ' + JSON.stringify(embedded) + ';\n' +
  'window.__DEFAULT_LAYOUTS_BUILD__ = "' + buildTime + '";\n' +
  '</script>\n';

// 3. 读源 HTML
const srcFile = path.join(root, "codes", "商周大战.html");
let html = fs.readFileSync(srcFile, "utf8");

// 4. 移除任何旧的嵌入块（__EMBEDDED_LAYOUTS__ / __EMBEDDED_LAYOUTS_BUILD__ / Cache-Control / expires meta）
// 旧的 inject 块开头是 '<script>/* 默认布局'，结尾是 '</script>\n'
const oldInjectStart = html.indexOf('<script>\n/* 默认布局');
if (oldInjectStart !== -1) {
  const oldInjectEnd = html.indexOf('</script>\n', oldInjectStart) + '</script>\n'.length;
  html = html.slice(0, oldInjectStart) + html.slice(oldInjectEnd);
}
// 旧的 no-cache meta 是从 embedding 引入的，现在不需要，源码改即刷新
html = html.replace(/<meta http-equiv="Cache-Control" content="no-cache[^>]*>\n?/g, '');
html = html.replace(/<meta http-equiv="Pragma" content="no-cache[^>]*>\n?/g, '');
html = html.replace(/<meta http-equiv="Expires" content="0">\n?/g, '');

// 5. 注入到 </head> 之前
if (html.indexOf("</head>") === -1) {
  throw new Error("源 HTML 没有 </head> 标记，无法注入");
}
html = html.replace("</head>", injectBlock + "</head>");

// 6. 写回源文件
fs.writeFileSync(srcFile, html, "utf8");

// 7. 同步复制源到 index.html（保持 sync 节奏）
const dstFile = path.join(root, "index.html");
fs.writeFileSync(dstFile, html, "utf8");

const counts = Object.entries(embedded).map(([k, v]) => k + ": " + v.length + " 枚");
console.log("[update] build time: " + buildTime);
console.log("[update] Layouts embedded into codes/商周大战.html (" + counts.join(", ") + ")");
console.log("[update] Synced to index.html");
