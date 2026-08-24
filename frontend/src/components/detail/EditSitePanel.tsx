"use client";

import { useEffect, useState, type FormEvent } from "react";

import { TransitionLink } from "@/components/TransitionLink";
import {
  ApiError,
  type PatchValidationPayload,
  type SiteConflictPayload,
  type SitePatchInput,
} from "@/lib/api/client";
import type { SiteDetail } from "@/lib/api/types";
import { useDialogFocus } from "@/components/detail/useDialogFocus";

interface EditSitePanelProps {
  site: SiteDetail;
  open: boolean;
  onClose: () => void;
  onSave: (input: SitePatchInput) => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validationPayload(value: unknown): PatchValidationPayload | null {
  if (!isRecord(value) || !isRecord(value.errors)) return null;
  const errors: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(value.errors)) {
    if (Array.isArray(messages) && messages.every((message) => typeof message === "string")) {
      errors[field] = messages;
    }
  }
  return { detail: typeof value.detail === "string" ? value.detail : "The changes were not saved.", errors };
}

function conflictPayload(value: unknown): SiteConflictPayload | null {
  if (
    !isRecord(value) ||
    typeof value.detail !== "string" ||
    typeof value.conflict_site_id !== "number" ||
    typeof value.conflict_is_active !== "boolean"
  ) {
    return null;
  }
  return {
    detail: value.detail,
    conflict_site_id: value.conflict_site_id,
    conflict_is_active: value.conflict_is_active,
  };
}

export function EditSitePanel({ site, open, onClose, onSave }: EditSitePanelProps) {
  const [name, setName] = useState(site.name);
  const [address, setAddress] = useState(site.address);
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<PatchValidationPayload | null>(null);
  const [conflict, setConflict] = useState<SiteConflictPayload | null>(null);
  const [transportError, setTransportError] = useState(false);
  const dialogRef = useDialogFocus(open, onClose, !saving);

  useEffect(() => {
    if (!open) return;
    setName(site.name);
    setAddress(site.address);
    setSaving(false);
    setValidation(null);
    setConflict(null);
    setTransportError(false);
  }, [open, site]);

  if (!open) return null;

  const nameChanged = name !== site.name;
  const addressChanged = address !== site.address;
  const changed = nameChanged || addressChanged;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changed || saving) return;
    setSaving(true);
    setValidation(null);
    setConflict(null);
    setTransportError(false);
    const input: SitePatchInput = {};
    if (nameChanged) input.name = name;
    if (addressChanged) input.address = address;
    try {
      await onSave(input);
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        setValidation(validationPayload(error.payload));
      } else if (error instanceof ApiError && error.status === 409) {
        setConflict(conflictPayload(error.payload));
      } else {
        setTransportError(true);
      }
    } finally {
      setSaving(false);
    }
  }

  const fieldErrors = validation?.errors ?? {};
  const errorCount = Object.values(fieldErrors).reduce((total, messages) => total + messages.length, 0);

  return (
    <div className="detail-overlay" role="presentation">
      <section
        ref={dialogRef}
        className="detail-dialog edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-site-title"
        tabIndex={-1}
      >
        <form onSubmit={submit}>
          <div className="dialog-heading">
            <div>
              <h2 id="edit-site-title">Edit site</h2>
              <span className="mono">Site #{site.id} · active</span>
            </div>
            <button className="btn" type="button" onClick={onClose} disabled={saving} aria-label="Close edit panel">
              Close
            </button>
          </div>

          <div className="edit-field">
            <label htmlFor="edit-site-name">
              <span className="lbl">Display name</span>
            </label>
            <input
              id="edit-site-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
              aria-invalid={Boolean(fieldErrors.name)}
            />
          </div>
          {fieldErrors.name?.map((message) => <div className="field-error" key={message}>{message}</div>)}

          <div className="edit-field">
            <label htmlFor="edit-site-address">
              <span className="lbl">Address</span>
            </label>
            <input
              id="edit-site-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              disabled={saving}
              aria-invalid={Boolean(fieldErrors.address)}
            />
            <span className="mono field-note">Saved exactly as typed. Nothing is looked up while you type.</span>
          </div>
          {fieldErrors.address?.map((message) => <div className="field-error" key={message}>{message}</div>)}

          {validation && (
            <div className="inline-feedback feedback-fail" role="alert">
              <strong>{errorCount === 1 ? "One thing needs fixing" : `${errorCount} things need fixing`}</strong>
              {Object.entries(fieldErrors).map(([field, messages]) =>
                messages.map((message) => <div key={`${field}-${message}`}>{field.replaceAll("_", " ")}: {message}</div>),
              )}
              <span>Nothing was written and no lookup ran.</span>
            </div>
          )}

          {conflict && (
            <div className="inline-feedback feedback-fail" role="alert">
              <strong>That name and address pair already exists</strong>
              <span>Punctuation and capitalisation are ignored when comparing. Records are never merged automatically.</span>
              <span>{conflict.detail}</span>
              {conflict.conflict_is_active ? (
                <TransitionLink href={`/sites/${conflict.conflict_site_id}`} direction="forward">
                  Open site #{conflict.conflict_site_id} →
                </TransitionLink>
              ) : (
                <span className="mono">Conflicting inactive site #{conflict.conflict_site_id}</span>
              )}
            </div>
          )}

          {transportError && (
            <div className="inline-feedback feedback-fail" role="alert">
              <strong>The changes could not be saved</strong>
              <span>The application API did not return a usable response. No successful change is being shown.</span>
            </div>
          )}

          {saving ? (
            <div className="edit-progress" aria-live="polite">
              <strong>{addressChanged ? "Reprocessing — this can take a few seconds" : "Saving display changes…"}</strong>
              {addressChanged && (
                <div className="progress-steps">
                  <span><b>1 · Looking up address</b><small>in progress</small></span>
                  <span><b>2 · Solar resource</b><small>waiting</small></span>
                  <span><b>3 · PVWatts</b><small>waiting</small></span>
                </div>
              )}
              <span className="mono field-note">Repeat submissions are ignored while this runs.</span>
            </div>
          ) : addressChanged ? (
            <div className="edit-cost cost-clears">
              <strong>Address changed · may clear results</strong>
              <span>If the normalized address changed, coordinates and both solar results are cleared before the address is looked up again.</span>
              <span>Punctuation- or capitalisation-only edits are stored without reprocessing; the backend makes that final comparison.</span>
            </div>
          ) : nameChanged ? (
            <div className="edit-cost cost-keeps">
              <strong>Name only · keeps results</strong>
              <span>Coordinates and both solar results are kept. No provider is called.</span>
            </div>
          ) : (
            <p className="unchanged-copy">No changes yet — saving now would do nothing at all.</p>
          )}

          <div className="dialog-actions">
            <button className="btn" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={!changed || saving}>
              {saving ? "Saving…" : addressChanged ? "Save and reprocess" : "Save changes"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
