import { LatestReleaseList } from "./latest-release-list";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <section aria-labelledby="latest-release-heading">
          <div className="mb-5">
            <p className="text-sm font-semibold tracking-wide text-blue-600">
              LATEST RELEASES
            </p>
            <h2
              id="latest-release-heading"
              className="mt-1 text-2xl font-bold tracking-tight text-slate-950"
            >
              Technology별 최신 Release
            </h2>
          </div>

          <LatestReleaseList />
        </section>
      </div>
    </main>
  );
}
