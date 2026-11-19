export type SignupFormValues = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  acceptedTerms: boolean;
};

export function getPasswordRequirements(password: string) {
  return [
    { label: "Pelo menos 8 caracteres", met: Array.from(password).length >= 8 },
    { label: "Pelo menos uma letra", met: /\p{L}/u.test(password) },
    { label: "Pelo menos um número", met: /[0-9]/.test(password) },
  ];
}

export function validateSignup(values: SignupFormValues) {
  const errors: Partial<Record<keyof SignupFormValues, string>> = {};
  const names = values.fullName.trim().split(/\s+/u);
  if (names.length < 2 || names.some((name) => !/\p{L}/u.test(name))) {
    errors.fullName = "Digite nome e sobrenome.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = "Digite um e-mail válido, como nome@email.com.";
  }
  if (!/^\d{10,11}$/.test(values.phone.replace(/\D/g, ""))) {
    errors.phone = "Digite o celular com DDD.";
  }
  if (getPasswordRequirements(values.password).some(({ met }) => !met)) {
    errors.password = "A senha ainda não cumpre os requisitos abaixo.";
  }
  if (!values.acceptedTerms)
    errors.acceptedTerms =
      "Para criar a conta, aceite os termos de uso e a política de privacidade.";
  return errors;
}
