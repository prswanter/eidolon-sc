import type { ReactNode } from "react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { copy } from "@/i18n";
import { CloseIcon, SuccessIcon } from "@/theme/icons";

/** 操作成功的一句提示，可以关掉，下面可以再跟一句（`children`）。配置页的各张卡和单价卡共用。 */
export function Notice({ text, onDismiss, children }: { text: string; onDismiss: () => void; children?: ReactNode }) {
  return (
    <Alert role="status">
      <SuccessIcon />
      <AlertTitle>{text}</AlertTitle>
      {children && <AlertDescription>{children}</AlertDescription>}
      <AlertAction>
        <Button variant="ghost" size="icon-xs" aria-label={copy.common.close} onClick={onDismiss}>
          <CloseIcon />
        </Button>
      </AlertAction>
    </Alert>
  );
}
