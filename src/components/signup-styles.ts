export const signupStyles = {
  screen:
    "relative flex flex-1 items-start justify-center pt-[40px] pb-[56px] [padding-right:max(16px,env(safe-area-inset-right,0px))] [padding-left:max(16px,env(safe-area-inset-left,0px))] bg-[#0b1210] text-[#f3f4f6] [color-scheme:dark] [-webkit-font-smoothing:auto] [-moz-osx-font-smoothing:auto] [font-family:var(--font-signup-ui),system-ui,sans-serif] text-[14px] leading-[1.45] [&_:is(input,button,a,select):focus-visible]:[outline:2px_solid_#2dd4bf] [&_:is(input,button,a,select):focus-visible]:outline-offset-[2px]",
  card: "flex flex-col gap-[16px] w-[min(420px,100%)] min-w-0 border border-white/10 rounded-[14px] p-[28px] bg-[#121a18] [@media(max-width:560px)]:px-[18px] [@media(max-width:560px)]:py-[22px]",
  header: "m-0",
  brand:
    "flex w-fit items-center gap-[9px] mb-[16px] [font-family:var(--font-signup-heading),system-ui,sans-serif] text-[17px] font-bold",
  "brand-mark":
    "flex flex-[0_0_26px] items-center justify-center size-[26px] rounded-[7px] [&_svg]:size-[26px]",
  title:
    "m-0 [font-family:var(--font-signup-heading),system-ui,sans-serif] text-[24px] font-bold leading-[1.45] tracking-[-0.01em] text-balance text-white",
  description: "mt-[6px] mr-0 mb-0 ml-0 text-[#cbd5e1] [&_strong]:font-bold",
  form: "flex flex-col gap-[14px] min-w-0 m-0",
  fields: "flex flex-col gap-[14px] min-w-0 m-0",
  field: "flex flex-col gap-[5px] min-w-0 text-[13px] font-semibold",
  label: "text-[13px] font-semibold",
  hint: "text-[#a3b4c6] [font-size:smaller] font-normal leading-[1.45]",
  "password-wrap": "relative",
  "password-toggle":
    "absolute top-0 right-[6px] bottom-0 px-[8px] py-[6px] rounded-[4px] text-teal-300 text-[12.5px] font-semibold cursor-pointer",
  requirements:
    "flex flex-col gap-[3px] mt-[9px] text-[12.5px] font-normal leading-[1.45]",
  requirement: "text-[#a3b4c6] before:content-['○_']",
  "requirement-met": "text-emerald-300 before:content-['✓_']",
  consent: "flex items-start gap-[8px] text-[13px] font-normal cursor-pointer",
  checkbox:
    "shrink-0 size-[13px] mt-[3px] mr-[3px] mb-[3px] ml-[4px] accent-teal-500",
  error: "text-red-300 text-[12.5px] font-medium leading-[1.45]",
  submit:
    "inline-flex items-center justify-center w-full min-h-[44px] border border-[#0f766e] rounded-[8px] px-[14px] py-[11px] bg-[#0f766e] text-white [font-family:inherit] text-[14px] font-semibold leading-[1.45] cursor-pointer enabled:hover:border-[#0b5e58] enabled:hover:bg-[#0b5e58] disabled:opacity-50 disabled:cursor-not-allowed",
  footer:
    "border-t border-white/10 pt-[14px] text-[#cbd5e1] text-[13.5px] text-center",
  link: "inline-block rounded-[3px] text-teal-300 font-semibold underline underline-offset-[3px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
  status: "text-[#cbd5e1] [overflow-wrap:anywhere]",
  actions: "flex flex-wrap items-center justify-between gap-[16px] text-[13px]",
  help: "text-[#a3b4c6] text-[12.5px] font-normal leading-[1.45]",
  input:
    "w-full min-w-0 border border-white/15 rounded-[8px] px-[10px] py-[8px] bg-white/5 text-zinc-50 font-semibold leading-[1.45] placeholder:text-[#a3b4c6] placeholder:opacity-100 placeholder:font-semibold aria-invalid:border-red-400 disabled:bg-white/10 disabled:text-zinc-400 [font-family:inherit] text-[13px]",
  "password-input":
    "w-full min-w-0 border border-white/15 rounded-[8px] px-[10px] py-[8px] bg-white/5 text-zinc-50 font-semibold leading-[1.45] placeholder:text-[#a3b4c6] placeholder:opacity-100 placeholder:font-semibold aria-invalid:border-red-400 disabled:bg-white/10 disabled:text-zinc-400 [font-family:inherit] text-[13px] pr-[84px]",
  code: "w-full min-w-0 border border-white/15 rounded-[8px] px-[10px] py-[8px] bg-white/5 text-zinc-50 font-semibold leading-[1.45] placeholder:text-[#a3b4c6] placeholder:opacity-100 placeholder:font-semibold aria-invalid:border-red-400 disabled:bg-white/10 disabled:text-zinc-400 min-h-[44px] [font-family:var(--font-signup-code),monospace] text-[18px] text-center tracking-[0.3em]",
} as const;
