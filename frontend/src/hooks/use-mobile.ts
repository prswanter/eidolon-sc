import { useMediaQuery } from "@/hooks/useMediaQuery"

const MOBILE_BREAKPOINT = 768

// eidolon: 原来自己在 effect 里订阅 matchMedia；改用项目的 useMediaQuery，判断窄屏只有一处写法。
// 服务端和水合时当作电脑宽度（和原来的初值 false 一样）。
export function useIsMobile() {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`, false)
}
