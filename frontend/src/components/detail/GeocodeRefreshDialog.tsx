"use client";

import type { SiteDetail } from "@/lib/api/types";
import { useDialogFocus } from "@/components/detail/useDialogFocus";

export function GeocodeRefreshDialog({
  site,
  open,
  onClose,
  onConfirm,
}: {
  site: SiteDetail;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useDialogFocus(open, onClose);
  if (!open) return null;
  return (
    <div className="detail-overlay" role="presentation">
      <section
        ref={dialogRef}
        className="detail-dialog confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="refresh-title"
        aria-describedby="refresh-description"
        tabIndex={-1}
      >
        <h2 id="refresh-title">Refresh geocoding for {site.name}?</h2>
        <p id="refresh-description">
          The current coordinates and both solar results are cleared before the lookup starts. If the lookup fails,
          the old values are not restored and there is no earlier version to fall back to.
        </p>
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onClose}>Keep as is</button>
          <button className="btn btn-danger" type="button" onClick={onConfirm}>Clear and refresh</button>
        </div>
      </section>
    </div>
  );
}
