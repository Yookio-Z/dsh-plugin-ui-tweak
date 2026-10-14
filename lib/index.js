/**
 * dsh-plugin-ui-tweak — 宿主半片。
 *
 * 故意留空：本插件要改的东西（透明度 / 毛玻璃 / 放大态底色 / 缩放）全在浏览器里，
 * 宿主侧唯一的作用是给 Loader 一个「行」，这样 package.json 里声明的
 * `dsh.client` 才会被 dsh-client-modules 扫到并把 lib/client.js 送进页面。
 *
 * 两条纪律（和浏览器半片一样，见 client.js 文件头）：
 *   1. 这个 apply 永远不能抛异常 —— 宿主的启动审计同样会因为「条目没激活」而让
 *      整个 DSH 起不来；这里不做任何事，就是它最安全的样子。
 *   2. 不声明 inject：本插件不依赖任何宿主服务。
 *
 * 宿主侧改代码要重启 DSH 才生效；浏览器半片不用（见 README）。
 */

/** Host plugin body — this package contributes browser-only presentation. */
export function apply() {}
