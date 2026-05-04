import Link from "next/link";
import { AdminDashboard } from "@/components/admin-dashboard";
import { getAdminPageData } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  const data = getAdminPageData();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-8 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-[28px] border border-border/80 bg-panel/80 px-5 py-5 shadow-[0_20px_60px_-40px_rgba(17,24,39,0.4)] backdrop-blur md:flex-row md:items-end md:justify-between md:px-7">
        <div className="max-w-3xl space-y-3">
          <p className="eyebrow">Admin</p>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-[2.3rem]">
              Pricing and task control in one screen.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              Update filament pricing inline, tune machine cost, and move print
              jobs from estimate to done without leaving the table.
            </p>
          </div>
        </div>
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-white px-5 text-sm font-medium text-foreground transition hover:border-accent/30 hover:bg-accent/5"
        >
          Back to requests
        </Link>
      </header>

      <AdminDashboard
        initialFilaments={data.filaments}
        initialSettings={data.settings}
        initialTasks={data.tasks}
      />
    </main>
  );
}
