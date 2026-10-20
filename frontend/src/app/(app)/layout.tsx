import "../globals.css";

import type { Metadata } from "next";
import { LINE_Seed_JP, Noto_Sans_SC } from "next/font/google";

import { copy } from "@/i18n";
import { LIST_WIDTH_SCRIPT } from "@/lib/panelSizes";

// 中文正文用 Noto Sans SC，她的日语原文用 LINE Seed JP（经 <Ja> 取用）。
// 两者都是很大的 CJK 字体，Google Fonts 按 unicode-range 切片按需下载；不预载，避免首屏拉整套字。
// 每个字重的每个切片各一条 @font-face，都在阻塞渲染的 CSS 里。Noto Sans SC 不给字重就是可变字体（wght 100–900），
// 一套切片覆盖界面用到的 400–700，它的 @font-face 少四分之三。
const zh = Noto_Sans_SC({ subsets: ["latin"], variable: "--font-zh", preload: false });
// 日语只用到 400（<Ja> 外面最粗是 font-medium，在 400/700 里本来就取 400），不载 700，它的 @font-face 少一半。
// LINE Seed JP 在 next/font 里没有 fallback 度量，构建时会提示一句，无害。
const ja = LINE_Seed_JP({ weight: "400", subsets: ["latin"], variable: "--font-ja", preload: false });

export const metadata: Metadata = {
  title: copy.app.name,
  description: copy.app.description,
};

/**
 * <head> 里的内联脚本在页面画出来之前把对话列表上次拖到的宽度写到 <html> 的 --list-width 上（panelSizes.ts），
 * 水合前的列表按它排，不会先按默认宽度画出来再跳；这个 style 不是 React 渲染的，所以 <html> 不比对它。
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${zh.variable} ${ja.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LIST_WIDTH_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
