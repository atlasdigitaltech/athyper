import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="space-y-4 text-center">
        <h1 className="text-6xl font-light text-muted-foreground">404</h1>
        <p className="text-lg text-muted-foreground">Page not found</p>
        <Link
          href="/wb/home"
          className="inline-block rounded-lg bg-primary px-6 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
