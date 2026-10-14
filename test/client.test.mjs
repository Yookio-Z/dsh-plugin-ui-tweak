/**
 * dsh-plugin-ui-tweak 的自检：在没有浏览器、没有 DSH 的情况下跑一遍 lib/client.js。
 *
 * 干的事：桩掉 window / document / __ModuleLoader__，捕获工厂 → 拿到 exports.apply，
 * 用假的 ctx 调它，然后断言生成的样式表和注册行为。覆盖：
 *   · 正常路径（token 覆盖、放大态底色、毛玻璃、终端透底、设置行、落盘）
 *   · 依赖模块全缺失 / 服务缺失 / ctx.inject 不存在 时的降级路径（都必须不抛异常）
 *   · 重复 apply 不会叠加样式表
 *
 * 为什么值得留：DSH 的启动审计会把「没激活的条目」当成致命错误，整个界面停在
 * “Failed to load plugins”。这个自检就是那条底线 —— 改完 client.js 先跑它：
 *
 *   node test/client.test.mjs        # 或在插件目录跑 npm test
 *   DUMP_CSS=1 node test/client.test.mjs   # 顺便打印生成的 effect.css
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../lib/client.js', import.meta.url));

// ── 极简 DOM 桩 ───────────────────────────────────────────────────────────
class StyleTag {
	constructor() {
		this.dataset = {};
		this.textContent = '';
		this.parent = null;
	}
	remove() {
		if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
		this.parent = null;
	}
}
const head = {
	children: [],
	appendChild(node) {
		node.parent = this;
		this.children.push(node);
		return node;
	}
};
const makeStyleBag = () => ({
	props: {},
	setProperty(key, value) {
		this.props[key] = value;
	},
	removeProperty(key) {
		delete this.props[key];
	}
});
const body = {
	attributes: {},
	style: makeStyleBag(),
	setAttribute(key, value) {
		this.attributes[key] = value;
	},
	removeAttribute(key) {
		delete this.attributes[key];
	}
};
const documentElement = { style: makeStyleBag() };
const document = {
	body,
	documentElement,
	head,
	createElement: () => new StyleTag(),
	addEventListener() {},
	querySelector(selector) {
		const match = /^style\[data-plugin-css=(.*)\]$/.exec(selector);
		if (!match) return null;
		const id = JSON.parse(match[1]);
		return head.children.find((child) => child.dataset.pluginCss === id) ?? null;
	},
	querySelectorAll(selector) {
		const match = /^style\[data-plugin=(.*)\]$/.exec(selector);
		if (!match) return [];
		const id = JSON.parse(match[1]);
		return head.children.filter((child) => child.dataset.plugin === id);
	}
};
const localStorageData = new Map();
const window = {
	document,
	localStorage: {
		getItem: (key) => (localStorageData.has(key) ? localStorageData.get(key) : null),
		setItem: (key, value) => localStorageData.set(key, value)
	},
	addEventListener() {},
	__ModuleLoader__: {
		load(entry) {
			window.__entry = entry;
		}
	}
};

// ── 执行插件文件，拿到工厂 ────────────────────────────────────────────────
const code = fs.readFileSync(SRC, 'utf8');
new Function('window', 'document', 'localStorage', 'console', code)(window, document, window.localStorage, console);
const entry = window.__entry;
if (!entry || typeof entry.factory !== 'function') {
	console.error('FAIL  插件没有通过 window.__ModuleLoader__.load 注册工厂');
	process.exit(1);
}

/** 假 ctx：模拟 cordis 的服务与子作用域。 */
function makeCtx({ withServices = true, withInject = true } = {}) {
	const registry = [];
	const ctx = {
		injects: [],
		registry,
		effect() {},
		on() {},
		get: (name) => (withServices ? { name } : void 0),
		inject(deps, callback) {
			this.injects.push({ deps, callback });
			// 真 cordis 会等依赖到货后在子 fiber 里跑回调；这里直接跑，模拟「服务到货」。
			if (withServices) callback({ effect: () => {}, slots: this.slots, locale: this.locale });
			return { state: 'active' };
		},
		slots: {
			registry,
			inject(name, register) {
				register();
			},
			register(options, component) {
				registry.push({ options, component });
				return () => {};
			}
		},
		locale: { register() { return () => {}; } }
	};
	if (!withInject) delete ctx.inject;
	return ctx;
}

const results = [];
const check = (label, ok, detail = '') => results.push({ label, ok, detail });
const rowById = (ctx, id) => ctx.registry.find((row) => row.options.id === id);
const cssOf = (name) => {
	const tag = head.children.find((child) => child.dataset.pluginCss === `dsh-plugin-ui-tweak/${name}.css`);
	return tag ? tag.textContent : '';
};
/** 取样式表里第一条「选择器完全等于 prefix」的规则体，用来断言某个元素上到底写了什么。 */
const ruleBody = (css, prefix) => {
	for (const chunk of css.split('\n')) {
		const open = chunk.indexOf('{');
		if (open < 0) continue;
		if (chunk.slice(0, open).split(',').some((selector) => selector.trim() === prefix)) return chunk.slice(open + 1, chunk.lastIndexOf('}'));
	}
	return '';
};

