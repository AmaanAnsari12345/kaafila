import Image from "next/image";
import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="glass-panel w-full max-w-md rounded-lg p-8 text-center">
        <Image src="/brand/kaafila-mark.svg" width={64} height={64} alt="KAAFILA" className="mx-auto mb-6" />
        <h1 className="text-2xl font-semibold">You're offline</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your position syncs when signal returns. Breakdown guides and emergency numbers still work.
        </p>
        <div className="mt-5 grid gap-2">
          <Link href="/roadside" className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">
            Open roadside guides
          </Link>
          <a href="tel:112" className="rounded-lg bg-rose-600 px-4 py-2 font-medium text-white">
            Call 112
          </a>
        </div>
      </section>
    </main>
  );
}
