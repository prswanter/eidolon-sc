import { SheetEditor } from "@/components/editor/SheetEditor";

/** 人设卡编辑（`/sheets`）：导航外壳里的一栏，和礼物、设置同一层，没有第二级。改的是 characters/sheets 下的 Markdown。 */
export default function Sheets() {
  return <SheetEditor />;
}
