"use client";

import { formatCurrency, formatGrams } from "@/lib/utils";

type PriceBreakdownProps = {
  filamentUsageGrams?: number | null;
  filamentRateLabel?: string | null;
  materialCost: number | null;
  machineCost: number | null;
  total: number | null;
  pendingLabel?: string | null;
  description?: string;
};

function valueOrPending(value: number | null, pendingLabel: string | null | undefined) {
  if (value === null) {
    return pendingLabel ?? "Pending";
  }

  return formatCurrency(value);
}

export function PriceBreakdown({
  filamentUsageGrams,
  filamentRateLabel,
  materialCost,
  machineCost,
  total,
  pendingLabel,
  description,
}: PriceBreakdownProps) {
  return (
    <div className="surface flex flex-col gap-5 p-5 sm:p-6">
      <div className="space-y-2">
        <p className="eyebrow">Estimate</p>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
          Price breakdown
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {description ??
            "Review the material cost, machine time, and total before sending the request."}
        </p>
      </div>

      <dl className="space-y-3 text-sm">
        {filamentRateLabel ? (
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/75 px-4 py-3">
            <dt className="text-muted-foreground">Selected filament</dt>
            <dd className="font-medium text-foreground">{filamentRateLabel}</dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/75 px-4 py-3">
          <dt className="text-muted-foreground">Filament usage</dt>
          <dd className="font-medium text-foreground">
            {filamentUsageGrams === null || filamentUsageGrams === undefined
              ? pendingLabel ?? "Pending"
              : formatGrams(filamentUsageGrams)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/75 px-4 py-3">
          <dt className="text-muted-foreground">Material cost</dt>
          <dd className="font-medium text-foreground">
            {valueOrPending(materialCost, pendingLabel)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/75 px-4 py-3">
          <dt className="text-muted-foreground">Machine cost</dt>
          <dd className="font-medium text-foreground">
            {valueOrPending(machineCost, pendingLabel)}
          </dd>
        </div>
        <div className="rounded-2xl border border-accent/14 bg-accent-soft px-4 py-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Estimated total
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-foreground">
                {valueOrPending(total, pendingLabel)}
              </p>
            </div>
            <p className="max-w-[11rem] text-right text-xs leading-5 text-muted-foreground">
              Quantity is already included once the slicer result is ready.
            </p>
          </div>
        </div>
      </dl>
    </div>
  );
}
