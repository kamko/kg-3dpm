"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileUp,
  LoaderCircle,
  Package2,
  Send,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { PriceBreakdown } from "@/components/price-breakdown";
import { calculatePricing, parseDurationInput } from "@/lib/pricing";
import type { Artifact, Filament, Task } from "@/lib/types";
import {
  cn,
  formatCurrency,
  formatDateTime,
  formatDuration,
  formatGrams,
  publicFilamentLabel,
} from "@/lib/utils";

type UserRequestFormProps = {
  filaments: Filament[];
  machineHourPrice: number;
};

type FormState = {
  nameOrLink: string;
  filamentId: string;
  weightGrams: string;
  durationInput: string;
  quantity: string;
  note: string;
};

type WorkflowStep = {
  label: string;
  status: "done" | "current" | "upcoming";
};

const initialFormState = (filamentId?: number): FormState => ({
  nameOrLink: "",
  filamentId: filamentId ? String(filamentId) : "",
  weightGrams: "",
  durationInput: "",
  quantity: "1",
  note: "",
});

export function UserRequestForm({
  filaments,
  machineHourPrice,
}: UserRequestFormProps) {
  const [form, setForm] = useState<FormState>(initialFormState(filaments[0]?.id));
  const [inputMode, setInputMode] = useState<"upload" | "manual">("upload");
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<"estimate" | "send" | null>(
    null,
  );
  const [isRefreshingEstimate, setIsRefreshingEstimate] = useState(false);

  const selectedFilament =
    filaments.find((filament) => filament.id === Number(form.filamentId)) ??
    filaments[0];
  const quantity = Number(form.quantity);
  const manualWeightGrams = Number(form.weightGrams);
  const manualDurationMinutes = parseDurationInput(form.durationInput);

  const manualBreakdown =
    selectedFilament &&
    inputMode === "manual" &&
    Number.isFinite(quantity) &&
    quantity > 0 &&
    Number.isFinite(manualWeightGrams) &&
    manualWeightGrams > 0 &&
    manualDurationMinutes !== null &&
    manualDurationMinutes > 0
      ? calculatePricing({
          weightGrams: manualWeightGrams,
          durationMinutes: manualDurationMinutes,
          quantity,
          pricePerKg: selectedFilament.pricePerKg,
          machineHourPrice,
        })
      : null;

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

  const canCreateEstimate =
    !confirmation &&
    Boolean(selectedFilament) &&
    form.nameOrLink.trim().length > 0 &&
    quantity > 0 &&
    Boolean(modelFile);

  const canCreateManualRequest =
    !confirmation &&
    Boolean(selectedFilament) &&
    form.nameOrLink.trim().length > 0 &&
    quantity > 0 &&
    Boolean(
      manualBreakdown &&
        manualDurationMinutes &&
        Number.isFinite(manualWeightGrams) &&
        manualWeightGrams > 0,
    );

  const priceDescription = confirmation
    ? isEstimatePending
      ? "The slicer is running now. Pricing will fill in as soon as the estimate is ready."
      : isEstimateFailed
        ? "The estimate could not be completed automatically yet."
        : isSubmitted
          ? "This is the estimate that was sent with the request."
          : "Review the estimate, then send the request when it looks right."
    : inputMode === "manual"
      ? "Manual slicer values price instantly."
      : "Choose a model file to run a real slicer estimate.";

  const pricePendingLabel = confirmation
    ? isEstimatePending
      ? "Calculating..."
      : isEstimateFailed
        ? "Needs review"
        : null
    : inputMode === "upload"
      ? "Estimate first"
      : null;

  const activeFilamentForPricing = confirmedFilament ?? selectedFilament ?? null;
  const priceFilamentLabel = activeFilamentForPricing
    ? publicFilamentLabel(activeFilamentForPricing)
    : null;
  const priceFilamentPerKg = activeFilamentForPricing?.pricePerKg ?? null;
  const filamentUsageGrams = confirmation
    ? confirmation.weightGrams
    : inputMode === "manual" &&
        Number.isFinite(manualWeightGrams) &&
        manualWeightGrams > 0
      ? manualWeightGrams
      : null;

  const priceMaterialCost = confirmation
    ? confirmedBreakdown?.materialCost ?? null
    : manualBreakdown?.materialCost ?? null;
  const priceMachineCost = confirmation
    ? confirmedBreakdown?.machineCost ?? null
    : manualBreakdown?.machineCost ?? null;
  const priceTotal = confirmation
    ? confirmedBreakdown?.estimatedPrice ?? confirmation.estimatedPrice ?? null
    : manualBreakdown?.estimatedPrice ?? null;

  const workflowSteps = buildWorkflowSteps({
    inputMode,
    confirmation,
  });

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
    setModelFile(null);
    setIsRefreshingEstimate(false);
    setActiveAction(null);
    setInputMode("upload");
    setForm(initialFormState(selectedFilament?.id ?? filaments[0]?.id));
  };

  const handleEstimateSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!selectedFilament) {
      setError("No material is currently available for new requests.");
      return;
    }

    if (inputMode === "manual") {
      if (!canCreateManualRequest) {
        setError("Enter valid slicer values to continue.");
        return;
      }
    } else if (!canCreateEstimate) {
      setError("Upload an STL or 3MF file to continue.");
      return;
    }

    setActiveAction("estimate");

    try {
      let artifact: Artifact | null = null;

      if (inputMode === "upload" && modelFile) {
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

        artifact = uploadData.artifact;
      }

      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          inputMode === "manual"
            ? {
                mode: "manual",
                nameOrLink: form.nameOrLink,
                filamentId: selectedFilament.id,
                weightGrams: manualWeightGrams,
                durationInput: form.durationInput,
                quantity,
                note: form.note,
              }
            : {
                mode: "upload",
                nameOrLink: form.nameOrLink,
                filamentId: selectedFilament.id,
                sourceArtifactId: artifact?.id,
                quantity,
                note: form.note,
              },
        ),
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
      if (inputMode === "manual") {
        setModelFile(null);
      }
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

  const initialSteps: WorkflowStep[] =
    inputMode === "manual"
      ? [
          { label: "Details", status: "done" },
          { label: "Send", status: "current" },
        ]
      : [
          { label: "Details", status: "current" },
          { label: "Estimate", status: "upcoming" },
          { label: "Send", status: "upcoming" },
        ];

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_360px]">
      <form
        className="surface flex flex-col gap-6 p-5 sm:p-7"
        onSubmit={handleEstimateSubmit}
      >
        {!confirmation ? (
          <>
            <WorkflowHeader
              currentLabel={inputMode === "manual" ? "Direct request" : "Add details"}
              headline={inputMode === "manual" ? "2 steps" : "Step 1 of 3"}
              steps={initialSteps}
            />

            <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <label className="space-y-2">
                <FieldLabel label="Model link or name" required />
                <input
                  autoFocus
                  className="field"
                  name="nameOrLink"
                  placeholder="https://... or Ruins Frame"
                  value={form.nameOrLink}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      nameOrLink: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="space-y-2">
                <FieldLabel label="Filament" required />
                <select
                  className="field"
                  name="filamentId"
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
            </div>

            <div className="grid gap-3 rounded-[24px] border border-border/80 bg-white/72 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <FieldLabel label="Estimate method" required />
                  <p className="text-sm text-muted-foreground">
                    {inputMode === "upload"
                      ? "Upload a model and estimate it first."
                      : "Use exact slicer values if you already have them."}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-1.5 rounded-[20px] border border-border bg-background p-1.5">
                  <button
                    className={cn(
                      "min-h-[48px] rounded-[14px] px-4 py-2.5 text-sm font-medium transition",
                      inputMode === "upload"
                        ? "bg-foreground text-white"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    type="button"
                    onClick={() => setInputMode("upload")}
                  >
                    Model file
                  </button>
                  <button
                    className={cn(
                      "min-h-[48px] rounded-[14px] px-4 py-2.5 text-sm font-medium transition",
                      inputMode === "manual"
                        ? "bg-foreground text-white"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    type="button"
                    onClick={() => setInputMode("manual")}
                  >
                    Slicer values
                  </button>
                </div>
              </div>

              {inputMode === "upload" ? (
                <div className="rounded-[22px] border border-border/70 bg-background px-4 py-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <FieldLabel label="Model file" required />
                      <p className="text-sm text-muted-foreground">STL or 3MF</p>
                    </div>
                    <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-full border border-border bg-white px-4 text-sm font-medium text-foreground transition hover:border-accent/30 hover:bg-accent/5">
                      <input
                        accept=".stl,.3mf"
                        className="sr-only"
                        type="file"
                        onChange={(event) =>
                          setModelFile(event.target.files?.[0] ?? null)
                        }
                      />
                      {modelFile ? "Replace file" : "Choose file"}
                    </label>
                  </div>
                  <div className="mt-4 flex items-start gap-3 rounded-2xl border border-border/70 bg-white/80 px-4 py-3">
                    <FileUp className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {modelFile ? modelFile.name : "No file selected"}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {modelFile
                          ? "Estimate the cost next. You can send the request after you review the result."
                          : "Choose a file to unlock the estimate step."}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <FieldLabel label="Weight (g)" required />
                    <input
                      className="field"
                      inputMode="decimal"
                      min="1"
                      placeholder="128"
                      value={form.weightGrams}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          weightGrams: event.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      From slicer or print profile.
                    </p>
                  </label>

                  <label className="space-y-2">
                    <FieldLabel label="Duration" required />
                    <input
                      className="field"
                      inputMode="numeric"
                      placeholder="90 or 01:30"
                      value={form.durationInput}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          durationInput: event.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Type minutes or HH:MM.
                    </p>
                  </label>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="space-y-2">
                <FieldLabel label="Quantity" required />
                <input
                  className="field"
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

              <div className="space-y-2 sm:min-w-[220px]">
                <button
                  className="inline-flex h-12 w-full items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-white transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-foreground/30"
                  disabled={
                    inputMode === "manual"
                      ? !canCreateManualRequest || Boolean(activeAction)
                      : !canCreateEstimate || Boolean(activeAction)
                  }
                  type="submit"
                >
                  {inputMode === "manual"
                    ? activeAction === "estimate"
                      ? "Sending request..."
                      : "Send request"
                    : activeAction === "estimate"
                      ? "Estimating..."
                      : "Estimate cost"}
                </button>
                <p className="text-xs text-muted-foreground">
                  {inputMode === "manual"
                    ? "Manual values send immediately."
                    : "Review the estimate before anything is sent."}
                </p>
              </div>
            </div>

            <label className="space-y-2">
              <FieldLabel label="Note for the print shop" optional />
              <textarea
                className="field-area"
                placeholder="Orientation, supports, deadline, or anything else we should know."
                value={form.note}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
              />
            </label>

            {error ? <ErrorPanel message={error} /> : null}
          </>
        ) : (
          <>
            {workflowSteps.length > 0 ? (
              <WorkflowHeader
                currentLabel={
                  isSubmitted
                    ? "Request sent"
                    : isEstimateReadyToSend
                      ? "Review and send"
                      : isEstimateFailed
                        ? "Estimate needs review"
                        : "Estimate running"
                }
                headline={
                  isSubmitted
                    ? "Completed"
                    : isEstimateReadyToSend
                      ? "Step 3 of 3"
                      : "Step 2 of 3"
                }
                steps={workflowSteps}
              />
            ) : null}

            <div className="rounded-[28px] border border-border/80 bg-white/72 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {isSubmitted
                      ? "Request sent"
                      : isEstimateReadyToSend
                        ? "Estimate ready"
                        : isEstimateFailed
                          ? "Estimate needs review"
                          : "Estimating"}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">
                    {confirmation.nameOrLink}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {isSubmitted
                      ? "The request was sent successfully."
                      : isEstimateReadyToSend
                        ? "Review the estimate below, then send the request when you are happy with the cost."
                        : isEstimateFailed
                          ? "The estimate could not be completed automatically, so the request has not been sent yet."
                          : "The model is being processed now and the estimate will refresh automatically."}
                  </p>
                </div>
                <button
                  className="inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-border bg-white px-4 text-sm font-medium text-foreground transition hover:border-accent/30 hover:bg-accent/5"
                  type="button"
                  onClick={resetWorkflow}
                >
                  {isSubmitted ? "Create another" : "Start over"}
                </button>
              </div>

              {isEstimatePending ? (
                <div className="mt-5 rounded-[24px] border border-border bg-accent-soft/55 p-5">
                  <div className="flex items-start gap-3">
                    <LoaderCircle className="mt-0.5 size-5 animate-spin text-foreground" />
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        Calculating with slicer
                      </p>
                      <p className="text-sm leading-6 text-muted-foreground">
                        Your file is uploaded and the estimate is still running.
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {isRefreshingEstimate
                          ? "Refreshing the latest estimate..."
                          : "Waiting for slicer result..."}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <SummaryTile
                  icon={<Package2 className="mt-0.5 size-4 text-muted-foreground" />}
                  label="Filament"
                  value={
                    confirmedFilament
                      ? publicFilamentLabel(confirmedFilament)
                      : confirmation.filamentLabel
                  }
                />
                <SummaryTile
                  icon={<Clock3 className="mt-0.5 size-4 text-muted-foreground" />}
                  label="Duration"
                  value={
                    confirmation.durationMinutes
                      ? formatDuration(confirmation.durationMinutes)
                      : isEstimatePending
                        ? "Calculating"
                        : "Not available"
                  }
                />
                <SummaryTile
                  icon={<CheckCircle2 className="mt-0.5 size-4 text-muted-foreground" />}
                  label="Quantity"
                  value={String(confirmation.quantity)}
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <SummaryTile
                  icon={<Package2 className="mt-0.5 size-4 text-muted-foreground" />}
                  label="Filament usage"
                  value={
                    confirmation.weightGrams !== null
                      ? formatGrams(confirmation.weightGrams)
                      : isEstimatePending
                        ? "Calculating"
                        : "Not available"
                  }
                />
                <SummaryTile
                  icon={<CheckCircle2 className="mt-0.5 size-4 text-muted-foreground" />}
                  label="Status"
                  value={
                    isSubmitted
                      ? `Sent on ${formatDateTime(
                          confirmation.submittedAt ?? confirmation.createdAt,
                        )}`
                      : isEstimateReadyToSend
                        ? "Ready to send"
                        : isEstimateFailed
                          ? "Needs manual review"
                          : "Slicer is running"
                  }
                />
              </div>

              {confirmation.note ? (
                <div className="mt-4 rounded-[22px] border border-border/70 bg-background px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Note
                  </p>
                  <p className="mt-2 text-sm leading-6 text-foreground">
                    {confirmation.note}
                  </p>
                </div>
              ) : null}

              {isEstimateFailed && confirmation.estimateError ? (
                <div className="mt-4">
                  <ErrorPanel message={confirmation.estimateError} />
                </div>
              ) : null}

              {isSubmitted ? (
                <div className="mt-5 rounded-[24px] border border-emerald-200 bg-success-soft p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    What happened
                  </p>
                  <div className="mt-3 space-y-3 text-sm text-foreground">
                    <TimelineRow
                      title="Details received"
                      description={`Saved on ${formatDateTime(confirmation.createdAt)}.`}
                    />
                    <TimelineRow
                      title={
                        inputMode === "manual"
                          ? "Manual slicer values accepted"
                          : "Slicer estimate completed"
                      }
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

              {isEstimateReadyToSend ? (
                <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                    The estimate is private until you send the request.
                  </p>
                  <button
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-white transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-foreground/30"
                    disabled={isSendingRequest}
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
                </div>
              ) : null}
            </div>
          </>
        )}
      </form>

      <div className="flex flex-col gap-4 lg:sticky lg:top-5 lg:self-start">
        <PriceBreakdown
          description={priceDescription}
          filamentLabel={priceFilamentLabel}
          filamentPricePerKg={priceFilamentPerKg}
          filamentUsageGrams={filamentUsageGrams}
          machineCost={priceMachineCost}
          materialCost={priceMaterialCost}
          total={priceTotal}
          pendingLabel={pricePendingLabel}
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

function buildWorkflowSteps(input: {
  inputMode: "upload" | "manual";
  confirmation: Task | null;
}): WorkflowStep[] {
  if (!input.confirmation) {
    return [];
  }

  if (input.inputMode === "manual") {
    return [
      {
        label: "Details",
        status: "done",
      },
      {
        label: "Send",
        status: "done",
      },
    ];
  }

  if (input.confirmation.submissionState === "submitted") {
    return [
      { label: "Details", status: "done" },
      { label: "Estimate", status: "done" },
      { label: "Send", status: "done" },
    ];
  }

  if (input.confirmation.estimateState === "ready") {
    return [
      { label: "Details", status: "done" },
      { label: "Estimate", status: "done" },
      { label: "Send", status: "current" },
    ];
  }

  if (input.confirmation.estimateState === "failed") {
    return [
      { label: "Details", status: "done" },
      { label: "Estimate", status: "current" },
      { label: "Send", status: "upcoming" },
    ];
  }

  return [
    { label: "Details", status: "done" },
    { label: "Estimate", status: "current" },
    { label: "Send", status: "upcoming" },
  ];
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

function WorkflowHeader(props: {
  headline: string;
  currentLabel: string;
  steps: WorkflowStep[];
}) {
  return (
    <div className="rounded-[24px] border border-border/80 bg-white/72 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {props.headline}
        </p>
        <p className="text-sm text-foreground">{props.currentLabel}</p>
      </div>
      <ol className="mt-4 flex flex-wrap items-center gap-3">
        {props.steps.map((step, index) => (
          <li key={step.label} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition",
                  step.status === "done"
                    ? "border-foreground bg-foreground text-white"
                    : step.status === "current"
                      ? "border-accent/35 bg-accent-soft text-foreground"
                      : "border-border bg-background text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              <span
                className={cn(
                  "text-sm",
                  step.status === "upcoming"
                    ? "text-muted-foreground"
                    : "font-medium text-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
            {index < props.steps.length - 1 ? (
              <span className="hidden h-px w-6 bg-border sm:block" />
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function SummaryTile(props: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-border/70 bg-background px-4 py-4">
      <div className="flex items-start gap-3">
        {props.icon}
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {props.label}
          </p>
          <p className="mt-1 text-sm text-foreground">{props.value}</p>
        </div>
      </div>
    </div>
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
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-foreground" />
      <div>
        <p className="font-medium text-foreground">{props.title}</p>
        <p className="mt-1 text-muted-foreground">{props.description}</p>
      </div>
    </div>
  );
}
