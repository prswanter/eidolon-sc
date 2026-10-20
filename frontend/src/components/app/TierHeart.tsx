import type { Heart } from "@/lib/affinity";
import { cn } from "@/lib/utils";
import { AffinityColdIcon, AffinityDistantIcon, AffinityHeartIcon } from "@/theme/icons";

const HEART_ICONS: Record<Heart, typeof AffinityHeartIcon> = {
  off: AffinityColdIcon,
  crack: AffinityDistantIcon,
  outline: AffinityHeartIcon,
  half: AffinityHeartIcon,
  filled: AffinityHeartIcon,
};

const SIZES = { badge: "size-5", small: "size-3.5" } as const;

/**
 * 五档的心形（DESIGN.md「Buttons」的好感度标识）：亲近是空心叠一层只露下半的实心，亲密是实心。
 * 页首标识里是她的颜色（`her`）、20px；送礼面板选人处是中性色（`neutral`，跟着文字色）、14px。
 */
export function TierHeart({
  heart,
  tone,
  size,
}: {
  heart: Heart;
  tone: "her" | "neutral";
  size: keyof typeof SIZES;
}) {
  const Icon = HEART_ICONS[heart];
  const look = cn(SIZES[size], tone === "her" && "text-her-mark");
  return (
    <span aria-hidden className="relative flex shrink-0">
      <Icon className={cn(look, heart === "filled" && "fill-current")} />
      {heart === "half" && (
        <AffinityHeartIcon className={cn(look, "absolute inset-0 fill-current [clip-path:inset(50%_0_0_0)]")} />
      )}
    </span>
  );
}
