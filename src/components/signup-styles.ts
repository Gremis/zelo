export const signupStyles = {
  screen:
    "relative flex flex-1 items-start justify-center [padding-right:max(16px,env(safe-area-inset-right,0px))] [padding-left:max(16px,env(safe-area-inset-left,0px))] bg-[#f6f7f9] text-[#111827] [color-scheme:light] [-webkit-font-smoothing:auto] [-moz-osx-font-smoothing:auto] [font-family:var(--font-signup-ui),system-ui,sans-serif] text-[14px] leading-[1.45] [&_:is(input,button,a,select):focus-visible]:[outline:2px_solid_#0f766e] [&_:is(input,button,a,select):focus-visible]:outline-offset-[2px]",
  "screen-start": "pt-[40px] pb-[56px]",
  "screen-centered": "min-h-dvh py-[40px]",
  card: "flex flex-col gap-[16px] w-[min(420px,100%)] min-w-0 border border-[#e5e7eb] rounded-[14px] p-[28px] bg-white [@media(max-width:560px)]:px-[18px] [@media(max-width:560px)]:py-[22px]",
  header: "m-0",
  brand:
    "flex w-fit items-center gap-[9px] mb-[16px] [font-family:var(--font-signup-heading),system-ui,sans-serif] text-[17px] font-bold",
  "brand-mark":
    "flex flex-[0_0_26px] items-center justify-center size-[26px] rounded-[7px] [&_svg]:size-[26px]",
  title:
    "m-0 [font-family:var(--font-signup-heading),system-ui,sans-serif] text-[24px] font-bold leading-[1.45] tracking-[-0.01em] text-balance",
  description: "mt-[6px] mr-0 mb-0 ml-0 text-[#4b5563] [&_strong]:font-bold",
  form: "flex flex-col gap-[14px] min-w-0 m-0",
  fields: "flex flex-col gap-[14px] min-w-0 m-0",
  field: "flex flex-col gap-[5px] min-w-0 text-[13px] font-semibold",
  label: "text-[13px] font-semibold",
  hint: "text-[#6b7280] [font-size:smaller] font-normal leading-[1.45]",
  "password-wrap": "relative",
  "password-toggle":
    "absolute top-0 right-[6px] bottom-0 px-[8px] py-[6px] rounded-[4px] text-[#0b5e58] text-[12.5px] font-semibold cursor-pointer",
  requirements:
    "flex flex-col gap-[3px] mt-[9px] text-[12.5px] font-normal leading-[1.45]",
  requirement: "text-[#6b7280] before:content-['○_']",
  "requirement-met": "text-[#067647] before:content-['✓_']",
  consent: "flex items-start gap-[8px] text-[13px] font-normal cursor-pointer",
  checkbox:
    "shrink-0 size-[13px] mt-[3px] mr-[3px] mb-[3px] ml-[4px] [accent-color:auto]",
  error: "text-[#b42318] text-[12.5px] font-medium leading-[1.45]",
  submit:
    "inline-flex items-center justify-center w-full min-h-[44px] border border-[#0f766e] rounded-[8px] px-[14px] py-[11px] bg-[#0f766e] text-white [font-family:inherit] text-[14px] font-semibold leading-[1.45] cursor-pointer enabled:hover:border-[#0b5e58] enabled:hover:bg-[#0b5e58] disabled:opacity-50 disabled:cursor-not-allowed",
  footer:
    "border-t border-[#e5e7eb] pt-[14px] text-[#4b5563] text-[13.5px] text-center",
  link: "inline-block rounded-[3px] text-[#0b5e58] font-semibold underline underline-offset-[3px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
  status: "text-[#4b5563] [overflow-wrap:anywhere]",
  actions: "flex flex-wrap items-center justify-between gap-[16px] text-[13px]",
  help: "text-[#6b7280] text-[12.5px] font-normal leading-[1.45]",
  input:
    "w-full min-w-0 border border-[#d0d5dd] rounded-[8px] px-[10px] py-[8px] bg-white text-[#111827] font-semibold leading-[1.45] placeholder:text-[#757575] placeholder:opacity-100 placeholder:font-semibold aria-invalid:border-[#b42318] disabled:bg-[#f6f7f9] disabled:text-[#6b7280] [font-family:inherit] text-[13px]",
  "password-input":
    "w-full min-w-0 border border-[#d0d5dd] rounded-[8px] px-[10px] py-[8px] bg-white text-[#111827] font-semibold leading-[1.45] placeholder:text-[#757575] placeholder:opacity-100 placeholder:font-semibold aria-invalid:border-[#b42318] disabled:bg-[#f6f7f9] disabled:text-[#6b7280] [font-family:inherit] text-[13px] pr-[84px]",
  code: "w-full min-w-0 border border-[#d0d5dd] rounded-[8px] px-[10px] py-[8px] bg-white text-[#111827] font-semibold leading-[1.45] placeholder:text-[#757575] placeholder:opacity-100 placeholder:font-semibold aria-invalid:border-[#b42318] disabled:bg-[#f6f7f9] disabled:text-[#6b7280] min-h-[44px] [font-family:var(--font-signup-code),monospace] text-[18px] text-center tracking-[0.3em]",
} as const;
