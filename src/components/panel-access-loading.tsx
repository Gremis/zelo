import { BrandMark } from "@/components/brand-mark";

export function PanelAccessLoading({
  title,
  compact = false,
}: {
  title: string;
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen bg-[#f6f7f9] text-[#111827] [color-scheme:light]"
    >
      <div
        aria-hidden="true"
        className="flex items-center gap-3 border-b border-[#e5e7eb] bg-white px-4 py-2.5"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-[#d0d5dd]">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M3 5h14M3 10h14M3 15h14" />
          </svg>
        </span>
        <span className="flex shrink-0 items-center gap-[9px] font-[family-name:var(--font-panel-heading)] text-[17px] font-bold">
          <BrandMark className="size-[26px] shrink-0" />
          Sindicondo
        </span>
        <span className="hidden min-w-0 truncate border-l border-[#e5e7eb] pl-3 font-medium text-[#4b5563] min-[561px]:block">
          {title}
        </span>
        <span className="flex-1" />
        <span className="size-[34px] shrink-0 rounded-full bg-[#e5e7eb]" />
      </div>
      <div
        className={`mx-auto px-4 pt-[22px] pb-10 ${compact ? "max-w-[1112px]" : "max-w-[1352px]"}`}
      >
        <p className="text-sm leading-[1.45] text-[#6b7280]">
          Carregando painel…
        </p>
        <div aria-hidden="true" className="mt-[18px] space-y-4">
          <div className="h-7 w-48 max-w-full rounded bg-[#e5e7eb]" />
          <div className="h-4 w-80 max-w-full rounded bg-[#e5e7eb]" />
          <div className="h-40 rounded-[10px] border border-[#e5e7eb] bg-white" />
        </div>
      </div>
    </div>
  );
}
