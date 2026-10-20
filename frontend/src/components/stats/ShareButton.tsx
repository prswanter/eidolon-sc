"use client";

// 转图用 modern-screenshot：把分享图的 DOM 连同应用字体一起画进 SVG 再转 PNG，应用字体里没有的字由浏览器的系统字体补上，
// 不用另做一套 canvas 排版；原型（票 05）里比过，导出正常、不缺字。二维码用 uqr：没有依赖，只给出模块矩阵，自己画成 SVG。

import { Share2Icon } from "lucide-react";
import { domToBlob } from "modern-screenshot";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useSettingsValues } from "@/components/settings/SettingsValues";
import { ShareCard } from "@/components/stats/ShareCard";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { copy } from "@/i18n";
import { getProfile, type Character } from "@/lib/api";
import { toFailure, type Failure } from "@/lib/failure";
import {
  SHARE_HEIGHT,
  SHARE_WIDTH,
  shareCard,
  shareFileName,
  siteAddress,
  type ShareCardContent,
  type SiteAddress,
} from "@/lib/shareCard";
import type { Stats } from "@/lib/stats";

const t = copy.settings.stats.share;

/** How long the downloaded picture's address is kept, for the browser to save it. */
const KEEP_DOWNLOAD_MS = 40_000;

type Making = { card: ShareCardContent; site: SiteAddress };

/**
 * 统计页页首末端的「分享」（DESIGN.md「分享图」）：点了在页面外画出当前跨度的分享图，转成 1080×1350 的 PNG 直接下载，
 * 不调用系统的分享面板。称呼取已保存的档案。生成中转圈、不可再点；没生成出来时由 `onFailure` 交给页面显示。
 */
export function ShareButton({
  stats,
  byId,
  disabled,
  onFailure,
}: {
  stats: Stats;
  byId: Map<string, Character>;
  disabled: boolean;
  onFailure: (failure: Failure | null) => void;
}) {
  const { profile } = useSettingsValues();
  const [making, setMaking] = useState<Making | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  /** The card being drawn: an effect run twice (Strict Mode) does not download it twice. */
  const drawing = useRef<Making | null>(null);

  async function share() {
    onFailure(null);
    setIsPreparing(true);
    try {
      const address = profile ? profile.saved.formOfAddress : (await getProfile()).form_of_address;
      const card = shareCard(stats, address);
      if (card) setMaking({ card, site: siteAddress(window.location.origin) });
    } catch (e) {
      onFailure(toFailure(e));
    } finally {
      setIsPreparing(false);
    }
  }

  useEffect(() => {
    if (!making || drawing.current === making) return;
    drawing.current = making;
    const node = cardRef.current;
    (node ? draw(node) : Promise.reject(new Error("no card")))
      .then(download)
      .catch(() => onFailure({ message: t.failed, signedOut: false }))
      .finally(() => {
        drawing.current = null;
        setMaking(null);
      });
  }, [making, onFailure]);

  const isBusy = isPreparing || making !== null;
  return (
    <>
      <Button variant="ghost" size="sm" onClick={share} disabled={disabled || isBusy} aria-busy={isBusy}>
        {isBusy ? <Spinner data-icon="inline-start" /> : <Share2Icon data-icon="inline-start" />}
        {t.button}
      </Button>
      {making &&
        createPortal(
          <div aria-hidden inert className="pointer-events-none fixed top-0 left-full">
            <ShareCard ref={cardRef} card={making.card} byId={byId} heatmap={stats.heatmap} site={making.site} />
          </div>,
          document.body,
        )}
    </>
  );
}

/** The card as a PNG, once its pictures are in and the fonts for every character on it are
 * loaded, in each weight it is set in. */
async function draw(node: HTMLElement): Promise<Blob> {
  await Promise.all([...node.querySelectorAll("img")].map((img) => img.decode().catch(() => {})));
  const family = getComputedStyle(node).fontFamily;
  const text = node.textContent ?? "";
  const weights = new Set([node, ...node.querySelectorAll("*")].map((el) => getComputedStyle(el).fontWeight));
  await Promise.all([...weights].map((weight) => document.fonts.load(`${weight} 16px ${family}`, text)));
  return domToBlob(node, { width: SHARE_WIDTH, height: SHARE_HEIGHT, scale: 1, type: "image/png" });
}

function download(png: Blob) {
  const url = URL.createObjectURL(png);
  const link = document.createElement("a");
  link.href = url;
  link.download = shareFileName(new Date());
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), KEEP_DOWNLOAD_MS);
}
