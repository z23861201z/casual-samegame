# 消灭同色方块 · Casual SameGame

公测级 HTML5 SameGame。本游戏位于合集仓库的 `games/samegame/`。

## 本地打开

在**仓库根目录**启动静态服务（推荐）：

```bash
cd casual-samegame
python3 -m http.server 8080
# 打开 http://localhost:8080/games/samegame/
# 或经门户 http://localhost:8080/
```

也可在本目录下：

```bash
python3 -m http.server 8080
# http://localhost:8080/
```

关卡数据已内嵌到 `index.html`，多数情况下亦可直接打开本目录 `index.html`。

## 玩法摘要

点击 ≥2 个四向同色连通块消除；重力下落、列左压缩；连击与目标分通关。共 12 关。

## 自测

```bash
node tests/core-test.js
```

详见 `SELFTEST.md`。
