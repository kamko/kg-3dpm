"use client";

import { AlertCircle, LoaderCircle, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { PriceBreakdown } from "@/components/price-breakdown";
import { calculatePricing } from "@/lib/pricing";
import type { Artifact, Filament, Task } from "@/lib/types";
import { formatCurrency, formatDateTime, publicFilamentLabel } from "@/lib/utils";

type UserRequestFormProps = {
  filaments: Filament[];
  machineHourPrice: number;
};

type FormState = {
  modelName: string;
  sourceUrl: string;
  filamentId: string;
  quantity: string;
  note: string;
};

const initialFormState = (filamentId?: number): FormState => ({
  modelName: "",
  sourceUrl: "",
  filamentId: filamentId ? String(filamentId) : "",
  quantity: "1",
  note: "",
});

export function UserRequestForm({
  filaments,
  machineHourPrice,
}: UserRequestFormProps) {
  const [form, setForm] = useState<FormState>(initialFormState(filaments[0]?.id));
  const [modelFiles, setModelFiles] = useState<File[]>([]);
  const [confirmation, setConfirmation] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<"estimate" | "send" | null>(
    null,
  );
  const [, setIsRefreshingEstimate] = useState(false);

  const selectedFilament =
    filaments.find((filament) => filament.id === Number(form.filamentId)) ??
    filaments[0];
  const quantity = Number(form.quantity);

  const confirmedFilament = confirmation
    ? filaments.find((filament) => filament.id === confirmation.filamentId) ?? null
    : null;
  const confirmedBreakdown =
    confirmation &&
    confirmation.estimateState === "ready" &&
    confirmation.weightGrams !== null &&
    confirmation.durationMinutes !== null &&
    confirmedFilament
      ? calculatePricing({
          weightGrams: confirmation.weightGrams,
          durationMinutes: confirmation.durationMinutes,
          quantity: confirmation.quantity,
          pricePerKg: confirmedFilament.pricePerKg,
          machineHourPrice,
        })
      : null;

  const isDraft = confirmation?.submissionState === "draft";
  const isSubmitted = confirmation?.submissionState === "submitted";
  const isEstimatePending = Boolean(
    confirmation && isDraft && confirmation.estimateState === "pending",
  );
  const isEstimateReadyToSend = Boolean(
    confirmation && isDraft && confirmation.estimateState === "ready",
  );
  const isEstimateFailed = Boolean(
    confirmation && isDraft && confirmation.estimateState === "failed",
  );
  const isSendingRequest = activeAction === "send";
  const canResetWorkflow = Boolean(
    confirmation && (isEstimateReadyToSend || isEstimateFailed || isSubmitted),
  );

  const canCreateEstimate =
    !confirmation &&
    Boolean(selectedFilament) &&
    quantity > 0 &&
    modelFiles.length > 0;
  const hasMixedModelSelection =
    modelFiles.length > 1 &&
    modelFiles.some((file) => !file.name.toLowerCase().endsWith(".stl"));
  const selectionError = hasMixedModelSelection
    ? "Multiple-file upload is supported for STL files only."
    : null;

  const priceDescription = confirmation
    ? isEstimatePending
      ? "The slicer is running now. Pricing will fill in as soon as the estimate is ready."
      : isEstimateFailed
        ? "The estimate could not be completed automatically yet."
        : isSubmitted
          ? "This is the estimate that was sent with the request."
          : "Review the estimate, then send the request when it looks right."
    : "Choose a model file to run a real slicer estimate.";

  const pricePendingLabel = confirmation
    ? isEstimatePending
      ? "Calculating..."
      : isEstimateFailed
        ? "Needs review"
        : null
    : "Estimate first";

  const activeFilamentForPricing = confirmedFilament ?? selectedFilament ?? null;
  const priceFilamentLabel = activeFilamentForPricing
    ? publicFilamentLabel(activeFilamentForPricing)
    : null;
  const priceFilamentPerKg = activeFilamentForPricing?.pricePerKg ?? null;
  const priceMaterialCost = confirmation
    ? confirmedBreakdown?.materialCost ?? null
    : null;
  const priceMachineCost = confirmation
    ? confirmedBreakdown?.machineCost ?? null
    : null;
  const priceTotal = confirmation
    ? confirmedBreakdown?.estimatedPrice ?? confirmation.estimatedPrice ?? null
    : null;

  const fileLabel =
    modelFiles.length === 0
      ? "No file selected"
      : modelFiles.length === 1
        ? modelFiles[0]?.name ?? "1 file"
        : `${modelFiles.length} STL files`;

  useEffect(() => {
    if (!confirmation || confirmation.submissionState !== "draft") {
      return;
    }

    if (confirmation.estimateState !== "pending") {
      return;
    }

    const interval = window.setInterval(() => {
      void (async () => {
        setIsRefreshingEstimate(true);

        try {
          const response = await fetch(`/api/tasks/${confirmation.id}`, {
            cache: "no-store",
          });

          if (!response.ok) {
            return;
          }

          const data = (await response.json()) as { task?: Task };
          if (!data.task) {
            return;
          }

          setConfirmation(data.task);
          if (data.task.estimateState !== "pending") {
            setIsRefreshingEstimate(false);
          }
        } finally {
          setActiveAction(null);
        }
      })();
    }, 2500);

    return () => window.clearInterval(interval);
  }, [confirmation]);

  const resetWorkflow = () => {
    setConfirmation(null);
    setError(null);
    setModelFiles([]);
    setIsRefreshingEstimate(false);
    setActiveAction(null);
    setForm(initialFormState(selectedFilament?.id ?? filaments[0]?.id));
  };

  const handleEstimateSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!selectedFilament) {
      setError("No material is currently available for new requests.");
      return;
    }

    if (!canCreateEstimate) {
      setError("Upload an STL or 3MF file to continue.");
      return;
    }

    if (hasMixedModelSelection) {
      setError(selectionError);
      return;
    }

    setActiveAction("estimate");

    try {
      const artifacts: Artifact[] = [];

      for (const modelFile of modelFiles) {
        const uploadBody = new FormData();
        uploadBody.set("file", modelFile);

        const uploadResponse = await fetch("/api/uploads", {
          method: "POST",
          body: uploadBody,
        });

        const uploadData = (await uploadResponse.json()) as {
          error?: string;
          artifact?: Artifact;
        };

        if (!uploadResponse.ok || !uploadData.artifact) {
          setError(uploadData.error ?? "The model file could not be uploaded.");
          return;
        }

        artifacts.push(uploadData.artifact);
      }

      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "upload",
          name: form.modelName,
          sourceUrl: form.sourceUrl,
          filamentId: selectedFilament.id,
          sourceArtifactIds: artifacts.map((artifact) => artifact.id),
          quantity,
          note: form.note,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        task?: Task;
      };

      if (!response.ok || !data.task) {
        setError(data.error ?? "The request could not be created.");
        return;
      }

      setConfirmation(data.task);
      setForm({
        modelName: data.task.nameOrLink,
        sourceUrl: data.task.sourceUrl ?? "",
        filamentId: String(data.task.filamentId),
        quantity: String(data.task.quantity),
        note: data.task.note,
      });
    } finally {
      setActiveAction(null);
    }
  };

  const handleSendRequest = async () => {
    if (!confirmation) {
      return;
    }

    setError(null);
    setActiveAction("send");

    try {
      const response = await fetch(`/api/tasks/${confirmation.id}/submit`, {
        method: "POST",
      });

      const data = (await response.json()) as {
        error?: string;
        task?: Task;
      };

      if (!response.ok || !data.task) {
        setError(data.error ?? "The request could not be sent.");
        return;
      }

      setConfirmation(data.task);
    } finally {
      setActiveAction(null);
    }
  };

  const saveDraftDetails = async (nextForm = form) => {
    if (!confirmation || confirmation.submissionState !== "draft") {
      return;
    }

    try {
      const response = await fetch(`/api/tasks/${confirmation.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nameOrLink: nextForm.modelName.trim() || confirmation.nameOrLink,
          sourceUrl: nextForm.sourceUrl.trim() || null,
          note: nextForm.note,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        task?: Task;
      };

      if (!response.ok || !data.task) {
        throw new Error(data.error ?? "Unable to save request details.");
      }

      setConfirmation(data.task);
      setForm((current) => ({
        ...current,
        modelName: data.task?.nameOrLink ?? current.modelName,
        sourceUrl: data.task?.sourceUrl ?? "",
        note: data.task?.note ?? current.note,
      }));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save request details.");
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_360px]">
      <form className="surface flex flex-col gap-5 p-5 sm:p-7" onSubmit={handleEstimateSubmit}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <label className="space-y-2">
            <FieldLabel label="Filament" required />
            <select
              className="field"
              disabled={Boolean(confirmation)}
              value={form.filamentId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  filamentId: event.target.value,
                }))
              }
            >
              {filaments.map((filament) => (
                <option key={filament.id} value={filament.id}>
                  {publicFilamentLabel(filament)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <FieldLabel label="Quantity" required />
            <input
              className="field"
              disabled={Boolean(confirmation)}
              inputMode="numeric"
              min="1"
              placeholder="1"
              value={form.quantity}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  quantity: event.target.value,
                }))
              }
            />
          </label>
        </div>

        <div className="rounded-[24px] border border-border/80 bg-white/72 p-4">
          <div className="space-y-1">
            <FieldLabel label="Model file" required />
            <p className="text-sm text-muted-foreground">
              Upload one 3MF, or one or more STL files, to generate the estimate.
            </p>
          </div>

          <div className="mt-4 rounded-[20px] border border-border/70 bg-background px-4 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-medium text-foreground">{fileLabel}</p>
                <p className="text-sm text-muted-foreground">STL or 3MF, up to 100 MB each</p>
              </div>
              <label className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-white px-4 text-sm font-medium text-foreground transition hover:border-accent/30 hover:bg-accent/5">
                <input
                  accept=".stl,.3mf"
                  className="sr-only"
                  disabled={Boolean(confirmation)}
                  type="file"
                  multiple
                  onChange={(event) => setModelFiles(Array.from(event.target.files ?? []))}
                />
                {confirmation
                  ? "Files locked"
                  : modelFiles.length > 0
                    ? "Replace files"
                    : "Choose files"}
              </label>
            </div>

            {modelFiles.length > 1 ? (
              <div className="mt-4 rounded-2xl border border-border/70 bg-white/82 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Included files
                </p>
                <ul className="mt-2 space-y-1 text-sm text-foreground">
                  {modelFiles.map((file) => (
                    <li key={`${file.name}-${file.size}`}>{file.name}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[24px] border border-border/80 bg-white/72 p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Optional details</p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <FieldLabel label="Name" optional />
              <input
                className="field"
                placeholder="Ruins Frame"
                value={form.modelName}
                onBlur={() => void saveDraftDetails()}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    modelName: event.target.value,
                  }))
                }
              />
            </label>

            <label className="space-y-2">
              <FieldLabel label="Reference link" optional />
              <input
                className="field"
                inputMode="url"
                placeholder="https://makerworld.com/..."
                value={form.sourceUrl}
                onBlur={() => void saveDraftDetails()}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sourceUrl: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <label className="mt-4 block space-y-2">
            <FieldLabel label="Note for the print shop" optional />
            <textarea
              className="field-area"
              placeholder="Orientation, supports, deadline, or anything else we should know."
              value={form.note}
              onBlur={() => void saveDraftDetails()}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
            />
          </label>

          <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4">
            <p className="text-xs text-muted-foreground">
              {confirmation
                ? isSubmitted
                  ? "This request is already sent. Start over to estimate a new file."
                  : isEstimateReadyToSend
                    ? "Your estimate is ready. Review the price in the sidebar, then send the request."
                    : isEstimateFailed
                      ? "The estimate needs manual review before it can be sent."
                  : "Filament, quantity, and files are locked after estimation starts."
                : "Review the estimate before anything is sent."}
            </p>

            {!confirmation ? (
              <button
                className="inline-flex h-12 min-w-40 self-end items-center justify-center rounded-full bg-foreground px-7 text-sm font-medium text-white transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-foreground/30"
                disabled={!canCreateEstimate || Boolean(activeAction)}
                type="submit"
              >
                {activeAction === "estimate" ? "Estimating..." : "Estimate cost"}
              </button>
            ) : canResetWorkflow ? (
                <button
                  className="inline-flex h-11 min-w-40 self-end items-center justify-center rounded-full border border-border bg-white px-6 text-sm font-medium text-foreground transition hover:border-accent/30 hover:bg-accent/5"
                  type="button"
                  onClick={resetWorkflow}
                >
                  {isSubmitted ? "Create another" : "Start over"}
                </button>
            ) : null}
          </div>
        </div>

        {confirmation && isEstimateFailed && confirmation.estimateError ? (
          <ErrorPanel message={confirmation.estimateError} />
        ) : null}
        {selectionError ? <ErrorPanel message={selectionError} /> : null}
        {error && error !== selectionError ? <ErrorPanel message={error} /> : null}

        {confirmation && isSubmitted ? (
          <div className="rounded-[24px] border border-emerald-200 bg-success-soft p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              What happened
            </p>
            <div className="mt-3 space-y-3 text-sm text-foreground">
              <TimelineRow
                title="Details received"
                description={`Saved on ${formatDateTime(confirmation.createdAt)}.`}
              />
              <TimelineRow
                title="Slicer estimate completed"
                description={
                  confirmation.estimatedPrice !== null
                    ? `Estimated total ${formatCurrency(
                        confirmation.estimatedPrice,
                      )}.`
                    : "The estimate was captured successfully."
                }
              />
              <TimelineRow
                title="Request sent"
                description={`Sent on ${formatDateTime(
                  confirmation.submittedAt ?? confirmation.createdAt,
                )}.`}
              />
            </div>
          </div>
        ) : null}
      </form>

      <div className="flex flex-col gap-4 lg:sticky lg:top-5 lg:self-start">
        <PriceBreakdown
          description={priceDescription}
          filamentLabel={priceFilamentLabel}
          filamentPricePerKg={priceFilamentPerKg}
          filamentUsageGrams={confirmation?.weightGrams ?? null}
          machineCost={priceMachineCost}
          materialCost={priceMaterialCost}
          total={priceTotal}
          pendingLabel={pricePendingLabel}
          totalAction={
            confirmation && !isSubmitted ? (
              <button
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-white transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-foreground/30"
                disabled={!isEstimateReadyToSend || isSendingRequest}
                type="button"
                onClick={handleSendRequest}
              >
                {isSendingRequest ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Sending request...
                  </>
                ) : (
                  <>
                    <Send className="size-4" />
                    Send request
                  </>
                )}
              </button>
            ) : null
          }
        />
        <div className="surface-muted p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Current machine rate
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">
            {formatCurrency(machineHourPrice)}
            <span className="ml-1 text-base font-medium text-muted-foreground">
              / hour
            </span>
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Machine time is billed from the slicer estimate.
          </p>
        </div>
      </div>
    </section>
  );
}

function FieldLabel(props: { label: string; required?: boolean; optional?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
      <span>{props.label}</span>
      {props.required ? <span className="text-accent">*</span> : null}
      {props.optional ? (
        <span className="text-xs font-medium text-muted-foreground">optional</span>
      ) : null}
    </span>
  );
}

function ErrorPanel(props: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-danger-soft px-4 py-3 text-sm text-foreground">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
      <p>{props.message}</p>
    </div>
  );
}

function TimelineRow(props: { title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-foreground" />
      <div>
        <p className="font-medium text-foreground">{props.title}</p>
        <p className="mt-1 text-muted-foreground">{props.description}</p>
      </div>
    </div>
  );
}
