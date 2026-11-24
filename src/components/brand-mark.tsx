export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 26 26" aria-hidden="true">
      <rect width="26" height="26" rx="7" fill="#0F766E" />
      <rect x="6" y="7" width="14" height="3" rx="1.5" fill="#FEE4E2" />
      <rect x="6" y="11.5" width="10" height="3" rx="1.5" fill="#fff" />
      <rect
        x="6"
        y="16"
        width="7"
        height="3"
        rx="1.5"
        fill="#fff"
        opacity="0.7"
      />
    </svg>
  );
}
