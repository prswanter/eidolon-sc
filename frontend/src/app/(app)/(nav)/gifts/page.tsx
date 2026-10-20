import { GiftsPage } from "@/components/gifts/GiftsPage";
import { giftsFor } from "@/lib/gifts";

/** 礼物页（`/gifts`）：导航外壳里一栏，没有第二栏（DESIGN.md「礼物页」）。从对话页跳来时地址里带着预选的她。 */
export default async function Gifts({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <GiftsPage pick={giftsFor(await searchParams)} />;
}
