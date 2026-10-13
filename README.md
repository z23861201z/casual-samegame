# 消灭同色方块 · Casual SameGame

公测级 HTML5 SameGame 消除小游戏：四向同色连通消除、重力下落、列左压缩、连击倍率、粒子爆炸、震屏、飘分与 Web Audio 合成音效。

**纯静态 · 零构建 · 打开即玩**

## 玩法

1. 点击 **≥2** 个上下左右相连的**同色**方块消除（不含对角）
2. 消除后其余方块**下落**，空列向**左**压缩
3. 得分：`(消除数 − 2)² × 连击倍率`；全盘清空有额外奖励
4. 3 秒内连续消除提升连击（最高 ×3）
5. 灰色**石块**不可消除；达到**目标分**通关（注意步数）

## 操作

| 输入 | 作用 |
|------|------|
| 鼠标移动 / 触摸滑动 | 预览可消除区域 |
| 单击 / 点按 | 消除预览区域 |
| HUD 暂停 | 重开 / 回选关 / 主菜单 |

共 **12** 关：教学 1–3、中等 4–7、高难 8–12。通关解锁下一关（进度存 `localStorage`）。

## 本地打开

### 方式 A：直接打开（推荐）

关卡数据已内嵌到 `index.html`，可双击打开：

```bash
# macOS
open index.html
# Linux
xdg-open index.html
```

### 方式 B：本地静态服务器

```bash
cd casual-samegame
python3 -m http.server 8080
# 浏览器访问 http://localhost:8080
```

或：`npx --yes serve .`

## 静态部署

将整个目录上传到任意静态托管即可，例如：

- GitHub Pages
- Netlify / Cloudflare Pages / Vercel（静态）
- Nginx / Caddy 根目录指向本文件夹

无需 Node 构建步骤。

## 目录结构

```
casual-samegame/
  index.html          # 入口（内嵌 levels 兜底）
  css/style.css
  data/levels.json
  js/core.js          # 纯逻辑
  js/render.js        # Canvas / Tween / 震屏 / 飘分
  js/particles.js
  js/audio.js         # Web Audio 合成
  js/ui.js
  js/game.js
  tests/core-test.js  # node 逻辑单测
  SELFTEST.md
  README.md
```

## 自测

```bash
node tests/core-test.js
```

## 技术要点

- 逻辑与渲染分离；`removeAt` 返回 `removed / moved / shifted` 差分驱动动画
- 计分对齐经典 `(n-2)²` + 连击层
- 无第三方依赖

## 许可

本项目代码以 MIT 许可发布。参考实现思路来自开源 SameGame 引擎与教程（见仓库外调研文档），未复制 GPL 代码。
