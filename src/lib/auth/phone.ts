export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length < 2) return `(${digits}`;
  const prefix = `(${digits.slice(0, 2)})`;
  const number = digits.slice(2);
  if (!number) return prefix;
  const split = number.length > 8 ? 5 : 4;
  return `${prefix} ${number.slice(0, split)}${number.length > split ? `-${number.slice(split)}` : ""}`;
}

export function formatPhoneEdit(
  previous: string,
  input: string,
  cursor: number,
  inputType?: string,
) {
  let digits = input.replace(/\D/g, "");
  let beforeCursor = input.slice(0, cursor).replace(/\D/g, "").length;
  if (
    input !== previous &&
    digits === previous.replace(/\D/g, "") &&
    (inputType === "deleteContentBackward" ||
      inputType === "deleteContentForward")
  ) {
    const index =
      beforeCursor - (inputType === "deleteContentBackward" ? 1 : 0);
    if (index >= 0 && index < digits.length) {
      digits = digits.slice(0, index) + digits.slice(index + 1);
      if (inputType === "deleteContentBackward") beforeCursor -= 1;
    }
  }
  const value = formatPhone(digits);
  if (cursor === input.length) return { value, cursor: value.length };
  let position = 0;
  let count = 0;
  while (position < value.length && count < beforeCursor) {
    if (/\d/.test(value[position])) count += 1;
    position += 1;
  }
  return {
    value,
    cursor: beforeCursor === 0 && value.startsWith("(") ? 1 : position,
  };
}
