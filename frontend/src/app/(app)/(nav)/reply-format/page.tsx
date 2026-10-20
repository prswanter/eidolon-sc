import { ReplyFormatEditor } from "@/components/editor/ReplyFormatEditor";

/** 回复格式编辑（`/reply-format`）：导航外壳里的一栏，和礼物、设置同一层，没有第二级。改的是每轮提示词最后那几段。 */
export default function ReplyFormat() {
  return <ReplyFormatEditor />;
}
