"use client";

import { formatCurrency } from "@/lib/utils";

type PriceBreakdownProps = {
  materialCost: number;
  machineCost: number;
  total: number;
};

export function PriceBreakdown({
  materialCost,
  machineCost,
  total,
}: PriceBreakdownProps) {
  return (
    <div className="surface flex flex-col gap-5 p-5 sm:p-6">
      <div className="space-y-2">
        <p className="eyebrow">Live estimate</p>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
          Price breakdown
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Material and machine costs update as soon as you change weight,
          duration, quantity, or filament.
        </p>
      </div>

      <dl className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/75 px-4 py-3">
          <dt className="text-muted-foreground">Material cost</dt>
          <dd className="font-medium text-foreground">
            {formatCurrency(materialCost)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/75 px-4 py-3">
          <dt className="text-muted-foreground">Machine cost</dt>
          <dd className="font-medium text-foreground">
            {formatCurrency(machineCost)}
          </dd>
        </div>
        <div className="rounded-2xl border border-accent/14 bg-accent-soft px-4 py-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Estimated total
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-foreground">
                {formatCurrency(total)}
              </p>
            </div>
            <p className="max-w-[10rem] text-right text-xs leading-5 text-muted-foreground">
              Quantity is already included in the total.
            </p>
          </div>
        </div>
      </dl>
    </div>
  );
}
