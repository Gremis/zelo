export default function TrackingNotFound() {
  return (
    <main className="min-h-dvh flex-1 bg-[#f6f7f9] px-4 py-6 text-sm leading-[1.45] text-[#111827] [color-scheme:light]">
      <div className="mx-auto w-full max-w-xl rounded-xl border border-[#e5e7eb] bg-white p-5">
        <h1 className="text-xl font-bold">Acompanhamento indisponível</h1>
        <p role="alert" className="mt-2 text-[#4b5563]">
          Não encontramos esta ocorrência. Confira o link que você recebeu.
        </p>
      </div>
    </main>
  );
}
