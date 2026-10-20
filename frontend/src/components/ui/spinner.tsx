import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-react"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    // eidolon: 原来是 role="status" aria-label="Loading"；界面只有中文，转圈都放在写着字的按钮里，读屏靠按钮的字，转圈本身藏起来。
    <Loader2Icon data-slot="spinner" aria-hidden="true" className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