// ── 1. 正常路径 ──────────────────────────────────────────────────────────
const ctx = makeCtx();
const plugin = entry.factory((specifier) => {
	if (specifier === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
	if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
		return { IconChevronUpOutlineRegular: () => null, IconChevronDownOutlineRegular: () => null };
	}
	if (specifier === '@deepseek-ai/dsh-client-store') {
		return {
			createSnapshotStore: (initial) => {
				let state = { ...initial };
				const listeners = new Set();
				return {
					getSnapshot: () => state,
					subscribe: (listener) => {
						listeners.add(listener);
						return () => listeners.delete(listener);
					},
					update: (mutate) => {
						const next = { ...state };
						mutate(next);
						state = next;
						for (const listener of listeners) listener();
					}
				};
			}
		};
	}
	throw new Error('unexpected require ' + specifier);
});
plugin.apply(ctx);

check('apply 不抛异常', true);
check('注入了 rows / effect 两张样式表', !!cssOf('rows') && !!cssOf('effect'));
check('注册了 5 个旋钮 + 1 个恢复默认', ctx.registry.length === 6, String(ctx.registry.length));
check('用 ctx.inject 等可选服务（而不是硬依赖）', ctx.injects.length === 1 && ctx.injects[0].deps.join(',') === 'slots,locale');
check('没有声明 exports.inject（否则服务一改名就永远 pending）', plugin.inject === void 0, JSON.stringify(Object.keys(plugin)));

