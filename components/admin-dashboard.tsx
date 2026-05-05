"use client";

import {
  AlertCircle,
  Check,
  Download,
  Filter,
  LoaderCircle,
  Plus,
  RotateCcw,
  Settings2,
} from "lucide-react";
import { useState, useTransition } from "react";
import { calculatePricing, parseDurationInput } from "@/lib/pricing";
import { PRUSA_PRESET_OPTIONS } from "@/lib/prusa";
import {
  ESTIMATE_STATES,
  TASK_STATUSES,
  type EstimateState,
  type Filament,
  type Settings,
  type SubmissionState,
  type Task,
  type TaskStatus,
} from "@/lib/types";
import {
  cn,
  filamentLabel,
  formatCurrency,
  formatDateTime,
  formatDuration,
} from "@/lib/utils";

type AdminDashboardProps = {
  initialFilaments: Filament[];
  initialSettings: Settings;
  initialTasks: Task[];
};

type SortMode = "newest" | "name" | "estimate" | "status";

type TaskDraft = {
  nameOrLink: string;
  sourceUrl: string;
  filamentId: string;
  quantity: string;
  weightGrams: string;
  durationInput: string;
  finalPrice: string;
  status: TaskStatus;
  note: string;
};

type FilamentDraft = {
  brand: string;
  material: string;
  color: string;
  pricePerKg: string;
  presetKey: string;
  available: boolean;
};

