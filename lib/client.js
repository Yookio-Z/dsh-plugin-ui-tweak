/**
 * dsh-plugin-ui-tweak — 浏览器半片（DSH 客户端插件）。
 *
 * 职责：
 *   1. 把「背景透明度 / 面板透明度 / 模糊强度 / 放大态底色 / 界面缩放」换算成
 *      DSH 设计系统的 token 覆盖 + 少量结构选择器规则，注入 <style> 生效。
 *   2. 在「设置 → 通用」里注册一组带步进器的设置行。
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  三条硬性约束（DSH 升级 / 换平台都不能被这个插件拖累）
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ① 绝不能让插件变成「没激活的条目」。
 *    DSH 网页壳在启动末尾会审计 Loader 里每一条：只要有一条 fiber 不是 active
 *    （bundle 没到货 / 工厂抛异常 / 声明的服务一直没出现），整个界面就停在
 *    “Failed to load plugins”，一个都起不来。所以：
 *      · 文件体只注册工厂：不 require、不建 DOM、不读 localStorage；
 *      · 工厂体只声明常量与函数：不做任何有副作用的调用；
 *      · apply() 全程 try/catch，任何一步失败都只是「这个功能不生效」；
 *      · **不声明 inject 服务依赖**，改用 ctx.inject([...], scope => …) 等可选服务 ——
 *        它建的是子 fiber：服务永远不来也只是少了个设置界面，父 fiber 照样 active。
 *
 * ② token 覆盖走本插件自己的样式表 + !important，不依赖 dsh-client-ui-theme。
 *    主题运行时是把 token 以 **body 内联样式** 写进去的；CSS 级联里「author 的
 *    !important 声明」高于「普通内联声明」，所以样式表里带 !important 的同名 token
 *    一定生效。好处：theme 改名 / 换实现 / 被禁用都不影响本插件；代价：本插件永远
 *    赢过主题层的同名 token —— 对一个「用户自己调外观」的插件来说这正是想要的。
 *    深色用 body[data-ds-dark-theme] 区分：那是主题运行时自己打在 body 上的属性，
 *    DSH 自己的 CSS 也在用（dsh-client-ui-layout 的 DARK_ATTRIBUTE）。
 *
 * ③ 只认稳定的 data-* 钩子，不碰带构建哈希的类名（._6Qf49G_xxx 这种）。
 *    用到的：data-sidebar-right-panel / data-sidebar-right-open / data-dockkit-pane /
 *    data-dockkit-empty / data-sidebar-terminal / data-ds-dark-theme —— 要么是 DSH
 *    自己 CSS 在用的选择器，要么是它自己的逻辑在读写的属性。
 *
 * ④ 不动宿主元素的**层叠上下文与包含块**语义。
 *    `backdrop-filter` / `transform` / `filter` / `isolation` 这类属性会给元素同时
 *    加上「层叠上下文」和「fixed 后代包含块」两顶帽子。加在右侧栏面板
 *    （[data-sidebar-right-panel]）上会真的弄坏界面：
 *      · pane 的 z-index（平时 10、放大态被 DSH 抬到 40）被关进面板里，于是对话底部
 *        那个 `position:sticky; z-index:7` 的输入框反而浮到放大后的面板上面，还能打字；
 *      · 面板里 `position:fixed` 的浮窗（dockkit 浮窗、文档预览浮层）以面板为包含块，
 *        push 态下位置整体偏出去。
 *    所以毛玻璃只加在「本来就是那层玻璃」的 pane 的 `::before` 上（DSH 自己的菜单
 *    面板也是这个写法），面板本身只写 background-color 和自定义属性。
 *
 * 详情见同目录 README.md。
 */

/* ── 文件体：只注册工厂 ──────────────────────────────────────────────────
 * 这一层抛出的任何异常 = 这个 bundle「注册失败」= 启动审计里的致命条目。
 * 所以每一步都判空，出任何意外就安静地什么都不做。
 */
