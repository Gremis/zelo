export const fieldMessages = {
  name: "Dê um nome ao condomínio.",
  address: "Informe o endereço. Ele aparece no topo do formulário.",
};
export type Fields = { name: string; address: string };
export function validateFields(value: Fields) {
  return {
    ...(!value.name.trim() ? { name: fieldMessages.name } : {}),
    ...(!value.address.trim() ? { address: fieldMessages.address } : {}),
  };
}
export type Condominium = Fields & { id: string; slug: string; url: string };
