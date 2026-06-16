"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-slate-950 text-white px-6 py-10">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-700 bg-slate-900/95 p-10 shadow-xl shadow-slate-950/40">
        <h1 className="text-3xl font-semibold">Something went wrong</h1>
        <p className="mt-4 text-slate-300">The application encountered an error while loading. Please try again.</p>
        <pre className="mt-6 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-sm text-rose-300">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 rounded-2xl bg-slate-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-600"
        >
          Reload page
        </button>
      </div>
    </main>
  );
}
