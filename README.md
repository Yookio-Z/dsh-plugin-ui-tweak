# dsh-plugin-ui-tweak

一个**只改样式**的 DSH 插件：半透明 + 背景模糊（毛玻璃）+ 整体缩放。
纯 JS，**不需要编译**；设置里有图形界面，点一下就即时生效。

> **v0.2 修复**：点右上角放大按钮后，右侧面板会铺满整个窗口，而它的底色取自
> `--dsw-alias-bg-base` —— 那正是「背景透明度」调低的那个 token，于是放大后的面板
> 变成一块半透明玻璃，背后对话的正文直接透上来，字叠字没法读。
> 现在放大态有**自己的实心底色**（新设置行「放大态底色」，出厂 100%）。
> 同时修掉了一处让 DSH 起不来的崩溃（见下面「为什么上一版会把 DSH 拖垮」）。

## 在哪调

**设置 → 通用**，往下滚，会看到这几行（带加减步进器，鼠标悬停在数字上出现上下箭头）：

| 设置行 | 出厂值 | 说明 |
| --- | --- | --- |
| 背景透明度 | `100%` | 降到 100% 以下主背景半透明；插件会**同时**清掉页面那层不透明底色，窗口后面若有毛玻璃/桌面就能透出来。**下限 0%**（0% = 底色完全透明，只剩模糊）。 |
| 面板透明度 | `100%` | 卡片、侧栏、浮层的不透明度。下限 60%（再低会明显影响阅读）。 |
| 模糊强度 | `24 px` | `0` = CSS 侧一点都不糊（`0 / 8 / 16 / 24 / 32 / 40 / 48 px`）。它驱动：① 整个页面（`body` 的 `backdrop-filter`）；② `--dsw-mask-blur`（设置面板/弹窗背后）；③ `--dsw-menu-backdrop-filter`（菜单/浮层，出厂固定 40px，也收归这个旋钮）；④ 右侧栏面板盖住的那段对话。 |
| **放大态底色** | `100%` | **本次修复加的旋钮。** 点右上角放大按钮后，右侧面板会铺满整个窗口 —— 这一项决定它自己的底色有多实。100% = 实心（默认，背后的正文一个字都看不到）；调低会让背后的对话透上来，下限 60%。调到 100% 以下时插件会自动给放大态补上至少 `max(模糊强度, 32px)` 的模糊兜底。 |
| 界面缩放 | `100%` | 整个界面（含文字与间距）的缩放，`100%` = 不缩放。 |
| 恢复默认 | — | 上面五项一键还原。 |

> 主背景的**底色亮度**曾经是一行设置（0–3 档），现已去掉：内部固定用 1 档
> （比 DSH 原生的 `#151517` 略灰一点，面板/侧栏按同档取色）。要恢复那一行，
> 把它加回 `lib/client.js` 的 `SPECS` 即可。
> **会话字号也不再由本插件接管** —— 用 DSH 自带的「字号大小」设置就好。

改动**即时生效并自动保存**，刷新或重启都还在（存在浏览器 localStorage，和 DSH 自己的客户端本地设置同一个存法）。

## 装 / 卸

**完整的安装步骤看 [INSTALL.md](./INSTALL.md)**（macOS / Windows 三种装法，含解压即装、一条命令、
应用内安装，以及卸载和验证）。这里只留要点：

```sh
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"

# 装（本地目录用 link: 装，改代码立即生效，不用重装）
"$DSH" plugin --profile desktop add link:/Users/yookio/Desktop/repo/dsh-plugin-ui-tweak

# 卸
"$DSH" plugin --profile desktop remove dsh-plugin-ui-tweak
```

装完**完全退出 DSH 再打开**（宿主侧要重读 profile）。

`dsh plugin add` 会做两件事，**缺一不可**：

1. 把包写进 `<profile>/package.json` 的 `dependencies`（link: 装 = 软链）；
2. 把包名写进同一个文件的 **`dsh.profile.bundles`** —— 这一条才是「启用」。
   插件自己的 `cordis.patch.yml`（`insert` 一个宿主行）只有在包被激活后才会被应用。

> **踩过的坑**：上一次 DSH 起不来时用了「默认启动」，profile 被还原成出厂状态 ——
> `dsh.profile.bundles` 里本插件的那一项没了，于是 `dependencies` 还挂着、
> `node_modules` 里软链还在，但**插件根本不加载**。重装一遍（或手动把包名加回
> `dsh.profile.bundles`）即可。

插件目录被删掉/挪走之前记得先卸，否则 profile 里会留一个指向空路径的软链。

