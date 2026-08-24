"use client";

import { useState } from "react";

import { useDialogFocus } from "@/components/detail/useDialogFocus";
import {
  ApiError,
  ERROR_KIND_PHRASE,
  apiClient,
  type ImportResult,
  type SiteImportRow,
} from "@/lib/api/client";

type Phase = "form" | "submitting" | "result";

/**
 * The browser front door for the site-list import. It reads an uploaded JSON
 * file and adds new sites, reactivating any that match by name and address.
 * Sync — which deactivates sites omitted from a file — is deliberately
 * terminal-only (the `import_sites --sync` command) and never offered here.
 */
export function UploadSitesDialog({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const dialogRef = useDialogFocus(open, onClose);
  const [rows, setRows] = useState<SiteImportRow[] | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  if (!open) return null;

  function reset() {
    setRows(null);
    setPhase("form");
    setError(null);
    setResult(null);
  }

  function close() {
    reset();
    onClose();
  }

  function finish() {
    onComplete();
    close();
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setRows(null);
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) {
        setError("The file must contain a JSON array of sites.");
        return;
      }
      setRows(parsed as SiteImportRow[]);
    } catch {
      setError("That file is not valid JSON.");
    }
  }

  async function submit() {
    if (rows === null) return;
    setPhase("submitting");
    setError(null);
    try {
      const outcome = await apiClient.importSites(rows);
      setResult(outcome);
      setPhase("result");
    } catch (caught) {
      const message =
        caught instanceof ApiError && caught.kind === "http"
          ? importErrorDetail(caught)
          : `The upload failed (${caught instanceof ApiError ? ERROR_KIND_PHRASE[caught.kind] : "network error"}).`;
      setError(message);
      setPhase("form");
    }
  }

  const busy = phase === "submitting";

  return (
    <div className="detail-overlay" role="presentation">
      <section
        ref={dialogRef}
        className="detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-title"
        tabIndex={-1}
      >
        {phase === "result" && result ? (
          <ResultView result={result} onDone={finish} />
        ) : (
          <>
            <h2 id="upload-title">Upload site list</h2>
            <p style={{ margin: "9px 0 0", color: "var(--muted)", fontSize: 12.5 }}>
              A JSON array of objects with <code>name</code> and <code>address</code>.
              New sites are geocoded and scored on upload; sites that match an
              existing name and address are reactivated.
            </p>

            <input
              className="upload-file"
              type="file"
              accept="application/json,.json"
              onChange={onFileChange}
              disabled={busy}
              aria-label="Site list JSON file"
            />

            {error ? (
              <p className="upload-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="dialog-actions">
              <button className="btn" type="button" onClick={close} disabled={busy}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void submit()}
                disabled={busy || rows === null}
              >
                {busy ? "Uploading…" : "Upload"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function ResultView({ result, onDone }: { result: ImportResult; onDone: () => void }) {
  return (
    <>
      <h2 id="upload-title">Import complete</h2>
      <p style={{ margin: "9px 0 0", color: "var(--muted)", fontSize: 12.5 }}>
        {result.summary}
      </p>
      {result.notices.length > 0 ? (
        <ul className="upload-notices">
          {result.notices.map((notice, index) => (
            <li key={index} data-kind={notice.kind}>
              {notice.message}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="dialog-actions">
        <button className="btn btn-primary" type="button" onClick={onDone}>
          Done
        </button>
      </div>
    </>
  );
}

/** Prefer the backend's safe `detail` message, falling back to a generic one. */
function importErrorDetail(error: ApiError): string {
  const payload = error.payload;
  if (
    payload &&
    typeof payload === "object" &&
    "detail" in payload &&
    typeof (payload as { detail: unknown }).detail === "string"
  ) {
    return (payload as { detail: string }).detail;
  }
  return "The upload was rejected by the server.";
}
