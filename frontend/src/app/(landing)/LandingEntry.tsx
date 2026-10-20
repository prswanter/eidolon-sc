"use client";

import { lazy, Suspense, useState } from "react";

// 登录面板（Dialog、登录组件、文案目录）不进首屏的包：指针移上去或聚焦时开始加载，点了才挂上。
const loadPanel = () => import("./SignInPanel");
const SignInPanel = lazy(loadPanel);

/**
 * 落地页的入口：访客点「登录」在落地页里弹出登录面板；已登录的用户（只在 `/about` 出现）是「继续」，
 * 回到对话列表。对话列表在应用的根 layout 下，用普通的 <a> 整页跳过去。
 *
 * 外观是 shadcn Button 的 `buttonVariants`，类名由服务端算好传进来（`className`）：首屏不带
 * Base UI 的 Button 和 cn，落地页自身的首屏 JS 才守得住预算（ADR-0016 修订）。
 */
export function LandingEntry({ isSignedIn, label, className }: { isSignedIn: boolean; label: string; className: string }) {
  const [open, setOpen] = useState(false);
  const [panelRequested, setPanelRequested] = useState(false);

  if (isSignedIn) {
    return (
      <a href="/conversations" className={className}>
        {label}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        className={className}
        aria-haspopup="dialog"
        onPointerEnter={loadPanel}
        onFocus={loadPanel}
        onClick={() => {
          setPanelRequested(true);
          setOpen(true);
        }}
      >
        {label}
      </button>
      {panelRequested && (
        <Suspense fallback={null}>
          <SignInPanel open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
}