## 它到底改了什么

界面颜色全部走 DSH 设计系统的 CSS 变量。插件注入两张 `<style>`：

- `dsh-plugin-ui-tweak/rows.css` —— 设置行的样式（抄内置「字号大小」那一行，外观同原生）；
- `dsh-plugin-ui-tweak/effect.css` —— 由当前取值即时生成，含 token 覆盖、放大态底色、毛玻璃、终端透底。

覆盖 4 个 surface token：

```
--dsw-alias-bg-base            应用主背景（也是放大态面板的原生底色）
--dsw-alias-bg-layer-1         一级抬起面（卡片、面板）
--dsw-alias-bg-layer-2         二级嵌套面
--dsw-specific-sidebar-fill    侧栏列与标题行
```

配色不是随便挑的：全部取自 DSH 设计系统自带的 **neutral-bluish 19 级色阶**
（`#f9fafb` → `#151517` → `#0f1115`），所以调出来仍在同一套设计语言里。

### 放大态的背景（这次修复的核心）

放大后的 DOM 结构（源码 `dsh-client-ui-sidebar-right` + `dsh-client-ui-dockkit`）：

```
.overlayLayer (z-index:20)
  └ div[data-sidebar-right-panel=fullscreen][data-sidebar-right-open]   ← 放大时 width:100vw
      └ div[data-dockkit-host=dock]
          └ section[data-dockkit-pane]
              background: var(--dsw-alias-bg-base)   ← 面板真正可见的底色
```

也就是说：放大后「面板」盖住的是**整窗**，而它的底色就是 `--dsw-alias-bg-base`。
「背景透明度」一调低，这个 token 变半透明，铺满全窗的面板就跟着变玻璃 —— 背后
`.centerCol` 里的对话正文透上来，这就是那个「放大后能看到正文」的现象。

修法（`effectCss()` 里那一条）：

```css
[data-sidebar-right-panel=fullscreen][data-sidebar-right-open]{
  --dsw-alias-bg-base: var(--dsh-ui-tweak-fs-fill);   /* 面板内的 pane / 空面板跟着变实心 */
  background-color: var(--dsh-ui-tweak-fs-fill);      /* 面板盖住整窗，缝隙也一并盖住 */
}
```

- 颜色来自插件自己的 `--dsh-ui-tweak-fs-fill`（浅/深两套，由「放大态底色」+「亮度档」算出），**不写死颜色**；
- **必须带 `[data-sidebar-right-open]`**：面板收起时它仍然是 `width:100vw` 的绝对定位元素
  （只是子节点 `visibility:hidden` + 移出屏幕），少了这个限定就会拿一块不透明的板子盖死整个界面；
- Windows 上放大态有 `max-width: calc(100vw - 侧栏宽)`，面板只占右侧 —— 背景跟着面板的实际盒子走，所以两个平台都对。

### 同理：毛玻璃不能挂在面板上（「放大后输入框还能打字」的根因）

`backdrop-filter`（以及 `transform` / `filter` / `isolation`）会给元素同时加上两顶帽子：
**层叠上下文** 和 **fixed 后代的包含块**。挂在 `[data-sidebar-right-panel]` 上会真的弄坏界面：

| 症状 | 机制 |
| --- | --- |
| 放大后底部的输入框浮在面板上面、还能打字 | 对话的输入框 `dsh-client-ui-conversation` 的 `.composerSeat` 是 `position:sticky; z-index:7`；dockkit 的 pane 单元格是 `z-index: var(--dsh-dockkit-dock-layer,10)`，而 DSH 在放大态把 `--dsh-dockkit-dock-layer` 抬到 **40** —— 本该压在输入框上面。面板一旦变成层叠上下文，这个 40 就被关进面板内部，整块面板降级成一个 `z-index:auto` 的整体，于是输入框（7）反超了 pane（40）。 |
| 面板里的浮窗位置整体偏移 | dockkit 的浮窗 `[data-dockkit-float]` 和文档预览浮层都是 `position:fixed`，用视口坐标定位（`getBoundingClientRect()`）。面板成了包含块之后，这些坐标就变成相对面板的 —— push 态面板不在视口原点，浮窗直接偏出去。 |

所以毛玻璃只加在**本来就是那层玻璃**的 pane 上，而且用 DSH 自己菜单面板同款的
`::before` + `z-index:-1` 写法（`._panel{isolation:isolate}` + `._panel:before{backdrop-filter:…}`），
故意**不**直接给 pane 加 `backdrop-filter`——那会让 pane 变成 fixed 后代的包含块，浮窗照样偏：

