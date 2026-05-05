import { UserRequestForm } from "@/components/user-request-form";
import { getUserPageData } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function Home() {
  const { filaments, settings } = getUserPageData();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex items-center justify-between rounded-[24px] border border-border/80 bg-panel/80 px-5 py-4 shadow-[0_20px_60px_-40px_rgba(17,24,39,0.4)] backdrop-blur">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-[-0.01em] text-foreground">
            3D print estimate
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a model, review the estimate, then send the request.
          </p>
        </div>
      </header>

      <UserRequestForm
        filaments={filaments}
        machineHourPrice={settings.machineHourPrice}
      />
    </main>
  );
}
