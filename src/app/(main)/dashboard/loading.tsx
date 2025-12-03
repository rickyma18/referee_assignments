export default function LoadingDashboard() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4">
      {/* Logo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/media/FMF_Logo.png" alt="FMF Logo" className="h-20 w-20 animate-pulse object-contain opacity-90" />

      {/* Spinner */}
      <div className="border-muted-foreground size-10 animate-spin rounded-full border-2 border-t-transparent" />

      {/* Texto */}
      <p className="text-muted-foreground text-sm">Cargando módulo…</p>
    </div>
  );
}