(() => {
	const loader = typeof window === 'undefined' ? void 0 : window.__ModuleLoader__;
	if (loader === void 0 || typeof loader.load !== 'function') return;
	loader.load({
		id: 'dsh-plugin-ui-tweak',
		factory: (require) => {
			var module = { exports: {} };
			var exports = module.exports;
			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

			/**
			 * 取一个依赖模块，取不到就返回 undefined。
			 * 这三个都是壳层常驻的 seed 模块（react/jsx-runtime、
			 * dsh-client-ui-primitives、dsh-client-store），正常一定在；
			 * 判空只是为了让「DSH 哪天把它们挪走」变成少个图标，而不是整个插件加载失败。
			 */
			const safeRequire = (specifier) => {
				try {
					return require(specifier);
				} catch {
					return void 0;
				}
			};
			const jsxRuntime = safeRequire('react/jsx-runtime');
			const primitives = safeRequire('@deepseek-ai/dsh-client-ui-primitives');
			const storeModule = safeRequire('@deepseek-ai/dsh-client-store');

			/** 出一条诊断。宿主不该因为本插件刷屏，所以只有真出错时才写。 */
			const warn = (error) => {
				try {
					console.warn('[dsh-plugin-ui-tweak]', error);
				} catch {
					/* 控制台不可用就算了 */
				}
			};

			// ══════════════════════════════════════════════════════════════
			//  常量：DSH 设计系统的 neutral-bluish 色阶 + 各表面的原生取值
			// ══════════════════════════════════════════════════════════════

			/** localStorage 键。 */
			const STORAGE_KEY = 'dsh-plugin-ui-tweak';
			/** 设置行的文案命名空间。 */
			const LOCALE_NS = 'settings.uiTweak';
			/** 本插件所有 <style> 的 data-plugin 值（也用于 Fiber 失败时按 id 回收）。 */
			const PLUGIN_ID = 'dsh-plugin-ui-tweak';

			/** DSH 设计系统自带的 19 级灰阶（抄自 dsh-client-ui-theme）。 */
			const SCALE = {
				50: '#f9fafb',
				60: '#f5f6f7',
				75: '#f1f3f5',
				100: '#ebeef2',
				150: '#e9ecf2',
				200: '#e1e5ee',
				300: '#cfd3d6',
				400: '#adb2b8',
				500: '#979da6',
				600: '#81858c',
				700: '#61666b',
				750: '#43454a',
				800: '#353638',
				850: '#2c2c2e',
				875: '#232324',
				900: '#1b1b1c',
				950: '#151517',
				1000: '#0f1115'
			};

			/** 亮度档 → 各表面取色阶上的哪一级。第 0 档就是 DSH 原生。 */
			const LADDER = [
				{ base: 950, layer1: 875, layer2: 850, sidebar: 900 },
				{ base: 900, layer1: 850, layer2: 800, sidebar: 875 },
				{ base: 875, layer1: 800, layer2: 750, sidebar: 850 },
				{ base: 850, layer1: 750, layer2: 700, sidebar: 800 }
			];

			/** 浅色模式的基线：跟随原生，不受亮度档影响。 */
			const LIGHT = { base: '#ffffff', layer1: '#ffffff', layer2: '#ffffff', sidebar: '#f9fafb' };

			/**
			 * 出厂值。
			 * `darkness` 已经没有设置行了（用户不需要那三档），保留成内部常量：
			 * 1 = 比 DSH 原生（#151517）略灰一档，面板/侧栏按同一个档位一起取色。
			 * 想恢复那一行设置，把它加回 SPECS 即可。
			 */
			const DEFAULTS = { darkness: 1, bgAlpha: 1, panelAlpha: 1, glass: 24, fullscreenAlpha: 1, uiZoom: 1 };

			/** 放大态的最低模糊（px）；只有放大态底色被调成半透明时才用得上。 */
			const FULLSCREEN_MIN_BLUR = 32;

			/**
			 * 设置行规格：一行一个旋钮。
			 * step 用于步进器；format(value, t) 决定显示成什么样子。
			 */
			const SPECS = [
				{
					key: 'bgAlpha',
					id: 'ui-tweak-bg-alpha',
					order: 30,
					min: 0,
					max: 1,
					step: 0.05,
					titleKey: 'bgAlpha.title',
					descKey: 'bgAlpha.desc',
					format: (v) => `${Math.round(v * 100)}%`
				},
				{
					key: 'panelAlpha',
					id: 'ui-tweak-panel-alpha',
					order: 31,
					min: 0.6,
					max: 1,
					step: 0.05,
					titleKey: 'panelAlpha.title',
					descKey: 'panelAlpha.desc',
					format: (v) => `${Math.round(v * 100)}%`
				},
				{
					key: 'glass',
					id: 'ui-tweak-glass',
					order: 32,
					min: 0,
					max: 48,
					step: 8,
					titleKey: 'glass.title',
					descKey: 'glass.desc',
					format: (v, t) => (v <= 0 ? t('glass.off') : `${Math.round(v)} px`)
				},
				{
					key: 'fullscreenAlpha',
					id: 'ui-tweak-fullscreen-alpha',
					order: 33,
					min: 0.6,
					max: 1,
					step: 0.05,
					titleKey: 'fullscreenAlpha.title',
					descKey: 'fullscreenAlpha.desc',
					format: (v) => `${Math.round(v * 100)}%`
				},
				{
					key: 'uiZoom',
					id: 'ui-tweak-zoom',
					order: 34,
					min: 0.8,
					max: 1.4,
					step: 0.02,
					titleKey: 'zoom.title',
					descKey: 'zoom.desc',
					format: (v) => (v === 1 ? '100%' : `${Math.round(v * 100)}%`)
				}
			];

			/** 步进器的显示精度（避免 0.8500000000000001 这种浮点尾巴）。 */
			function round2(value) {
				return Math.round(value * 100) / 100;
			}

			/** 把值夹在区间内并修掉浮点误差。 */
			function clamp(value, min, max) {
				return round2(Math.min(max, Math.max(min, value)));
			}

			/** `#151517` + 0.8 → `rgba(21, 21, 23, 0.8)`；alpha 为 1 时原样返回。 */
			function withAlpha(hex, alpha) {
				if (!(alpha < 1)) return hex;
				const raw = String(hex).slice(1);
				const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
				const n = parseInt(full, 16);
				if (!Number.isFinite(n)) return hex;
				return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
			}

			/** 当前模糊半径（px）：就是「模糊强度」的读数，0 = 不加模糊。 */
			function effectiveBlur(values) {
				return Math.max(0, Math.round(values.glass));
			}

			/** 当前亮度档（内部固定档位；没有设置行，见 DEFAULTS 注释）。 */
			function rungOf(values) {
				return LADDER[Math.max(0, Math.min(LADDER.length - 1, Math.round(values.darkness)))] || LADDER[0];
			}

			/** 当前「放大态底色」的不透明度（0.6–1，出厂 1 = 实心）。 */
			function fullscreenAlphaOf(values) {
				const alpha = Number(values.fullscreenAlpha);
				return Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
			}

			/** 从 localStorage 读用户设置，坏数据一律回落到出厂值。 */
			function loadValues() {
				const values = { ...DEFAULTS };
				try {
					const raw = window.localStorage.getItem(STORAGE_KEY);
					if (!raw) return values;
					const parsed = JSON.parse(raw);
					for (const spec of SPECS) {
						const value = parsed ? parsed[spec.key] : void 0;
						if (typeof value === 'number' && Number.isFinite(value)) values[spec.key] = clamp(value, spec.min, spec.max);
					}
				} catch {
					/* 隐私模式 / 坏 JSON：用出厂值 */
				}
				return values;
			}

			/** 写回用户设置（失败不影响界面，仅仅不持久化）。 */
			function saveValues(values) {
				try {
					window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
				} catch {
					/* 隐私模式等场景下存不了，忽略 */
				}
			}

			// ══════════════════════════════════════════════════════════════
			//  样式：两段
			//    · 设置行的静态样式（抄内置「字号大小」那一行，保证外观同原生）
			//    · 由当前取值即时生成的效果样式（token 覆盖 + 放大态底色 + 毛玻璃）
			// ══════════════════════════════════════════════════════════════

			const ROW_CSS = [
				'.tweak_row{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}',
				'.tweak_rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}',
				'.tweak_title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}',
				'.tweak_desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}',
				'.tweak_control{align-items:center;gap:8px;display:inline-flex}',
				'.tweak_stepper{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);justify-content:center;align-items:center;min-width:84px;height:36px;display:inline-flex;position:relative}',
				'.tweak_value{text-align:center;font-variant-numeric:tabular-nums;min-width:18px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}',
				'.tweak_arrows{opacity:0;flex-direction:column;gap:2px;display:flex;position:absolute;right:8px}',
				'.tweak_stepper:hover .tweak_arrows,.tweak_stepper:focus-within .tweak_arrows{opacity:1}',
				'.tweak_arrow{border-radius:var(--dsw-radius-xs);background:color-mix(in srgb, var(--dsw-alias-bg-layer-1) 75%, transparent);width:17px;height:12px;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;justify-content:center;align-items:center;padding:0;display:inline-flex}',
				'.tweak_arrow:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)}',
				'.tweak_arrow:disabled{color:var(--dsw-alias-label-caption);cursor:default}',
				'.tweak_reset{border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;height:32px;padding:0 14px;cursor:pointer}',
				'.tweak_reset:hover{background:var(--dsw-alias-interactive-bg-hover)}'
			].join('');

			/**
			 * 一条 token 覆盖（浅色 / 深色两套值）。
			 *
			 * 写 `!important` 的理由见文件头 ②：主题运行时写的是 body 内联样式，
			 * 只有 author 的 !important 声明压得住它。
			 * 深色用 body[data-ds-dark-theme]：属性选择器特异性更高，天然覆盖浅色那条。
			 * 另外它只影响「自己没有声明该 token」的元素 —— 继承弱于任何元素级声明，
			 * 所以 DSH 组件自己的局部 token 覆盖不会被误伤。
			 */
			function tokenRule(name, light, dark) {
				const lines = [`body{${name}:${light} !important}`];
				if (dark !== light) lines.push(`body[data-ds-dark-theme]{${name}:${dark} !important}`);
				return lines.join('\n');
			}

			/**
			 * 面板里那层「真正半透明的玻璃」的背景模糊。
			 *
			 * 目标是 [data-dockkit-pane]（section.tabHost，DSH 给它
			 * `background: var(--dsw-alias-bg-base)`）和空面板 [data-dockkit-empty]
			 * —— 也就是 DSH 在放大态把 z-index 抬到 40 的那两层。
			 *
			 * ⚠️⚠️ 为什么不能加在 [data-sidebar-right-panel]（面板）上 —— 两个真实故障：
			 *   `backdrop-filter` 非 none 会让元素 **变成层叠上下文**，也会 **变成 fixed
			 *   后代的包含块**。加在面板上等于：
			 *     ① 把面板整棵子树降级成一个 z-index:auto 的整体。而对话底部的输入框
			 *        （dsh-client-ui-conversation 的 .composerSeat）是
			 *        `position:sticky; z-index:7`，pane 平时是 `z-index:10`、放大态
			 *        被 DSH 抬到 `40` —— 两者本该压在输入框上面；面板一变成层叠上下文，
			 *        这个 40 就被关进面板里，输入框反而浮到放大后的面板上面，还能打字。
			 *     ② 面板里所有 `position:fixed` 的东西（dockkit 的浮窗
			 *        `[data-dockkit-float]`、文档预览浮层）会以面板为包含块，位置全错
			 *        —— push 态面板不在视口原点，浮窗会整体偏出去。
			 *
			 * 用 `::before` + `z-index:-1` 而不是直接给 pane 加 backdrop-filter：后者会让
			 * pane 变成 fixed 后代的包含块，同样会挪动浮窗。DSH 自己的菜单面板就是这么写的
			 * （`._panel{isolation:isolate}` + `._panel:before{z-index:-1;backdrop-filter:...}`）。
			 *
			 * @param prefix - 作用范围选择器（普通态 / 放大态）。
			 * @param radius - 模糊半径（px）。
			 * @returns 两条规则：定位宿主 + 玻璃伪元素。
			 */
			function paneGlassRules(prefix, radius) {
				const hosts = [`${prefix} [data-dockkit-pane]`, `${prefix} [data-dockkit-empty]`];
				const glass = hosts.map((host) => `${host}::before`);
				return [
					`${hosts.join(',')}{isolation:isolate;position:relative}`,
					`${glass.join(',')}{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;backdrop-filter:blur(${radius}px)}`
				];
			}

			/**
			 * 由当前取值生成效果样式表。
			 *
			 * 组成：
			 *  ① 设计 token 覆盖（背景/面板/侧栏 + DSH 自带的两个模糊开关）；
			 *  ② 放大态：面板铺满整窗，底色必须实心（本次修复的核心，见下）；
			 *  ③ 毛玻璃：body 管窗口后面那层，面板里的 pane 管它盖住的对话；
			 *  ④ 侧栏终端：xterm 的 DOM 渲染器自己刷不透明底色，得单独打透。
			 *
			 * ── ② 为什么要单独管放大态 ──────────────────────────────────────
			 * 结构（源码 dsh-client-ui-sidebar-right + dsh-client-ui-dockkit）：
			 *
			 *   .overlayLayer (z-index:20)
			 *     └ div[data-sidebar-right-panel=fullscreen][data-sidebar-right-open]
			 *         style="width:100vw"          ← 放大后铺满整个窗口
			 *         └ div[data-dockkit-host=dock]  (z-index:40)
			 *             └ section[data-dockkit-pane]
			 *                 background: var(--dsw-alias-bg-base)   ← 面板真正可见的底色
			 *
			 * 也就是说放大后「面板」盖住的是整窗，而它的底色就是 --dsw-alias-bg-base。
			 * 一旦「背景透明度」被调低（例如 20%），这个 token 就变成半透明，铺满全窗的
			 * 面板跟着变成一块玻璃 —— 背后 .centerCol 里的对话正文直接透上来，字叠字。
			 *
			 * 修法：放大态下把面板底色换成同色阶的 **实心** 颜色（颜色仍由本插件的
			 * 「放大态底色」决定，不写死），并让面板自己也铺一层同样的底色，
			 * 面板内容够不到的地方也一并盖住。
			 *
			 * ⚠️ 必须限定 [data-sidebar-right-open]：面板收起时它仍然是 width:100vw 的
			 * 绝对定位元素（只是子节点 visibility:hidden + 移出屏幕），少了这个限定
			 * 就会拿一块不透明的板子盖死整个界面。
			 *
			 * ⚠️ 这条规则只写 `background-color` / 自定义属性 —— 都不产生层叠上下文，
			 * 所以 pane 的 z-index:10/40 仍然作用在根层叠上下文里，放大态依旧盖住输入框
			 * （见 paneGlassRules 的说明）。面板上绝不能加 backdrop-filter / transform /
			 * filter / isolation 这类会改变层叠与包含块的属性。
			 *
			 * @param values - 当前设置。
			 * @returns 样式表文本。
			 */
			function effectCss(values) {
				const rung = rungOf(values);
				const blur = effectiveBlur(values);
				const fsAlpha = fullscreenAlphaOf(values);
				const light = (hex, alpha) => withAlpha(hex, alpha);
				const parts = [];

				// ① 设计 token 覆盖：DSH 公开的 surface token。
				parts.push(tokenRule('--dsw-alias-bg-base', light(LIGHT.base, values.bgAlpha), light(SCALE[rung.base], values.bgAlpha)));
				parts.push(tokenRule('--dsw-alias-bg-layer-1', light(LIGHT.layer1, values.panelAlpha), light(SCALE[rung.layer1], values.panelAlpha)));
				parts.push(tokenRule('--dsw-alias-bg-layer-2', light(LIGHT.layer2, values.panelAlpha), light(SCALE[rung.layer2], values.panelAlpha)));
				parts.push(tokenRule('--dsw-specific-sidebar-fill', light(LIGHT.sidebar, values.panelAlpha), light(SCALE[rung.sidebar], values.panelAlpha)));

				// DSH 自带的遮罩模糊开关（出厂 none），设置面板/弹窗的 backdrop-filter 读它。
				if (blur > 0) parts.push(tokenRule('--dsw-mask-blur', `blur(${blur}px)`, `blur(${blur}px)`));
				// 菜单/浮层自带 40px 背景模糊：「模糊强度」这一个旋钮说了算，
				// 调到 0 就真的一点模糊都没有。
				const menuBlur = blur > 0 ? `blur(${blur}px) saturate(150%)` : 'none';
				parts.push(tokenRule('--dsw-menu-backdrop-filter', menuBlur, menuBlur));

				// 插件自己的放大态底色（浅/深两套），供下面 ② 使用。
				parts.push(tokenRule('--dsh-ui-tweak-fs-fill', light(LIGHT.base, fsAlpha), light(SCALE[rung.base], fsAlpha)));

				// ② 放大态：实心底色（不含任何 backdrop-filter —— 理由见上面的 ⚠️）。
				parts.push(
					[
						'[data-sidebar-right-panel=fullscreen][data-sidebar-right-open]{',
						'--dsw-alias-bg-base:var(--dsh-ui-tweak-fs-fill);', // 面板内的 pane / 空面板跟着变实心
						'background-color:var(--dsh-ui-tweak-fs-fill);', // 面板盖住整窗，缝隙也一并盖住
						'}'
					].join('')
				);

				// ③ 毛玻璃：加在「真正悬在内容上方的那一层」上。
				//    body 管窗口后面那层（桌面 / 系统毛玻璃）；
				//    面板里的 pane 管它盖住的那段对话（面板本身不许碰，见 ② 的 ⚠️）。
				if (blur > 0) {
					parts.push(`body{backdrop-filter:blur(${blur}px) saturate(140%)}`);
					parts.push(paneGlassRules('[data-sidebar-right-panel]', blur).join('\n'));
				}
				// 放大态底色调成半透明时，给那层玻璃一个保底模糊（不受旋钮影响）。
				// 底色是实心（出厂值）时不需要：背后什么都看不见。
				if (fsAlpha < 1) {
					parts.push(paneGlassRules('[data-sidebar-right-panel=fullscreen][data-sidebar-right-open]', Math.max(blur, FULLSCREEN_MIN_BLUR)).join('\n'));
				}

				// ④ 侧栏终端：xterm 的 DOM 渲染器会自己在 .xterm-viewport 和每一行上刷
				//    不透明的底色（它只吃得到不透明色），把这几层打成透明，露出来的就是
				//    容器上的 --dsw-alias-bg-base（即我们那个半透明色）—— 终端这才跟着透。
				//    只动「容器 / 整行」：应用自己画的单元格底色（ls 配色、vim 高亮）在
				//    span 上，不受影响。
				if (values.bgAlpha < 1) {
					parts.push(
						[
							'[data-sidebar-terminal] .xterm,',
							'[data-sidebar-terminal] .xterm-viewport,',
							'[data-sidebar-terminal] .xterm-scrollable-element,',
							'[data-sidebar-terminal] .xterm-screen,',
							'[data-sidebar-terminal] .xterm-rows,',
							'[data-sidebar-terminal] .xterm-rows > div{background-color:transparent !important}'
						].join('\n')
					);
				}

				return parts.join('\n');
			}

			// ══════════════════════════════════════════════════════════════
			//  设置行：状态容器 + 组件
			// ══════════════════════════════════════════════════════════════

			/**
			 * 建一个快照 store（设置行靠 useSyncExternalStore 订阅它）。
			 * 优先用 DSH 官方实现；拿不到就退回到一个语义相同的最小实现
			 * （getSnapshot / subscribe / update），保证「DSH 挪走这个包」只是
			 * 少一层官方封装，而不是设置界面直接崩。
			 */
			function createStore(initial) {
				const factory = storeModule ? storeModule.createSnapshotStore : void 0;
				if (typeof factory === 'function') {
					try {
						return factory(initial);
					} catch (error) {
						warn(error);
					}
				}
				let state = { ...initial };
				const listeners = new Set();
				return {
					getSnapshot: () => state,
					subscribe: (listener) => {
						listeners.add(listener);
						return () => {
							listeners.delete(listener);
						};
					},
					update: (mutate) => {
						const next = { ...state };
						mutate(next);
						state = next;
						for (const listener of [...listeners]) {
							try {
								listener();
							} catch (error) {
								warn(error);
							}
						}
					}
				};
			}

			/** 取一个图标组件；primitives 不在就退回字符箭头。 */
			function iconFor(direction) {
				if (!primitives) return void 0;
				const candidate = direction === 'up' ? primitives.IconChevronUpOutlineRegular : primitives.IconChevronDownOutlineRegular;
				return typeof candidate === 'function' ? candidate : void 0;
			}

			/**
			 * 一个旋钮一行：左侧标题 + 说明，右侧步进器（悬停出现上下箭头）。
			 * @param props - 插槽注入的 props（t / useTweak / selector / spec / set）。
			 */
			function TweakRow({ t, useTweak, selector, spec, set }) {
				const { jsx, jsxs } = jsxRuntime;
				const value = useTweak(selector);
				const text = typeof spec.format === 'function' ? spec.format(value, t) : String(value);
				const step = (delta) => set(spec.key, clamp(value + delta, spec.min, spec.max));
				const up = iconFor('up');
				const down = iconFor('down');
				return jsxs('div', {
					className: 'tweak_row',
					children: [
						jsxs('div', {
							className: 'tweak_rowText',
							children: [
								jsx('div', { className: 'tweak_title', children: t(spec.titleKey) }),
								jsx('div', { className: 'tweak_desc', children: t(spec.descKey) })
							]
						}),
						jsx('div', {
							className: 'tweak_control',
							children: jsxs('div', {
								className: 'tweak_stepper',
								children: [
									jsx('span', { className: 'tweak_value', children: text }),
									jsxs('span', {
										className: 'tweak_arrows',
										children: [
											jsx('button', {
												type: 'button',
												className: 'tweak_arrow',
												'aria-label': t('increase'),
												disabled: value >= spec.max,
												onClick: () => step(spec.step),
												children: up ? jsx(up, { size: 9 }) : '▲'
											}),
											jsx('button', {
												type: 'button',
												className: 'tweak_arrow',
												'aria-label': t('decrease'),
												disabled: value <= spec.min,
												onClick: () => step(-spec.step),
												children: down ? jsx(down, { size: 9 }) : '▼'
											})
										]
									})
								]
							})
						})
					]
				});
			}

			/** 一行「恢复默认」。 */
			function ResetRow({ t, reset }) {
				const { jsx, jsxs } = jsxRuntime;
				return jsxs('div', {
					className: 'tweak_row',
					children: [
						jsxs('div', {
							className: 'tweak_rowText',
							children: [
								jsx('div', { className: 'tweak_title', children: t('reset.title') }),
								jsx('div', { className: 'tweak_desc', children: t('reset.desc') })
							]
						}),
						jsx('div', {
							className: 'tweak_control',
							children: jsx('button', { type: 'button', className: 'tweak_reset', onClick: () => reset(), children: t('reset.action') })
						})
					]
				});
			}

			// ══════════════════════════════════════════════════════════════
			//  文案
			// ══════════════════════════════════════════════════════════════

			const zh = {
				increase: '增大',
				decrease: '减小',
				'bgAlpha.title': '背景透明度',
				'bgAlpha.desc': '低于 100% 时主背景半透明；插件会同时清掉页面那层不透明底色，窗口后面若有毛玻璃/桌面就能透出来。0% = 只剩模糊。',
				'panelAlpha.title': '面板透明度',
				'panelAlpha.desc': '卡片、侧栏、浮层的不透明度。',
				'glass.title': '模糊强度',
				'glass.desc': '半透明时背后那层的模糊程度（px）。同时管：整个页面、设置面板/弹窗背后、菜单浮层、以及右侧栏面板盖住的那段对话。设 0 = 不加模糊，那样半透明会看不清字。',
				'glass.off': '关',
				'fullscreenAlpha.title': '放大态底色',
				'fullscreenAlpha.desc': '点右上角放大按钮后，右侧面板会铺满整个窗口，这一项决定它自己的底色有多实。默认 100%（实心）—— 调低会让背后的对话正文透上来，字叠字。',
				'zoom.title': '界面缩放',
				'zoom.desc': '整个界面（含文字与间距）的缩放比例，100% = 不缩放。',
				'reset.title': '恢复默认',
				'reset.desc': '把上面五项界面微调还原成初始值。',
				'reset.action': '恢复默认'
			};

			const en = {
				increase: 'Increase',
				decrease: 'Decrease',
				'bgAlpha.title': 'Background opacity',
				'bgAlpha.desc': 'Below 100% the base background turns translucent; the opaque page fill is cleared so window vibrancy can show through. 0% leaves only the blur.',
				'panelAlpha.title': 'Panel opacity',
				'panelAlpha.desc': 'Opacity of cards, sidebars and overlays.',
				'glass.title': 'Blur strength',
				'glass.desc': 'How strongly the backdrop is blurred behind translucent layers (px). Drives the whole page, the area behind settings panels and dialogs, menu surfaces, and the conversation the right-hand panel covers. 0 disables blur, which makes translucent layers hard to read.',
				'glass.off': 'Off',
				'fullscreenAlpha.title': 'Maximized panel fill',
				'fullscreenAlpha.desc': 'The right panel spans the whole window after the top-right maximize button, and this sets how solid its own fill is. The default 100% (opaque) keeps the conversation behind it from showing through the text.',
				'zoom.title': 'Interface zoom',
				'zoom.desc': 'Scales the whole interface including text and spacing; 100% = unchanged.',
				'reset.title': 'Reset',
				'reset.desc': 'Restore all five tweaks above to their initial values.',
				'reset.action': 'Reset'
			};

			// ══════════════════════════════════════════════════════════════
			//  DOM 注入
			// ══════════════════════════════════════════════════════════════

			/** 在 body 就绪后执行（客户端插件可能在 body 之前就被执行）。 */
			function whenBody(run) {
				try {
					if (document.body) {
						run(document.body);
						return;
					}
					document.addEventListener('DOMContentLoaded', () => run(document.body), { once: true });
				} catch (error) {
					warn(error);
				}
			}

			/**
			 * 清掉本插件此前注入的所有样式表（热重载、旧版本残留都用它兜底）。
			 * 只按 data-plugin=本插件 id 匹配，不碰别人。
			 */
			function clearStyleTags() {
				try {
					if (typeof document === 'undefined') return;
					for (const tag of document.querySelectorAll('style[data-plugin=' + JSON.stringify(PLUGIN_ID) + ']')) tag.remove();
				} catch (error) {
					warn(error);
				}
			}

			/**
			 * 注入 / 复用一张样式表。
			 * data-plugin 一定要写成本插件的 id：DSH 的客户端模块表在工厂失败时会按
			 * 这个属性回收样式（removeOwnedStyles），写错会误删别人的样式。
			 */
			function installStyleTag(name, text) {
				if (typeof document === 'undefined') return null;
				const tagId = `${PLUGIN_ID}/${name}.css`;
				const selector = 'style[data-plugin-css=' + JSON.stringify(tagId) + ']';
				const existing = document.querySelector(selector);
				if (existing !== null) {
					if (typeof text === 'string') existing.textContent = text;
					return existing;
				}
				const tag = document.createElement('style');
				tag.dataset.plugin = PLUGIN_ID;
				tag.dataset.pluginCss = tagId;
				tag.textContent = typeof text === 'string' ? text : '';
				document.head.appendChild(tag);
				return tag;
			}

			// ══════════════════════════════════════════════════════════════
			//  插件主体
			// ══════════════════════════════════════════════════════════════

			/**
			 * 应用当前取值：token 覆盖 + 放大态底色 + 毛玻璃 + 终端透底 + 缩放。
			 * 任何一步失败都只影响它自己。
			 * @param state - 插件运行时状态（取值 + 样式表句柄）。
			 */
			function paint(state) {
				try {
					if (state.effectTag !== null) state.effectTag.textContent = effectCss(state.values);
				} catch (error) {
					warn(error);
				}
				try {
					whenBody((body) => {
						if (state.values.bgAlpha < 1) body.style.setProperty('background-color', 'transparent');
						else body.style.removeProperty('background-color');
					});
					const root = document.documentElement;
					if (state.values.uiZoom !== 1) root.style.zoom = String(state.values.uiZoom);
					else root.style.removeProperty('zoom');
				} catch (error) {
					warn(error);
				}
			}

			/**
			 * 注册「设置 → 通用」里的设置行。
			 * 用 ctx.inject 等可选服务：它建的是子 fiber，服务永远不来也只是没有设置界面，
			 * 不会把本条目变成 pending（那会让整个界面起不来）。
			 * @param ctx - 客户端根上下文。
			 * @param state - 插件运行时状态。
			 */
			function mountSettings(ctx, state) {
				if (typeof ctx.inject !== 'function') return;
				ctx.inject(['slots', 'locale'], (scope) => {
					try {
						if (!jsxRuntime) throw new Error('react/jsx-runtime is unavailable');
						const slots = scope.slots;
						const locale = scope.locale;
						if (!slots || typeof slots.register !== 'function' || typeof slots.inject !== 'function') return;
						if (!locale || typeof locale.register !== 'function') return;

						scope.effect(() => locale.register(LOCALE_NS, { zh, en }));

						for (const spec of SPECS) {
							slots.inject('settings.general.item', () =>
								slots.register(
									{
										name: 'settings.general.item',
										id: spec.id,
										order: spec.order,
										locale: LOCALE_NS,
										inject: () => ({
											hooks: { tweak: state.store },
											selector: (snapshot) => snapshot[spec.key],
											spec,
											set: state.set
										})
									},
									TweakRow
								)
							);
						}

						slots.inject('settings.general.item', () =>
							slots.register(
								{
									name: 'settings.general.item',
									id: 'ui-tweak-reset',
									order: 40,
									locale: LOCALE_NS,
									inject: () => ({ reset: state.reset })
								},
								ResetRow
							)
						);
					} catch (error) {
						warn(error);
					}
				});
			}

			/**
			 * 插件入口。
			 *
			 * ⚠️ 这里是「整个界面能不能起来」的敏感位置：本函数抛出的异常会让本条目
			 * 停在不活跃状态，DSH 的启动审计随即判定启动失败。所以它整体包在 try/catch
			 * 里，内部每个可能失败的动作也各自兜底。
			 * @param ctx - 客户端根上下文。
			 */
			function apply(ctx) {
				try {
					clearStyleTags();
					installStyleTag('rows', ROW_CSS);
					const effectTag = installStyleTag('effect');
					const values = loadValues();
					const store = createStore({ ...values });

					const state = {
						values,
						store,
						effectTag,
						/** 改一个旋钮：按该旋钮自己的区间收口，更新快照、落盘、立刻重画。 */
						set(key, value) {
							try {
								const spec = SPECS.find((candidate) => candidate.key === key);
								const next = spec ? clamp(value, spec.min, spec.max) : value;
								state.values = { ...state.values, [key]: next };
								store.update((snapshot) => {
									snapshot[key] = next;
								});
								saveValues(state.values);
								paint(state);
							} catch (error) {
								warn(error);
							}
						},
						/** 全部还原成出厂值。 */
						reset() {
							for (const spec of SPECS) state.set(spec.key, DEFAULTS[spec.key]);
						}
					};

					paint(state);
					mountSettings(ctx, state);

					if (typeof ctx.on === 'function') {
						ctx.on('dispose', () => {
							try {
								if (state.effectTag !== null) state.effectTag.textContent = '';
								document.documentElement.style.removeProperty('zoom');
								whenBody((body) => body.style.removeProperty('background-color'));
							} catch (error) {
								warn(error);
							}
						});
					}
				} catch (error) {
					warn(error);
				}
			}

			exports.apply = apply;
			return module.exports;
		}
	});
})();
