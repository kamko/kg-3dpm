"use client";

import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Clock3,
  Package2,
} from "lucide-react";
import { useState, useTransition } from "react";
import { PriceBreakdown } from "@/components/price-breakdown";
import { calculatePricing, parseDurationInput } from "@/lib/pricing";
import {
  analyze3mfBuffer,
  analyzeStlBuffer,
  type StlAnalysis,
} from "@/lib/stl-estimate";
import type { Filament, Task } from "@/lib/types";
import {
  cn,
  formatCurrency,
  formatDuration,
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
  const [inputMode, setInputMode] = useState<"stl" | "manual">("stl");
  const [stlAnalysis, setStlAnalysis] = useState<StlAnalysis | null>(null);
  const [isAnalyzingStl, setIsAnalyzingStl] = useState(false);
  const [confirmation, setConfirmation] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedFilament =
    filaments.find((filament) => filament.id === Number(form.filamentId)) ??
    filaments[0];
  const quantity = Number(form.quantity);
  const manualWeightGrams = Number(form.weightGrams);
  const manualDurationMinutes = parseDurationInput(form.durationInput);
  const effectiveWeightGrams =
    inputMode === "manual"
      ? manualWeightGrams
      : (stlAnalysis?.estimatedWeightGrams ?? 0);
  const effectiveDurationMinutes =
    inputMode === "manual"
      ? manualDurationMinutes
      : (stlAnalysis?.estimatedDurationMinutes ?? 0);

  const hasValidEstimate =
    Boolean(selectedFilament) &&
    Number.isFinite(quantity) &&
    quantity > 0 &&
    Number.isFinite(effectiveWeightGrams) &&
    effectiveWeightGrams > 0 &&
    effectiveDurationMinutes !== null &&
    effectiveDurationMinutes > 0;

  const breakdown =
    selectedFilament && hasValidEstimate
      ? calculatePricing({
          weightGrams: effectiveWeightGrams,
          durationMinutes: effectiveDurationMinutes,
          quantity,
          pricePerKg: selectedFilament.pricePerKg,
          machineHourPrice,
        })
      : calculatePricing({
          weightGrams: 0,
          durationMinutes: 0,
          quantity: 1,
          pricePerKg: selectedFilament?.pricePerKg ?? 0,
          machineHourPrice,
        });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setConfirmation(null);

    if (!selectedFilament) {
      setError("No material is currently available for new requests.");
      return;
    }

    if (!hasValidEstimate || !effectiveDurationMinutes) {
      setError("Upload a model file or enter valid slicer values.");
      return;
    }

    startTransition(() => {
      void (async () => {
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nameOrLink: form.nameOrLink,
            filamentId: selectedFilament.id,
            weightGrams: effectiveWeightGrams,
            durationInput:
              inputMode === "manual"
                ? form.durationInput
                : String(effectiveDurationMinutes),
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
        setForm(initialFormState(selectedFilament.id));
        setInputMode("stl");
        setStlAnalysis(null);
      })();
    });
  };

  const handleStlSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !selectedFilament) {
      return;
    }

    setError(null);
    setIsAnalyzingStl(true);

    try {
      const buffer = await file.arrayBuffer();
      const fileName = file.name.toLowerCase();
      const analysis = fileName.endsWith(".3mf")
        ? await analyze3mfBuffer(buffer, selectedFilament.material)
        : analyzeStlBuffer(buffer, selectedFilament.material);

      setStlAnalysis(analysis);
      setForm((current) => ({
        ...current,
        weightGrams: String(analysis.estimatedWeightGrams),
        durationInput: formatDuration(analysis.estimatedDurationMinutes),
      }));
    } catch (reason) {
      setStlAnalysis(null);
      setError(
        reason instanceof Error
          ? reason.message
          : "The model file could not be analyzed.",
      );
    } finally {
      setIsAnalyzingStl(false);
      event.target.value = "";
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_360px]">
      <form className="surface flex flex-col gap-6 p-5 sm:p-7" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">
              Model link or name
            </span>
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
            <span className="text-sm font-medium text-foreground">Filament</span>
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

        <div className="flex flex-col gap-3 rounded-[24px] border border-border/80 bg-white/72 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              Estimate source
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Estimates currently come from STL or 3MF geometry, or from exact slicer values if you already have them.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-full border border-border bg-background p-1">
            <button
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition",
                inputMode === "stl"
                  ? "bg-foreground text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
              type="button"
              onClick={() => setInputMode("stl")}
            >
              Use model file
            </button>
            <button
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition",
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

        {inputMode === "stl" ? (
          <div className="rounded-[24px] border border-border/80 bg-white/72 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <FileUp className="mt-0.5 size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Upload the STL or 3MF file
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    We&apos;ll infer rough dimensions, mesh complexity, weight, and
                    print time from the model geometry inside the file.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-full border border-border bg-white px-4 text-sm font-medium text-foreground transition hover:border-accent/30 hover:bg-accent/5">
                    <input
                      accept=".stl,.3mf"
                      className="sr-only"
                      type="file"
                      onChange={handleStlSelected}
                    />
                    {isAnalyzingStl ? "Analyzing file..." : "Upload file"}
                  </label>
                  <p className="text-xs leading-5 text-muted-foreground">
                    This is a rough estimate based on geometry, not a final production quote.
                  </p>
                </div>

                {stlAnalysis ? (
                  <div className="rounded-2xl border border-border/70 bg-accent-soft/55 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    File analysis
                    </p>
                    <p className="mt-2 text-sm leading-6 text-foreground">
                      {stlAnalysis.summary}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Using {selectedFilament.material} density and a standard print-profile heuristic.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border-strong/70 bg-background/50 px-4 py-4 text-sm text-muted-foreground">
                    No model file uploaded yet. Add an STL or 3MF file to unlock the estimate.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-[24px] border border-border/80 bg-white/72 p-4 sm:p-5">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Enter slicer values
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                Use this only if you already have print weight and duration from a slicer or print profile.
              </p>
            </div>
          </div>
        )}

        <div className={cn("grid gap-4", inputMode === "manual" ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          {inputMode === "manual" ? (
            <>
              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Weight (g)</span>
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
                <span className="text-sm font-medium text-foreground">
                  Duration (min or HH:MM)
                </span>
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
                  You can type `95` or `01:35`.
                </p>
              </label>
            </>
          ) : (
            <div className="rounded-[24px] border border-border/80 bg-white/72 px-4 py-4 sm:col-span-1">
              {stlAnalysis ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Current file estimate
                  </p>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm text-foreground">
                    <span>{effectiveWeightGrams} g</span>
                    <span>
                      {effectiveDurationMinutes
                        ? formatDuration(effectiveDurationMinutes)
                        : "--"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Based on the uploaded model geometry.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Estimate status
                  </p>
                  <p className="mt-2 text-sm text-foreground">Waiting for file upload</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Upload an STL or 3MF file above, or switch to slicer values if you already have exact numbers.
                  </p>
                </>
              )}
            </div>
          )}

          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Quantity</span>
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
        </div>

        <label className="space-y-2">
          <span className="text-sm font-medium text-foreground">Note</span>
          <textarea
            className="field-area"
            placeholder="Orientation, supports, deadline, or customer notes."
            value={form.note}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                note: event.target.value,
              }))
            }
          />
        </label>

        <div className="grid gap-3 rounded-[24px] border border-border/80 bg-white/72 p-4 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <Package2 className="mt-0.5 size-4 text-muted-foreground" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Filament
              </p>
              <p className="mt-1 text-sm text-foreground">
                {selectedFilament ? publicFilamentLabel(selectedFilament) : "Unavailable"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 size-4 text-muted-foreground" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Duration
              </p>
              <p className="mt-1 text-sm text-foreground">
                {effectiveDurationMinutes ? `${effectiveDurationMinutes} min` : "Upload a file or use slicer values"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-4 text-muted-foreground" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Quantity
              </p>
              <p className="mt-1 text-sm text-foreground">
                {quantity > 0 ? quantity : "Set a quantity"}
              </p>
            </div>
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-danger-soft px-4 py-3 text-sm text-foreground">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
            <p>{error}</p>
          </div>
        ) : null}

        {confirmation ? (
          <div className="rounded-[24px] border border-emerald-200 bg-success-soft px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Request created
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {confirmation.nameOrLink}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Estimated total {formatCurrency(confirmation.estimatedPrice)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Request #{confirmation.id} received.
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            Estimates come from model geometry or exact slicer values. Final confirmation may still change after review.
          </p>
          <button
            className="inline-flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-white transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-foreground/30"
            disabled={!hasValidEstimate || isPending || !form.nameOrLink.trim()}
            type="submit"
          >
            {isPending ? "Creating..." : "Create request"}
          </button>
        </div>
      </form>

      <div className="flex flex-col gap-4 lg:sticky lg:top-5 lg:self-start">
        <PriceBreakdown
          machineCost={breakdown.machineCost}
          materialCost={breakdown.materialCost}
          total={breakdown.estimatedPrice}
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
            The estimate uses the selected filament&apos;s price per kilogram and
            the shop-wide machine hour price.
          </p>
        </div>
      </div>
    </section>
  );
}
