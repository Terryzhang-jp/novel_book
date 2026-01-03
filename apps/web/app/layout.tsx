import "@/styles/globals.css";
import "@/styles/prosemirror.css";
import 'katex/dist/katex.min.css';

// Fontsource 本地字体
// 中文字体
import '@fontsource/zcool-kuaile';
import '@fontsource/zcool-xiaowei';
import '@fontsource/liu-jian-mao-cao';
import '@fontsource/noto-sans-sc';
import '@fontsource/noto-serif-sc';
import '@fontsource/ma-shan-zheng';

// 日语字体
import '@fontsource/noto-sans-jp';
import '@fontsource/noto-serif-jp';
import '@fontsource/zen-maru-gothic';

// 英文字体
import '@fontsource/playfair-display';
import '@fontsource/dancing-script';

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
      <body className="font-xiaowei">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