```css
/* 宿主：把 pane 变成自己的层叠上下文（不动包含块语义） */
[data-sidebar-right-panel] [data-dockkit-pane],
[data-sidebar-right-panel] [data-dockkit-empty]{isolation:isolate;position:relative}

/* 玻璃：贴在 pane 内部最底下，糊的是它背后的对话 */
[data-sidebar-right-panel] [data-dockkit-pane]::before,
[data-sidebar-right-panel] [data-dockkit-empty]::before{
  content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;
  backdrop-filter:blur(Npx);
}
```

面板元素上因此只剩 `background-color` 和自定义属性 —— 两者都不产生层叠上下文，
pane 的 `z-index:10/40` 照旧作用在根层叠上下文里。**放大后输入框会被面板正常盖住，
点不到也打不了字**（这就是 DSH 原生行为；如果你的界面里它还能打字，说明这条红线被破坏了，
`node test/client.test.mjs` 里有两条断言专门守它）。

### 另外三个坑（都不是配置问题，是机制问题）

**① 侧栏终端不跟着变。** 终端是 xterm.js，用的是 **DOM 渲染器**：它自己在
`.xterm-viewport` 和**每一行**（`.xterm-rows > div`）上刷不透明的底色
（它只吃得到不透明色，源码注释就是 `resolved opaque DSH background`），
盖住了容器（`.screen`）上那层 `--dsw-alias-bg-base`。所以光改 token 是没用的 ——
看起来就像"没生效"。修法：把这几层**容器/整行**打成 `background-color: transparent !important`，
露出容器的半透明底。只动容器和整行：应用自己画的单元格底色（`ls` 配色、vim 高亮）
在 `span` 上，不受影响；光标 `.xterm-cursor` 也不在名单里。

**② 调低透明度会看不清。** DSH 自带一个 `--dsw-mask-blur` token，默认值是 `none`，
而设置面板/弹窗的 `backdrop-filter: var(--dsw-mask-blur)` 就读它 ——
等于官方留了一个毛玻璃开关但默认关着。修法：半透明时把它打开，
另外再给 `body` 加一层 `backdrop-filter`，让窗口后面那层（桌面/毛玻璃）同样糊掉。

**③ 模糊必须真的加到「正在透的那层」上。** `body` 的 `backdrop-filter` 只糊窗口**后面**
那层（桌面）；`--dsw-mask-blur` 只糊弹窗**背后**那层。而右侧栏面板是
`position:absolute; right:0; pointer-events:none` **悬在对话上方**的，它身后那段对话
没有任何东西去糊它 —— 所以只改 token 时，模糊拉多大都看不见。
修法：给**面板里那层真正半透明的 pane**（`[data-dockkit-pane]` / `[data-dockkit-empty]`）
的 `::before` 加 `backdrop-filter`（细节与两条红线见上面「毛玻璃不能挂在面板上」）。

> 这里刻意**不做任何 DOM 扫描**：面板那一支是 `pointer-events:none`，
> 而 `elementsFromPoint` 走的是**命中测试**，永远返回不到它。只用结构选择器，
> 确定性强、也不受命中测试影响。

### 想扩到更多地方

`dsh-client-ui-theme` 官方开放的 token 一共 14 个，其余 10 个是：

```
--dsw-alias-bg-overlay            浮层 / 弹窗背景
--dsw-alias-border-l1 / -l2       一级 / 二级边框
--dsw-alias-label-primary         主文字色
--dsw-alias-label-secondary       次文字色
--dsw-alias-brand-primary         品牌强调色
--dsw-alias-state-error-primary   错误态
--dsw-alias-state-idle-primary    失活态
--dsw-alias-state-success-primary 成功态
--dsw-alias-state-warn-primary    警告态
```

在 `lib/client.js` 的 `effectCss()` 里按 `tokenRule(name, light, dark)` 的形状加一行即可
（`--dsw-alias-bg-overlay` 的深浅对应关系没有逐条核对过，加之前先确认）。

## 为什么上一版会把 DSH 拖垮（以及现在为什么不会了）

DSH 网页壳在启动末尾会审计 Loader 里**每一条**条目：

```js
// dsh-web-frontend 的启动流程
if (o.length > 0) throw new Error(`web boot: ${o.length} entries did not activate\n${o.join('\n')}`)
```

只要有一条 fiber 不是 `active`（bundle 没到货 / 工厂抛异常 / 声明的服务一直没出现），
整个界面就停在 **“Failed to load plugins”**，一个插件都起不来 —— 上一版就是死在这里。