let css = cssOf('effect');
check('背景 token 覆盖带 !important', /body\{--dsw-alias-bg-base:[^}]+!important\}/.test(css));
check('深色走 body[data-ds-dark-theme]', /body\[data-ds-dark-theme\]\{--dsw-alias-bg-base:[^}]+!important\}/.test(css));
check('放大态：面板铺实心底色', /\[data-sidebar-right-panel=fullscreen\]\[data-sidebar-right-open\]\{[^}]*background-color:var\(--dsh-ui-tweak-fs-fill\)/.test(css));
check('放大态：面板内的 bg-base 一起变实心', /\[data-sidebar-right-panel=fullscreen\]\[data-sidebar-right-open\]\{[^}]*--dsw-alias-bg-base:var\(--dsh-ui-tweak-fs-fill\)/.test(css));
check('放大态规则必须带 data-sidebar-right-open（否则收起时会盖死整个界面）', !/\[data-sidebar-right-panel=fullscreen\]\{/.test(css));
check('出厂放大态底色是实心 #1b1b1c（深色）', /body\[data-ds-dark-theme\]\{--dsh-ui-tweak-fs-fill:#1b1b1c !important\}/.test(css));
check('bgAlpha=100% 时不碰终端', !css.includes('.xterm-viewport'));

// 层叠 / 包含块红线：面板上不许出现会改变层叠上下文和 fixed 包含块的属性。
// 一旦面板变成层叠上下文，pane 的 z-index:10/40 就被关进面板里，对话的输入框
// （.composerSeat，position:sticky; z-index:7）会浮到放大后的面板上面。
const PANEL_RULE = '[data-sidebar-right-panel=fullscreen][data-sidebar-right-open]';
const FORBIDDEN = /backdrop-filter|transform|(?<!backdrop-)filter|isolation|opacity|will-change|contain/;
check('面板规则里没有任何会改变层叠/包含块的属性', !FORBIDDEN.test(ruleBody(css, PANEL_RULE)), ruleBody(css, PANEL_RULE));
check('没有以裸面板选择器开头的规则（毛玻璃不许挂在面板上）', !css.includes('[data-sidebar-right-panel]{'));
check('毛玻璃挂在 pane 的 ::before 上', css.includes('[data-sidebar-right-panel] [data-dockkit-pane]::before') && css.includes('backdrop-filter:blur(24px)'));
check('pane 的 ::before 用 z-index:-1 + isolation 落回 pane 内部', ruleBody(css, '[data-sidebar-right-panel] [data-dockkit-pane]').includes('isolation:isolate'));
check('放大态实心时 pane 上没有多余模糊', !/\[data-sidebar-right-panel=fullscreen\]\[data-sidebar-right-open\] \[data-dockkit-pane\]/.test(css));

// ── 2. 改设置：背景 20% + 模糊 48 ────────────────────────────────────────
rowById(ctx, 'ui-tweak-bg-alpha').options.inject().set('bgAlpha', 0.2);
rowById(ctx, 'ui-tweak-glass').options.inject().set('glass', 48);
css = cssOf('effect');
check('bgAlpha=20% 时 base token 变 rgba', /body\[data-ds-dark-theme\]\{--dsw-alias-bg-base:rgba\(27, 27, 28, 0\.2\) !important\}/.test(css));
check('bgAlpha=20% 时终端透底规则出现', css.includes('.xterm-viewport'));
check('放大态底色不受 bgAlpha 影响，仍是实心', /body\[data-ds-dark-theme\]\{--dsh-ui-tweak-fs-fill:#1b1b1c !important\}/.test(css));
check('模糊 48 同时写进 body / mask / menu', css.includes('body{backdrop-filter:blur(48px) saturate(140%)}') && /--dsw-mask-blur:blur\(48px\)/.test(css) && /--dsw-menu-backdrop-filter:blur\(48px\) saturate\(150%\)/.test(css));
check('设置落盘到 localStorage', JSON.parse(localStorageData.get('dsh-plugin-ui-tweak')).bgAlpha === 0.2);

// ── 3. 放大态底色调成半透明：应换成保底模糊（同样落在 pane 上）──────────
rowById(ctx, 'ui-tweak-fullscreen-alpha').options.inject().set('fullscreenAlpha', 0.8);
css = cssOf('effect');
check('放大态 80%：底色变 rgba', /--dsh-ui-tweak-fs-fill:rgba\(27, 27, 28, 0\.8\)/.test(css));
const FS_PANE = '[data-sidebar-right-panel=fullscreen][data-sidebar-right-open] [data-dockkit-pane]';
check('放大态 80%：保底模糊落在 pane 的 ::before 上', /backdrop-filter:blur\(48px\)/.test(ruleBody(css, `${FS_PANE}::before`)), ruleBody(css, `${FS_PANE}::before`));
check('放大态 80%：面板本身仍不含 backdrop-filter', !FORBIDDEN.test(ruleBody(css, PANEL_RULE)));
// 旋钮为 0 时放大态仍有硬保底 32px
rowById(ctx, 'ui-tweak-glass').options.inject().set('glass', 0);
check('模糊=0 但放大态半透明：pane 上仍有 32px 硬保底', /backdrop-filter:blur\(32px\)/.test(ruleBody(cssOf('effect'), `${FS_PANE}::before`)), ruleBody(cssOf('effect'), `${FS_PANE}::before`));
check('模糊=0：普通态 pane 不加模糊', !cssOf('effect').includes('[data-sidebar-right-panel] [data-dockkit-pane]::before'));

// ── 4. 恢复默认 ─────────────────────────────────────────────────────────
rowById(ctx, 'ui-tweak-reset').options.inject().reset();
const saved = JSON.parse(localStorageData.get('dsh-plugin-ui-tweak'));
check('恢复默认后回到出厂值', saved.bgAlpha === 1 && saved.glass === 24 && saved.fullscreenAlpha === 1, JSON.stringify(saved));

// ── 5. 依赖模块全缺失（降级） ────────────────────────────────────────────
const bare = makeCtx();
let thrown = null;
try {
	entry.factory(() => {
		throw new Error('module not in table');
	}).apply(bare);
} catch (error) {
	thrown = error;
}
check('三个依赖模块全缺失时 apply 仍不抛', thrown === null, String(thrown));
check('降级时设置行不注册（只是少个界面）', bare.registry.length === 0);
check('降级时样式表照样注入（视觉部分不依赖任何模块）', cssOf('effect').includes('--dsw-alias-bg-base'));

// ── 6. ctx.inject 不存在 ────────────────────────────────────────────────
thrown = null;
try {
	entry.factory(() => {
		throw new Error('nope');
	}).apply(makeCtx({ withInject: false }));
} catch (error) {
	thrown = error;
}
check('ctx.inject 不存在时不抛', thrown === null, String(thrown));

// ── 7. 子作用域里服务缺失 ───────────────────────────────────────────────
thrown = null;
try {
	const partial = makeCtx();
	partial.inject = (_deps, callback) => {
		callback({ effect() {}, slots: void 0, locale: void 0 });
		return { state: 'active' };
	};
	entry.factory(() => {
		throw new Error('nope');
	}).apply(partial);
} catch (error) {
	thrown = error;
}
check('子作用域里服务缺失时不抛', thrown === null, String(thrown));

// ── 8. 热重载不叠加样式表 ───────────────────────────────────────────────
const again = entry.factory((specifier) => {
	if (specifier === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
	throw new Error('nope');
}).apply;
again(makeCtx());
again(makeCtx());
check('重复 apply 不叠加样式表', head.children.filter((child) => child.dataset.plugin === 'dsh-plugin-ui-tweak').length === 2, String(head.children.length));

// ── 输出 ─────────────────────────────────────────────────────────────────
let failed = 0;
for (const result of results) {
	if (!result.ok) failed++;
	console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.label}${result.ok || !result.detail ? '' : '  → ' + result.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
if (process.env.DUMP_CSS) console.log('\n--- effect.css ---\n' + cssOf('effect'));
process.exit(failed === 0 ? 0 : 1);