export function AdminDashboard({
  initialFilaments,
  initialSettings,
  initialTasks,
}: AdminDashboardProps) {
  const [filaments, setFilaments] = useState(initialFilaments);
  const [settings, setSettings] = useState(initialSettings);
  const [tasks, setTasks] = useState(initialTasks);
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>("all");
  const [estimateFilter, setEstimateFilter] = useState<"all" | EstimateState>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [notice, setNotice] = useState<string | null>(null);

  const visibleTasks = [...tasks]
    .filter((task) => statusFilter === "all" || task.status === statusFilter)
    .filter(
      (task) => estimateFilter === "all" || task.estimateState === estimateFilter,
    )
    .sort((left, right) => {
      if (sortMode === "name") {
        return left.nameOrLink.localeCompare(right.nameOrLink);
      }

      if (sortMode === "estimate") {
        return (right.estimatedPrice ?? -1) - (left.estimatedPrice ?? -1);
      }

      if (sortMode === "status") {
        return left.status.localeCompare(right.status);
      }

      return (
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      );
    });

  async function patchJson<T>(url: string, body: unknown, method = "PATCH"): Promise<T> {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as T & { error?: string };

    if (!response.ok) {
      throw new Error(data.error ?? "Save failed.");
    }

    return data;
  }

  async function saveFilament(id: number, body: FilamentDraft): Promise<Filament> {
    const previousFilaments = filaments;
    const previousTasks = tasks;
    const pricePerKg = Number(body.pricePerKg);

    if (!body.brand.trim() || !body.material.trim() || !body.color.trim()) {
      throw new Error("Brand, material, and color are required.");
    }

    if (!Number.isFinite(pricePerKg) || pricePerKg <= 0) {
      throw new Error("Price per kilogram must be greater than zero.");
    }

    const optimisticFilament: Filament = {
      id,
      brand: body.brand.trim(),
      material: body.material.trim(),
      color: body.color.trim(),
      pricePerKg,
      presetKey: body.presetKey,
      available: body.available,
    };

    setFilaments((current) =>
      current.map((filament) => (filament.id === id ? optimisticFilament : filament)),
    );
    setTasks((current) =>
      current.map((task) =>
        task.filamentId === id &&
        task.weightGrams !== null &&
        task.durationMinutes !== null &&
        task.estimateState === "ready" &&
        !task.acceptedAt
          ? {
              ...task,
              filamentLabel: filamentLabel(optimisticFilament),
              estimatedPrice: calculatePricing({
                weightGrams: task.weightGrams,
                durationMinutes: task.durationMinutes,
                quantity: task.quantity,
                pricePerKg,
                machineHourPrice: settings.machineHourPrice,
              }).estimatedPrice,
            }
          : task.filamentId === id
            ? {
                ...task,
                filamentLabel: filamentLabel(optimisticFilament),
              }
            : task,
      ),
    );

    try {
      const data = await patchJson<{ filament: Filament }>(`/api/filaments/${id}`, {
        brand: optimisticFilament.brand,
        material: optimisticFilament.material,
        color: optimisticFilament.color,
        pricePerKg: optimisticFilament.pricePerKg,
        presetKey: optimisticFilament.presetKey,
        available: optimisticFilament.available,
      });

      setFilaments((current) =>
        current.map((filament) => (filament.id === id ? data.filament : filament)),
      );
      setNotice(`Saved filament ${filamentLabel(data.filament)}.`);
      return data.filament;
    } catch (error) {
      setFilaments(previousFilaments);
      setTasks(previousTasks);
      throw error;
    }
  }

  async function createNewFilament(body: FilamentDraft): Promise<Filament> {
    const pricePerKg = Number(body.pricePerKg);

    if (!body.brand.trim() || !body.material.trim() || !body.color.trim()) {
      throw new Error("Brand, material, and color are required.");
    }

    if (!Number.isFinite(pricePerKg) || pricePerKg <= 0) {
      throw new Error("Price per kilogram must be greater than zero.");
    }

    const response = await fetch("/api/filaments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        brand: body.brand.trim(),
        material: body.material.trim(),
        color: body.color.trim(),
        pricePerKg,
        presetKey: body.presetKey,
        available: body.available,
      }),
    });

    const data = (await response.json()) as {
      filament?: Filament;
      error?: string;
    };

    if (!response.ok || !data.filament) {
      throw new Error(data.error ?? "Unable to create filament.");
    }

    setFilaments((current) => [data.filament!, ...current]);
    setNotice(`Added filament ${filamentLabel(data.filament)}.`);
    return data.filament;
  }

  async function saveMachineHourPrice(value: string): Promise<number> {
    const machineHourPrice = Number(value);

    if (!Number.isFinite(machineHourPrice) || machineHourPrice <= 0) {
      throw new Error("Machine hour price must be greater than zero.");
    }

    const previousSettings = settings;
    const previousTasks = tasks;

    setSettings({ machineHourPrice });
    setTasks((current) =>
      current.map((task) => {
        const filament = filaments.find((item) => item.id === task.filamentId);
        if (
          !filament ||
          task.weightGrams === null ||
          task.durationMinutes === null ||
          task.estimateState !== "ready" ||
          task.acceptedAt
        ) {
          return task;
        }

        return {
          ...task,
          estimatedPrice: calculatePricing({
            weightGrams: task.weightGrams,
            durationMinutes: task.durationMinutes,
            quantity: task.quantity,
            pricePerKg: filament.pricePerKg,
            machineHourPrice,
          }).estimatedPrice,
        };
      }),
    );

    try {
      const data = await patchJson<{ settings: Settings }>("/api/settings", {
        machineHourPrice,
      });

      setSettings(data.settings);
      setNotice("Saved machine hour price.");
      return data.settings.machineHourPrice;
    } catch (error) {
      setSettings(previousSettings);
      setTasks(previousTasks);
      throw error;
    }
  }

  async function saveTask(id: number, draft: TaskDraft): Promise<Task> {
    const quantity = Number(draft.quantity);
    const finalPrice =
      draft.finalPrice.trim() === "" ? null : Number(draft.finalPrice);

    if (!draft.nameOrLink.trim()) {
      throw new Error("Task name is required.");
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Quantity must be greater than zero.");
    }

    if (finalPrice !== null && (!Number.isFinite(finalPrice) || finalPrice < 0)) {
      throw new Error("Final price must be empty or zero and above.");
    }

    const filamentId = Number(draft.filamentId);
    const filament = filaments.find((item) => item.id === filamentId);

    if (!filament) {
      throw new Error("Select a valid filament.");
    }

    const hasWeight = draft.weightGrams.trim() !== "";
    const hasDuration = draft.durationInput.trim() !== "";
    if (hasWeight !== hasDuration) {
      throw new Error("Provide both weight and duration for a manual estimate.");
    }

    const weightGrams = hasWeight ? Number(draft.weightGrams) : null;
    const durationMinutes = hasDuration
      ? parseDurationInput(draft.durationInput)
      : null;

    if (hasWeight && (!Number.isFinite(weightGrams) || Number(weightGrams) <= 0)) {
      throw new Error("Weight must be greater than zero.");
    }

    if (hasDuration && (!durationMinutes || durationMinutes <= 0)) {
      throw new Error("Duration must be valid minutes or HH:MM.");
    }

    const previousTasks = tasks;
    const optimisticTask = buildOptimisticTask({
      currentTask: tasks.find((task) => task.id === id),
      draft,
      filament,
      machineHourPrice: settings.machineHourPrice,
      weightGrams,
      durationMinutes,
    });

    setTasks((current) =>
      current.map((task) => (task.id === id ? optimisticTask : task)),
    );

    try {
      const data = await patchJson<{ task: Task }>(`/api/tasks/${id}`, {
        nameOrLink: optimisticTask.nameOrLink,
        sourceUrl: optimisticTask.sourceUrl,
        filamentId: optimisticTask.filamentId,
        quantity: optimisticTask.quantity,
        weightGrams,
        durationInput: hasDuration ? draft.durationInput : null,
        finalPrice: optimisticTask.finalPrice,
        status: optimisticTask.status,
        note: optimisticTask.note,
      });

      setTasks((current) =>
        current.map((task) => (task.id === id ? data.task : task)),
      );
      setNotice(`Saved task #${id}.`);
      return data.task;
    } catch (error) {
      setTasks(previousTasks);
      throw error;
    }
  }

  async function acceptRequest(id: number) {
    const previousTasks = tasks;
    const task = tasks.find((item) => item.id === id);

    if (!task) {
      throw new Error("Task not found.");
    }

    setTasks((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              acceptedAt: new Date().toISOString(),
              finalPrice: item.finalPrice ?? item.estimatedPrice,
            }
          : item,
      ),
    );

    try {
      const response = await fetch(`/api/tasks/${id}/accept`, {
        method: "POST",
      });
      const data = (await response.json()) as { task?: Task; error?: string };

      if (!response.ok || !data.task) {
        throw new Error(data.error ?? "Accept failed.");
      }

      setTasks((current) =>
        current.map((item) => (item.id === id ? data.task! : item)),
      );
      setNotice(`Accepted request #${id}.`);
    } catch (error) {
      setTasks(previousTasks);
      throw error;
    }
  }

  async function retryTaskSlice(sliceJobId: number) {
    const previousTasks = tasks;
    const target = tasks.find((task) => task.sliceJobId === sliceJobId);
    if (!target) {
      throw new Error("Slice job not found.");
    }

    setTasks((current) =>
      current.map((task) =>
        task.sliceJobId === sliceJobId
          ? {
              ...task,
              estimateState: "pending",
              estimateError: null,
              sliceJobStatus: "queued",
              sliceJobLastError: null,
              weightGrams: null,
              durationMinutes: null,
              estimatedPrice: null,
            }
          : task,
      ),
    );

    try {
      const response = await fetch(`/api/slice-jobs/${sliceJobId}/retry`, {
        method: "POST",
      });
      const data = (await response.json()) as { task?: Task; error?: string };
      if (!response.ok || !data.task) {
        throw new Error(data.error ?? "Retry failed.");
      }

      setTasks((current) =>
        current.map((task) => (task.id === data.task?.id ? data.task : task)),
      );
      setNotice(`Queued slice retry for request #${data.task.id}.`);
    } catch (error) {
      setTasks(previousTasks);
      throw error;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {notice ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-success-soft px-4 py-3 text-sm text-foreground">
          <Check className="mt-0.5 size-4 shrink-0 text-success" />
          <p>{notice}</p>
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]">
        <div className="surface overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div>
              <p className="eyebrow">Filaments</p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-foreground">
                Active material pricing
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {filaments.filter((filament) => filament.available).length} available
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Material</th>
                <th>Color</th>
                <th>Price/kg</th>
                <th>Preset</th>
                <th>Available</th>
              </tr>
              </thead>
              <tbody>
                <NewFilamentRow onCreate={createNewFilament} />
                {filaments.map((filament) => (
                  <FilamentRow
                    filament={filament}
                    key={`${filament.id}-${filament.brand}-${filament.material}-${filament.color}-${filament.pricePerKg}-${filament.available}`}
                    onCommit={saveFilament}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <MachinePricePanel
          key={`settings-${settings.machineHourPrice}`}
          machineHourPrice={settings.machineHourPrice}
          onCommit={saveMachineHourPrice}
        />
      </section>

      <section className="surface overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
            <div>
              <p className="eyebrow">Tasks</p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-foreground">
                Requests and production queue
              </h2>
            </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex h-11 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm text-muted-foreground">
              <Filter className="size-4" />
              <select
                className="bg-transparent text-sm text-foreground outline-none"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as "all" | TaskStatus)
                }
              >
                <option value="all">All statuses</option>
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex h-11 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm text-muted-foreground">
              <span>Estimate</span>
              <select
                className="bg-transparent text-sm text-foreground outline-none"
                value={estimateFilter}
                onChange={(event) =>
                  setEstimateFilter(event.target.value as "all" | EstimateState)
                }
              >
                <option value="all">All estimates</option>
                {ESTIMATE_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex h-11 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm text-muted-foreground">
              <span>Sort</span>
              <select
                className="bg-transparent text-sm text-foreground outline-none"
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
              >
                <option value="newest">Newest first</option>
                <option value="name">Name</option>
                <option value="estimate">Highest estimate</option>
                <option value="status">Status</option>
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table min-w-[1480px]">
            <thead>
              <tr>
                <th>Request</th>
                <th>Request state</th>
                <th>Filament</th>
                <th>Qty</th>
                <th>Weight</th>
                <th>Duration</th>
                <th>Estimate</th>
                <th>Est. price</th>
                <th>Final price</th>
                <th>Status</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleTasks.map((task) => (
                <TaskRow
                  filaments={filaments}
                  key={`${task.id}-${task.nameOrLink}-${task.filamentId}-${task.quantity}-${task.weightGrams ?? ""}-${task.durationMinutes ?? ""}-${task.estimatedPrice ?? ""}-${task.finalPrice ?? ""}-${task.status}-${task.estimateState}`}
                  machineHourPrice={settings.machineHourPrice}
                  onAccept={acceptRequest}
                  onCommit={saveTask}
                  onRetrySlice={retryTaskSlice}
                  task={task}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MachinePricePanel({
  machineHourPrice,
  onCommit,
}: {
  machineHourPrice: number;
  onCommit: (value: string) => Promise<number>;
}) {
  const [value, setValue] = useState(String(machineHourPrice));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const commit = () => {
    startTransition(() => {
      void onCommit(value)
        .then((nextValue) => {
          setValue(String(nextValue));
          setError(null);
        })
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : "Save failed.");
          setValue(String(machineHourPrice));
        });
    });
  };

  return (
    <div className="surface flex flex-col gap-5 p-5 sm:p-6">
      <div className="space-y-2">
        <p className="eyebrow">Settings</p>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
          Machine hour price
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          One value controls machine cost across ready estimates.
        </p>
      </div>

      <label className="space-y-2">
        <span className="text-sm font-medium text-foreground">Price per hour</span>
        <div className="flex items-center gap-3 rounded-[24px] border border-border bg-white px-4 py-3">
          <Settings2 className="size-4 text-muted-foreground" />
          <input
            className="w-full bg-transparent text-xl font-semibold tracking-[-0.02em] text-foreground outline-none"
            inputMode="decimal"
            value={value}
            onBlur={commit}
            onChange={(event) => setValue(event.target.value)}
          />
          <span className="text-sm text-muted-foreground">EUR / hr</span>
        </div>
      </label>

      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-danger-soft px-4 py-3 text-sm text-foreground">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
          <p>{error}</p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-white/72 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Current rate
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
          {Number.isFinite(Number(value)) ? formatCurrency(Number(value)) : "--"}
        </p>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          {isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
          Autosaves on blur
        </p>
      </div>
    </div>
  );
}

function FilamentRow({
  filament,
  onCommit,
}: {
  filament: Filament;
  onCommit: (id: number, draft: FilamentDraft) => Promise<Filament>;
}) {
  const [draft, setDraft] = useState<FilamentDraft>({
    brand: filament.brand,
    material: filament.material,
    color: filament.color,
    pricePerKg: String(filament.pricePerKg),
    presetKey: filament.presetKey,
    available: filament.available,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const commit = (nextDraft = draft) => {
    startTransition(() => {
      void onCommit(filament.id, nextDraft)
        .then((saved) => {
          setDraft({
            brand: saved.brand,
            material: saved.material,
            color: saved.color,
            pricePerKg: String(saved.pricePerKg),
            presetKey: saved.presetKey,
            available: saved.available,
          });
          setError(null);
        })
        .catch((reason: unknown) => {
          setDraft({
            brand: filament.brand,
            material: filament.material,
            color: filament.color,
            pricePerKg: String(filament.pricePerKg),
            presetKey: filament.presetKey,
            available: filament.available,
          });
          setError(reason instanceof Error ? reason.message : "Save failed.");
        });
    });
  };

  return (
    <tr className="bg-white/56">
      <td>
        <input
          className="table-input"
          value={draft.brand}
          onBlur={() => commit()}
          onChange={(event) =>
            setDraft((current) => ({ ...current, brand: event.target.value }))
          }
        />
      </td>
      <td>
        <input
          className="table-input"
          value={draft.material}
          onBlur={() => commit()}
          onChange={(event) =>
            setDraft((current) => ({ ...current, material: event.target.value }))
          }
        />
      </td>
      <td>
        <input
          className="table-input"
          value={draft.color}
          onBlur={() => commit()}
          onChange={(event) =>
            setDraft((current) => ({ ...current, color: event.target.value }))
          }
        />
      </td>
      <td>
        <div className="space-y-2">
          <input
            className="table-input"
            inputMode="decimal"
            value={draft.pricePerKg}
            onBlur={() => commit()}
            onChange={(event) =>
              setDraft((current) => ({ ...current, pricePerKg: event.target.value }))
            }
          />
          {isPending ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-3 animate-spin" />
              Saving
            </p>
          ) : null}
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      </td>
      <td className="min-w-[240px]">
        <select
          className="table-select"
          value={draft.presetKey}
          onBlur={() => commit()}
          onChange={(event) =>
            setDraft((current) => ({ ...current, presetKey: event.target.value }))
          }
        >
          {PRUSA_PRESET_OPTIONS.map((preset) => (
            <option key={preset.key} value={preset.key}>
              {preset.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <label className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-2 text-sm text-foreground">
          <input
            checked={draft.available}
            type="checkbox"
            onChange={(event) => {
              const nextDraft = { ...draft, available: event.target.checked };
              setDraft(nextDraft);
              commit(nextDraft);
            }}
          />
          {draft.available ? "Yes" : "No"}
        </label>
      </td>
    </tr>
  );
}

function NewFilamentRow({
  onCreate,
}: {
  onCreate: (draft: FilamentDraft) => Promise<Filament>;
}) {
  const [draft, setDraft] = useState<FilamentDraft>({
    brand: "",
    material: "",
    color: "",
    pricePerKg: "",
    presetKey: PRUSA_PRESET_OPTIONS[0]?.key ?? "pla-default",
    available: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reset = () => {
    setDraft({
      brand: "",
      material: "",
      color: "",
      pricePerKg: "",
      presetKey: PRUSA_PRESET_OPTIONS[0]?.key ?? "pla-default",
      available: true,
    });
  };

  const create = () => {
    startTransition(() => {
      void onCreate(draft)
        .then(() => {
          reset();
          setError(null);
        })
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : "Create failed.");
        });
    });
  };

  const canCreate =
    draft.brand.trim() &&
    draft.material.trim() &&
    draft.color.trim() &&
    Number.isFinite(Number(draft.pricePerKg)) &&
    Number(draft.pricePerKg) > 0;

  return (
    <tr className="bg-accent-soft/35">
      <td>
        <input
          className="table-input"
          placeholder="Brand"
          value={draft.brand}
          onChange={(event) =>
            setDraft((current) => ({ ...current, brand: event.target.value }))
          }
        />
      </td>
      <td>
        <input
          className="table-input"
          placeholder="Material"
          value={draft.material}
          onChange={(event) =>
            setDraft((current) => ({ ...current, material: event.target.value }))
          }
        />
      </td>
      <td>
        <input
          className="table-input"
          placeholder="Color"
          value={draft.color}
          onChange={(event) =>
            setDraft((current) => ({ ...current, color: event.target.value }))
          }
        />
      </td>
      <td>
        <div className="space-y-2">
          <input
            className="table-input"
            inputMode="decimal"
            placeholder="24.90"
            value={draft.pricePerKg}
            onChange={(event) =>
              setDraft((current) => ({ ...current, pricePerKg: event.target.value }))
            }
          />
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      </td>
      <td className="min-w-[240px]">
        <select
          className="table-select"
          value={draft.presetKey}
          onChange={(event) =>
            setDraft((current) => ({ ...current, presetKey: event.target.value }))
          }
        >
          {PRUSA_PRESET_OPTIONS.map((preset) => (
            <option key={preset.key} value={preset.key}>
              {preset.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-2 text-sm text-foreground">
            <input
              checked={draft.available}
              type="checkbox"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  available: event.target.checked,
                }))
              }
            />
            {draft.available ? "Yes" : "No"}
          </label>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-full bg-foreground px-3 text-sm font-medium text-white transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-foreground/30"
            disabled={!canCreate || isPending}
            type="button"
            onClick={create}
          >
            {isPending ? (
              <LoaderCircle className="size-3 animate-spin" />
            ) : (
              <Plus className="size-3" />
            )}
            Add
          </button>
        </div>
      </td>
    </tr>
  );
}

function TaskRow({
  task,
  filaments,
  machineHourPrice,
  onAccept,
  onCommit,
  onRetrySlice,
}: {
  task: Task;
  filaments: Filament[];
  machineHourPrice: number;
  onAccept: (id: number) => Promise<void>;
  onCommit: (id: number, draft: TaskDraft) => Promise<Task>;
  onRetrySlice: (sliceJobId: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TaskDraft>(taskToDraft(task));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isRetryPending, startRetryTransition] = useTransition();
  const [isAcceptPending, startAcceptTransition] = useTransition();

  const filament =
    filaments.find((item) => item.id === Number(draft.filamentId)) ?? filaments[0];
  const quantity = Number(draft.quantity);
  const hasWeight = draft.weightGrams.trim() !== "";
  const hasDuration = draft.durationInput.trim() !== "";
  const weightGrams = hasWeight ? Number(draft.weightGrams) : null;
  const durationMinutes = hasDuration ? parseDurationInput(draft.durationInput) : null;
  const liveEstimate =
    filament &&
    Number.isFinite(quantity) &&
    quantity > 0 &&
    weightGrams !== null &&
    Number.isFinite(weightGrams) &&
    weightGrams > 0 &&
    durationMinutes !== null &&
    durationMinutes > 0
      ? calculatePricing({
          weightGrams,
          durationMinutes,
          quantity,
          pricePerKg: filament.pricePerKg,
          machineHourPrice,
        }).estimatedPrice
      : task.estimatedPrice;

  const commit = (nextDraft = draft) => {
    startTransition(() => {
      void onCommit(task.id, nextDraft)
        .then((saved) => {
          setDraft(taskToDraft(saved));
          setError(null);
        })
        .catch((reason: unknown) => {
          setDraft(taskToDraft(task));
          setError(reason instanceof Error ? reason.message : "Save failed.");
        });
    });
  };

  const retrySlice = () => {
    if (!task.sliceJobId) {
      return;
    }

    startRetryTransition(() => {
      void onRetrySlice(task.sliceJobId!)
        .then(() => setError(null))
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : "Retry failed.");
        });
    });
  };

  const accept = () => {
    startAcceptTransition(() => {
      void onAccept(task.id)
        .then(() => setError(null))
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : "Accept failed.");
        });
    });
  };

  return (
    <tr className={taskRowClass(draft.status)}>
      <td className="min-w-[250px]">
        <div className="space-y-2">
          <input
            className="table-input"
            value={draft.nameOrLink}
            onBlur={() => commit()}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                nameOrLink: event.target.value,
              }))
            }
          />
          <input
            className="table-input"
            inputMode="url"
            placeholder="Reference link"
            value={draft.sourceUrl}
            onBlur={() => commit()}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                sourceUrl: event.target.value,
              }))
            }
          />
          <p className="text-xs text-muted-foreground">
            Created {formatDateTime(task.createdAt)}
          </p>
        </div>
      </td>
      <td className="w-[150px]">
        <SubmissionBadge submissionState={task.submissionState} />
      </td>
      <td className="min-w-[200px]">
        <select
          className="table-select"
          value={draft.filamentId}
          onBlur={() => commit()}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              filamentId: event.target.value,
            }))
          }
        >
          {filaments.map((item) => (
            <option key={item.id} value={item.id}>
              {filamentLabel(item)}
            </option>
          ))}
        </select>
      </td>
      <td className="w-[90px]">
        <input
          className="table-input"
          inputMode="numeric"
          value={draft.quantity}
          onBlur={() => commit()}
          onChange={(event) =>
            setDraft((current) => ({ ...current, quantity: event.target.value }))
          }
        />
      </td>
      <td className="w-[110px]">
        <input
          className="table-input"
          inputMode="decimal"
          placeholder="Pending"
          value={draft.weightGrams}
          onBlur={() => commit()}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              weightGrams: event.target.value,
            }))
          }
        />
      </td>
      <td className="w-[140px]">
        <div className="space-y-2">
          <input
            className="table-input"
            placeholder="Pending"
            value={draft.durationInput}
            onBlur={() => commit()}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                durationInput: event.target.value,
              }))
            }
          />
          <p className="text-xs text-muted-foreground">
            {durationMinutes ? formatDuration(durationMinutes) : "Use min or HH:MM"}
          </p>
        </div>
      </td>
      <td className="min-w-[200px]">
        <div className="space-y-2">
          <EstimateBadge
            estimateError={task.estimateError}
            estimateState={task.estimateState}
            sliceJobStatus={task.sliceJobStatus}
          />
          {task.estimateError ? (
            <p className="text-xs leading-5 text-danger">{task.estimateError}</p>
          ) : null}
          {task.sliceJobId && task.estimateState === "failed" ? (
            <button
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-white px-3 text-xs font-medium text-foreground transition hover:border-accent/30 hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isRetryPending}
              type="button"
              onClick={retrySlice}
            >
              {isRetryPending ? (
                <LoaderCircle className="size-3 animate-spin" />
              ) : (
                <RotateCcw className="size-3" />
              )}
              Retry slice
            </button>
          ) : null}
        </div>
      </td>
      <td className="w-[130px]">
        <p className="font-medium text-foreground">
          {liveEstimate === null ? "Pending" : formatCurrency(liveEstimate)}
        </p>
      </td>
      <td className="w-[140px]">
        <input
          className="table-input"
          inputMode="decimal"
          placeholder="Estimate"
          value={draft.finalPrice}
          onBlur={() => commit()}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              finalPrice: event.target.value,
            }))
          }
        />
      </td>
      <td className="min-w-[180px]">
        <select
          className={cn("table-select rounded-full border px-3", statusSelectClass(draft.status))}
          value={draft.status}
          onBlur={() => commit()}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              status: event.target.value as TaskStatus,
            }))
          }
        >
          {TASK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </td>
      <td className="min-w-[220px]">
        <div className="space-y-2">
          <textarea
            className="table-textarea"
            placeholder="Optional notes"
            value={draft.note}
            onBlur={() => commit()}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                note: event.target.value,
              }))
            }
          />
          {isPending ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-3 animate-spin" />
              Saving
            </p>
          ) : null}
          {error ? (
            <p className="flex items-center gap-2 text-xs text-danger">
              <AlertCircle className="size-3" />
              {error}
            </p>
          ) : null}
        </div>
      </td>
      <td className="min-w-[190px]">
        <div className="flex flex-col items-start gap-2">
          <button
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-white px-3 text-xs font-medium text-foreground transition hover:border-accent/30 hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              Boolean(task.acceptedAt) ||
              task.estimateState !== "ready" ||
              isAcceptPending
            }
            type="button"
            onClick={accept}
          >
            {isAcceptPending ? (
              <LoaderCircle className="size-3 animate-spin" />
            ) : (
              <Check className="size-3" />
            )}
            {task.acceptedAt ? "Accepted" : "Accept"}
          </button>
          {task.sourceArtifactId ? (
            <a
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-white px-3 text-xs font-medium text-foreground transition hover:border-accent/30 hover:bg-accent/5"
              href={`/api/artifacts/${task.sourceArtifactId}/download`}
            >
              <Download className="size-3" />
              Download model
            </a>
          ) : null}
          {task.acceptedAt ? (
            <p className="text-xs text-muted-foreground">
              Locked {formatDateTime(task.acceptedAt)}
            </p>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function taskToDraft(task: Task): TaskDraft {
  return {
    nameOrLink: task.nameOrLink,
    sourceUrl: task.sourceUrl ?? "",
    filamentId: String(task.filamentId),
    quantity: String(task.quantity),
    weightGrams: task.weightGrams === null ? "" : String(task.weightGrams),
    durationInput: task.durationMinutes === null ? "" : String(task.durationMinutes),
    finalPrice: task.finalPrice === null ? "" : String(task.finalPrice),
    status: task.status,
    note: task.note,
  };
}

function taskRowClass(status: TaskStatus) {
  if (status === "done") {
    return "bg-success-soft/70";
  }

  if (status === "failed" || status === "cancelled") {
    return "bg-danger-soft/55";
  }

  if (status === "printing") {
    return "bg-warning-soft/55";
  }

  return "bg-white/56";
}

function statusSelectClass(status: TaskStatus) {
  if (status === "done") {
    return "border-emerald-200 bg-success-soft text-foreground";
  }

  if (status === "printing") {
    return "border-amber-300 bg-warning-soft text-foreground";
  }

  if (status === "failed" || status === "cancelled") {
    return "border-rose-200 bg-danger-soft text-foreground";
  }

  return "border-border bg-white text-foreground";
}

function buildOptimisticTask(params: {
  currentTask?: Task;
  draft: TaskDraft;
  filament: Filament;
  machineHourPrice: number;
  weightGrams: number | null;
  durationMinutes: number | null;
}): Task {
  const currentTask = params.currentTask;
  const hasReadyEstimate =
    params.weightGrams !== null && params.durationMinutes !== null;

  return {
    id: currentTask?.id ?? 0,
    nameOrLink: params.draft.nameOrLink.trim(),
    sourceUrl: params.draft.sourceUrl.trim() || null,
    filamentId: params.filament.id,
    quantity: Number(params.draft.quantity),
    weightGrams: params.weightGrams,
    durationMinutes: params.durationMinutes,
    estimatedPrice: hasReadyEstimate
      ? calculatePricing({
          weightGrams: params.weightGrams!,
          durationMinutes: params.durationMinutes!,
          quantity: Number(params.draft.quantity),
          pricePerKg: params.filament.pricePerKg,
          machineHourPrice: params.machineHourPrice,
        }).estimatedPrice
      : currentTask?.estimatedPrice ?? null,
    finalPrice:
      params.draft.finalPrice.trim() === "" ? null : Number(params.draft.finalPrice),
    status: params.draft.status,
    acceptedAt: currentTask?.acceptedAt ?? null,
    submissionState: currentTask?.submissionState ?? "submitted",
    submittedAt: currentTask?.submittedAt ?? currentTask?.createdAt ?? new Date().toISOString(),
    estimateState: hasReadyEstimate
      ? "ready"
      : (currentTask?.estimateState ?? "pending"),
    estimateSource: hasReadyEstimate
      ? "manual"
      : (currentTask?.estimateSource ?? "prusa"),
    estimateError: hasReadyEstimate ? null : (currentTask?.estimateError ?? null),
    note: params.draft.note.trim(),
    createdAt: currentTask?.createdAt ?? new Date().toISOString(),
    filamentLabel: filamentLabel(params.filament),
    sourceArtifactId: currentTask?.sourceArtifactId ?? null,
    sliceJobId: currentTask?.sliceJobId ?? null,
    sliceJobStatus: hasReadyEstimate
      ? currentTask?.sliceJobStatus ?? null
      : (currentTask?.sliceJobStatus ?? null),
    sliceJobLastError: hasReadyEstimate ? null : (currentTask?.sliceJobLastError ?? null),
  };
}

function EstimateBadge({
  estimateState,
  sliceJobStatus,
  estimateError,
}: {
  estimateState: EstimateState;
  sliceJobStatus: Task["sliceJobStatus"];
  estimateError: string | null;
}) {
  const label =
    estimateState === "ready"
      ? "Ready"
      : estimateState === "failed"
        ? "Needs review"
        : sliceJobStatus === "running"
          ? "Slicing"
          : "Queued";

  return (
    <span
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold uppercase tracking-[0.14em]",
        estimateState === "ready"
          ? "border-emerald-200 bg-success-soft text-foreground"
          : estimateState === "failed"
            ? "border-rose-200 bg-danger-soft text-foreground"
            : "border-zinc-200 bg-zinc-100 text-foreground",
      )}
      title={estimateError ?? undefined}
    >
      {label}
    </span>
  );
}

function SubmissionBadge({
  submissionState,
}: {
  submissionState: SubmissionState;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold uppercase tracking-[0.14em]",
        submissionState === "submitted"
          ? "border-emerald-200 bg-success-soft text-foreground"
          : "border-zinc-200 bg-zinc-100 text-foreground",
      )}
    >
      {submissionState === "submitted" ? "Submitted" : "Draft"}
    </span>
  );
}