上一版的具体崩因：`lib/client.js` 里删掉了「按视口采样认层」那段代码，但**调用点还在**
（`scheduleGlassSurfaces()` / `glassObserver = …`）。那些标识符已经不存在，模块是 ESM
（严格模式），`apply()` 一跑就 `ReferenceError` → 本条目失败 → 整个界面起不来。

现在插件按三条硬性约束写（文件头注释里有完整版）：

1. **绝不让插件变成「没激活的条目」**
   - 文件体只注册工厂：不 require、不建 DOM、不读 localStorage；
   - 工厂体只声明常量与函数，不做有副作用的调用；
   - `apply()` 全程 `try/catch`，里面每个可能失败的动作各自兜底；
   - **不声明 `inject` 服务依赖**，改用 `ctx.inject(['slots','locale'], scope => …)` ——
     它建的是**子 fiber**：服务永远不来也只是「少了个设置界面」，父 fiber 照样 `active`。
     （`inject` 是硬依赖：服务一旦改名，条目就永远 pending，那就是全站起不来。）
2. **token 覆盖走自己的样式表 + `!important`，不依赖 `dsh-client-ui-theme`**
   主题运行时把 token 写成 **body 内联样式**；CSS 级联里「author 的 `!important` 声明」
   高于「普通内联声明」，所以样式表里带 `!important` 的同名 token 一定生效。
   `theme` 插件改名 / 换实现 / 被禁用都不影响本插件。深色用
   `body[data-ds-dark-theme]` 区分（主题运行时自己打在 body 上的属性，DSH 自己的 CSS 也在用）。
3. **只认稳定的 `data-*` 钩子，不碰带构建哈希的类名**（`._6Qf49G_xxx` 那种）
   用到的：`data-sidebar-right-panel` / `data-sidebar-right-open` / `data-dockkit-pane` /
   `data-sidebar-terminal` / `data-ds-dark-theme` —— 要么是 DSH 自己 CSS 在用的选择器，
   要么是它自己的逻辑在读写的属性。

> 平台差异（macOS 的 vibrancy、Windows 的 titlebar / 圆角 / 放大态 max-width）全部由
> DSH 自己的 `html[data-platform=…]`、`html[data-windows-titlebar]` 属性驱动；本插件不写
> 任何平台分支，所以 Mac / Windows 是同一套代码。

### 改代码 vs 用界面

- 想加**新旋钮**：在 `lib/client.js` 的 `SPECS` 表里加一条（key / 区间 / 步长 / 文案），
  再在 `effectCss()` 里把它的效果算进去。文案在同一个文件的 `zh` / `en` 字典里。
- 只改**取值**：直接用设置界面，不必动代码。
- 改了 `lib/client.js` → 刷新页面（⌘R）即可；改了 `lib/index.js` / `package.json` /
  `cordis.patch.yml` → 需要完全退出 DSH 再打开。

## 已知边界

- **透明不等于毛玻璃，而且有一层糊你改不掉**：DSH 主窗口在 macOS 上用系统级
  vibrancy（`app.asar/lib/main.js` 里的 `vibrancy: "sidebar"` + 透明底色），
  **这是系统层面的模糊，网页层无法移除** —— 它就是你「透明度 0 + 模糊 0 却依然看到模糊」的原因。
  想要"完全锐利的桌面"，只能改应用本身（换构建 / 关掉 vibrancy），插件做不到。
- **模糊强度的地板**：设成 0 时 CSS 侧确实一点都不糊，但上面那层系统毛玻璃仍在。
- **终端会跟着透**：靠的是把 xterm 那几层容器/整行的底色打成透明。如果将来 DSH 换掉
  终端的渲染方式（比如换成 canvas/WebGL 渲染器），这一招会失效，表现是终端又变回
  不透明的纯色 —— 那时需要按新渲染器重新找层。
- **模糊强度是全局的**：一个数值同时管页面背景、弹窗遮罩和面板背后；想分开调，
  在 `effectCss()` 里拆开就行。
- **字号不管**：会话正文的字号用 DSH 自带的「字号大小」（10–22px）。「界面缩放」是
  整体放大（含间距），属于钝器，可能影响布局。
- **宿主半片是空的**：本插件不碰数据、不发网络请求，宿主侧只贡献一个 Loader 行，
  好让 `dsh.client` 声明的浏览器半片被送进页面。
- **`!important` 的代价**：本插件的 token 覆盖永远赢过主题层（包括第三方主题）的同名
  token。对一个「用户自己调外观」的插件来说这是有意的取舍。
