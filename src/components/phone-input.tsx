"use client";

import { useLayoutEffect, useRef } from "react";
import type { InputHTMLAttributes } from "react";
import { formatPhone, formatPhoneEdit } from "@/lib/auth/phone";

type PhoneInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode" | "autoComplete"
> & {
  value: string;
  onValueChange: (value: string) => void;
};

export function PhoneInput({
  value,
  onValueChange,
  ...props
}: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selection = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (
      selection.current !== null &&
      inputRef.current === document.activeElement
    ) {
      inputRef.current?.setSelectionRange(selection.current, selection.current);
    }
    selection.current = null;
  });

  return (
    <input
      {...props}
      ref={inputRef}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={formatPhone(value)}
      onChange={(event) => {
        const input = event.currentTarget;
        const edit = formatPhoneEdit(
          formatPhone(value),
          input.value,
          input.selectionStart ?? input.value.length,
          (event.nativeEvent as InputEvent).inputType,
        );
        selection.current = edit.cursor;
        onValueChange(edit.value);
        input.value = edit.value;
        input.setSelectionRange(edit.cursor, edit.cursor);
      }}
    />
  );
}
