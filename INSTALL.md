# 安装 / 卸载（macOS · Windows 通用）

包名 `dsh-plugin-ui-tweak`（v0.2.0）。插件只改样式：宿主侧是一个空壳行 + 浏览器侧的 CSS 与设置行，
不碰数据、不发网络请求、不改 DSH 自己的文件。

> **装完必须完全退出 DSH 再打开**（宿主侧要重读 profile；只按 ⌘R / F5 刷新页面不够）。

profile 目录：

| 平台 | profile 目录 |
| --- | --- |
| Windows | `C:\Users\<你的用户名>\.dsh\profiles\desktop` |
| macOS | `/Users/<你的用户名>/.dsh/profiles/desktop` |

---

## 方法 1：解压即装（不需要命令行、不需要网络）★ Windows 最省事

1. 把 `dsh-plugin-ui-tweak` **整个文件夹**放进 profile 的 `node_modules` 里，文件夹名保持
   `dsh-plugin-ui-tweak`（必须和包名一致）：

   ```
   C:\Users\<你>\.dsh\profiles\desktop\node_modules\dsh-plugin-ui-tweak\
   ```

2. 打开**上一层**的 `package.json`（`...\.dsh\profiles\desktop\package.json`），在
   **`dsh.profile.bundles`** 数组里加一行包名 —— **这一行就是"启用"**：

   ```json
   {
     "name": "dsh-profile-desktop",
     "private": true,
     "dependencies": { "...": "（原有内容保持不动）" },
     "dsh": {
       "profile": {
         "bundles": [
           "@deepseek-ai/dsh-base",
           "@deepseek-ai/dsh-web-app",
           "dsh-plugin-ui-tweak"
         ]
       }
     }
   }
   ```

   原有的其它内容（别的依赖、别的 bundles、别的字段）**保持不动**，只多一行。
   `dependencies` 那一行**不用写**：DSH 是按 `bundles` + `node_modules` 里的实际目录来加载的，
   写一个指向 `node_modules` 自己的 `file:` 依赖反而会让 pnpm 之后犯迷糊。

3. 完全退出 DSH（Windows 记得把托盘里的图标也退掉），重新打开。

> **注意**：方法 1 是"绕过包管理器"的装法。以后如果你又执行了 `dsh plugin add/remove`
> 之类的操作，pnpm 可能把手工放进 `node_modules` 的这个目录当"多余的包"清掉 ——
> 重新解压放一次即可；想长期用就走方法 2。

## 方法 2：一条命令（任何装了 DSH 的机器）

DSH 自带 CLI；Desktop 版的 CLI 由应用自己的运行时托管，`--profile desktop` 是被允许的（官方入口）：

```sh
# 从 GitHub 装（任何机器同一条命令；仓库为公开仓库时无需登录）
dsh plugin --profile desktop add github:<你的GitHub用户名>/dsh-plugin-ui-tweak

# 或从本地文件夹装
dsh plugin --profile desktop add link:/绝对/路径/dsh-plugin-ui-tweak
```

CLI 位置：

- macOS：`/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`
- Windows：`<DSH 安装目录>\resources\runtime\cli\bin\` 下的 `dsh`（安装器通常会加进 PATH；
  找不到就用方法 1，效果完全一样）

## 方法 3：应用内安装

DSH 桌面版 **设置 → 插件 → 安装**，把方法 2 里的 spec（`github:...` 或本地绝对路径）粘进去即可。

---

## 怎么确认装上了

1. **设置 → 通用** 往下滚，会多出这几行：
   背景透明度 / 面板透明度 / 模糊强度 / **放大态底色** / 界面缩放 / 恢复默认。
2. 打开右侧面板 → 点右上角放大：
   - 面板是一整块**实心**底（出厂「放大态底色」= 100%），背后对话看不到；
   - 底部那个输入框会被面板**盖住、点不动**（DSH 原生层数：面板 z-index 10/40 > 输入框 7）。
3. 想跑自检（可选，需要 node）：`node test/client.test.mjs` → `34/34 passed`。

## 卸载

1. 删掉 profile 的 `node_modules/dsh-plugin-ui-tweak`；
2. 把 `package.json` 里 `dsh.profile.bundles` 中加过的那一行去掉；
3. 完全退出 DSH 再打开。

用方法 2 装的可以直接：`dsh plugin --profile desktop remove dsh-plugin-ui-tweak`。

插件**不留残留**：样式只写在两张 `<style data-plugin="dsh-plugin-ui-tweak">` 标签里，
设置存在浏览器 localStorage 的 `dsh-plugin-ui-tweak` 键下，卸载后都不再生效。

---

## 平台差异

| | macOS | Windows |
| --- | --- | --- |
| 主窗口背景 | 系统级 vibrancy（毛玻璃），网页层去不掉 —— 「背景透明度 0 + 模糊 0 却仍有点糊」就是这个 | 窗口不透明，「背景透明度」透出的是框架底色而不是桌面 |
| 放大态面板宽度 | 整窗 `100vw` | `100vw` 减去左侧栏宽度（DSH 自己加了 `max-width`）；插件底色跟着面板实际盒子走，所以同样正确 |
| 标题栏 / 圆角 / 拖拽区 | `html[data-platform=darwin]` | `html[data-windows-titlebar]` |

插件本身**没有任何平台分支**：只用 DSH 自己的 `data-*` 钩子（`data-sidebar-right-panel`、
`data-sidebar-right-open`、`data-dockkit-pane`、`data-dockkit-empty`、`data-sidebar-terminal`、
`data-ds-dark-theme`）和设计 token，所以两个平台是同一份代码。

## 想在别的机器上也一条命令装：把仓库推到 GitHub（做一次就够）

```sh
cd /Users/yookio/Desktop/repo/dsh-plugin-ui-tweak
git remote add origin https://github.com/Yookio-Z/dsh-plugin-ui-tweak.git
git push -u origin main
```

先在 GitHub 网页上建一个**公开**空仓库，名字 `dsh-plugin-ui-tweak`（公开仓库别的机器才能免登录安装）。
推完之后，任何一台装了 DSH 的机器都能用方法 2 的第一条命令装。
