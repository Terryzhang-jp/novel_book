/**
 * 字体按需加载注册表
 *
 * ## 为什么需要这个
 *
 * 此前 11 个 Fontsource 字体全部在 `app/layout.tsx` 里同步 import。
 * 实测后果（PERFORMANCE-AUDIT.md Q6）：
 *
 *   根 layout 的 CSS = 12 个文件 / 967 条 @font-face / 1,055 KB 原始 / 305 KB gzip
 *   而其中 927 KB（88%）是纯字体声明，应用自己的样式只有 128 KB。
 *
 * 这些 CSS 是**渲染阻塞**的，且**每一个页面**都要加载。在 /login 上，
 * 它占了总传输量 472 KB 中的 315 KB（67%）——CSS 比 JS 还重 2.2 倍。
 *
 * 注意一个反直觉的事实：**字体文件本身不是问题**。Fontsource 用
 * unicode-range 做了子集切分，浏览器只下载页面实际用到字符所在的子集，
 * 实测每页只下载 1 个 14 KB 的 woff2。问题出在**描述字体的 CSS**。
 *
 * ## 方案
 *
 * 只有正文字体（ZCOOL XiaoWei）留在根 layout 全局加载。
 * 其余 10 个改成用 `import()` 动态加载 —— webpack 会把每个字体的 CSS
 * 切成独立 chunk，只有真正调用 loadFontFamily() 时才通过 <link> 注入。
 *
 * 使用场景：Canvas / 海报 的字体选择器，用户选中某字体时才加载它。
 */

import { JOURNAL_FONTS, type JournalFont } from "@/types/storage";

/** 全局始终可用、无需按需加载的字体（在 app/layout.tsx 里静态 import） */
export const GLOBAL_FONT: JournalFont = "ZCOOL XiaoWei";

/**
 * 字体名 → 动态 import。
 *
 * 必须写成字面量 import()，不能拼字符串——webpack 需要在构建期
 * 静态分析出模块路径才能切 chunk。
 */
const LOADERS: Record<string, () => Promise<unknown>> = {
  // 中文
  "ZCOOL KuaiLe": () => import("@fontsource/zcool-kuaile"),
  "Liu Jian Mao Cao": () => import("@fontsource/liu-jian-mao-cao"),
  "Noto Sans SC": () => import("@fontsource/noto-sans-sc"),
  "Noto Serif SC": () => import("@fontsource/noto-serif-sc"),
  "Ma Shan Zheng": () => import("@fontsource/ma-shan-zheng"),
  // 日文
  "Noto Sans JP": () => import("@fontsource/noto-sans-jp"),
  "Noto Serif JP": () => import("@fontsource/noto-serif-jp"),
  "Zen Maru Gothic": () => import("@fontsource/zen-maru-gothic"),
  // 英文
  "Playfair Display": () => import("@fontsource/playfair-display"),
  "Dancing Script": () => import("@fontsource/dancing-script"),
};

/** 已发起加载的字体 → 其 Promise。保证同一字体只加载一次。 */
const inflight = new Map<string, Promise<void>>();

/** 已完成加载的字体 */
const loaded = new Set<string>([GLOBAL_FONT]);

export function isFontLoaded(family: string): boolean {
  return loaded.has(family);
}

export function listSelectableFonts(): readonly JournalFont[] {
  return JOURNAL_FONTS;
}

/**
 * 按需加载一个字体族。幂等；重复调用返回同一个 Promise。
 *
 * 加载完成后还会 await document.fonts.ready，确保调用方（尤其是
 * Konva 这种需要立刻测量文字宽度的场景）拿到的是字体真正可用的时刻，
 * 而不只是 CSS 注入完成的时刻。
 */
export async function loadFontFamily(family: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (loaded.has(family)) return;

  const existing = inflight.get(family);
  if (existing) return existing;

  const loader = LOADERS[family];
  if (!loader) {
    // 不在注册表里的字体（系统字体或拼写错误）当作已可用，不阻塞调用方
    loaded.add(family);
    return;
  }

  const task = (async () => {
    try {
      await loader();
      // CSS 注入 ≠ 字体可用。等浏览器真正把字形准备好。
      if (document.fonts?.load) {
        await document.fonts.load(`400 16px "${family}"`);
      }
      loaded.add(family);
    } catch (error) {
      console.warn(`[fonts] 加载字体失败: ${family}`, error);
      // 失败也标记为"已处理"，避免每次渲染都重试
      loaded.add(family);
    } finally {
      inflight.delete(family);
    }
  })();

  inflight.set(family, task);
  return task;
}

/**
 * 批量预加载 —— 用于打开字体选择器时把候选字体一次性拉起来。
 * 并发执行，失败不影响其他字体。
 */
export async function preloadFonts(families: readonly string[]): Promise<void> {
  await Promise.all(families.map((f) => loadFontFamily(f)));
}
