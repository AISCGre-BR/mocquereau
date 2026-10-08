// src/renderer/components/sources/ResizeImageDialog.tsx
//
// Asks before resizing an image wider than 2000 px (D-07: never without consent).

import { useTranslation } from "react-i18next";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import type { AddPage } from "./useAddPage";

export function ResizeImageDialog({ addPage }: { addPage: AddPage }) {
  const { t } = useTranslation();
  const image = addPage.resizeCandidate;
  const answer = (a: "resize" | "keep" | "cancel") => void addPage.resolveResize(a);
  return (
    <Dialog
      open={image !== null}
      title={t("resizeImage.title", { width: image?.width ?? 0 })}
      onClose={() => answer("cancel")}
      onConfirm={() => answer("resize")}
      actions={
        <>
          <Button variant="elevated" onClick={() => answer("cancel")}>
            {t("resizeImage.cancel")}
          </Button>
          <Button variant="elevated" onClick={() => answer("keep")}>
            {t("resizeImage.keep")}
          </Button>
          <Button variant="filled" data-autofocus onClick={() => answer("resize")}>
            {t("resizeImage.resize")}
          </Button>
        </>
      }
    >
      {t("resizeImage.question")}
    </Dialog>
  );
}
