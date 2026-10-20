"use client";

import { useRef, useState } from "react";

/**
 * 后台三套表单（配置项、单价、单独限额）共用的校验做法：打开时不报错，保存键不因为没填完变灰；
 * 点保存时有不对的地方，就一次标出所有不对的项，焦点移到第一个；之后改一项，那一项的提示跟着更新。
 * 每次打开表单重新开始（调用方 `reset`，或者按打开次数换 key）。
 *
 * `ref` 挂在表单（或对话框内容）的外层，`refuse()` 在点保存而有问题时调用，`shown` 为 true 时才显示问题。
 */
export function useSubmitCheck<T extends HTMLElement = HTMLElement>() {
  const [shown, setShown] = useState(false);
  const ref = useRef<T>(null);
  return {
    ref,
    shown,
    refuse() {
      setShown(true);
      // 等出错的提示渲染出来、aria-invalid 标上之后再移焦点。
      requestAnimationFrame(() => focusFirstInvalid(ref.current));
    },
    reset: () => setShown(false),
  };
}

/** 焦点移到 `root` 里按文档顺序第一个标了 aria-invalid 的项；是一组单选时，移到选中的那一个。 */
export function focusFirstInvalid(root: HTMLElement | null) {
  const invalid = root?.querySelector<HTMLElement>("[aria-invalid='true']");
  if (!invalid) return;
  const target = invalid.matches("input, textarea, select, button")
    ? invalid
    : (invalid.querySelector<HTMLElement>("[aria-checked='true'], input:checked") ??
      invalid.querySelector<HTMLElement>("input:not([disabled]), button:not([disabled]), [tabindex='0']"));
  (target ?? invalid).focus();
}
