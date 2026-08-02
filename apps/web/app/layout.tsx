import "@/styles/globals.css";
import "@/styles/prosemirror.css";
// katex CSS 已移到 components/tailwind/extensions.ts —— 只有编辑器页面需要它，
// 放在根 layout 会让每个页面都背上这份样式。

// ─────────────────────────────────────────────────────────────────────
// 字体：只有正文字体在这里全局加载
//
// 此前 11 个 Fontsource 字体全部在这里同步 import，展开成 12 个 CSS 文件、
// 967 条 @font-face、305 KB gzip 的渲染阻塞 CSS —— 而且每个页面都要加载。
// 实测在 /login 上占了总传输量的 67%（PERFORMANCE-AUDIT.md Q6）。
//
// 其余 10 个字体改为按需加载，见 lib/fonts/registry.ts。
// 需要用到它们的地方（Canvas / 海报的字体选择器）调用 loadFontFamily()。
//
// ⚠️ 在这里新增 @fontsource import 之前请三思：每加一个中日文字体，
//    全站每个页面的首屏就多约 30 KB gzip 的阻塞 CSS。
// ─────────────────────────────────────────────────────────────────────
import '@fontsource/zcool-xiaowei';

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Providers from "./providers";

const title = "Novel - Notion-style WYSIWYG editor with AI-powered autocompletions";
const description =
  "Novel is a Notion-style WYSIWYG editor with AI-powered autocompletions. Built with Tiptap, OpenAI, and Vercel AI SDK.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
  },
  twitter: {
    title,
    description,
    card: "summary_large_image",
    creator: "@steventey",
  },
  metadataBase: new URL("https://novel.sh"),
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 不再需要 Google Fonts CDN，使用本地 Fontsource */}
      </head>
      {/* 正文用系统字体栈（tailwind.config.ts 的 sans），不加载网络字体 */}
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

