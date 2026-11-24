import type {
  PublicCondominium,
  RegistrationFields,
} from "../../src/lib/public-occurrences/contract";

export const publicCondominiumFixture: PublicCondominium = {
  name: "Condomínio de Revisão",
  address: "Rua de Exemplo, 210 · Belo Horizonte",
};

export const publicRegistrationFixture: RegistrationFields = {
  reporterName: "Ana",
  reporterUnitOrRole: "Porteiro",
  reporterPhone: "11900000000",
  location: "Hall de entrada",
  description: "Lâmpada apagada",
};
