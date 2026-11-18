"use client";

import { useId } from "react";
import { useSignupFlow } from "@/components/signup-flow";
import {
  isRegistrationDemoEnabled,
  registrationDemoScenarios,
} from "@/lib/auth/registration-demo";
import type { RegistrationDemoScenario } from "@/lib/auth/registration-demo";

export function RegistrationDemoNotice() {
  const id = useId();
  const { demoScenario, setDemoScenario } = useSignupFlow();
  if (!isRegistrationDemoEnabled()) return null;
  return (
    <aside className="signup-demo" aria-label="Modo de demonstração">
      <p className="signup-demo-title">
        Demonstração — dados e respostas simulados
      </p>
      <p>Não há envio de e-mail, criação de conta ou sessão real.</p>
      <label htmlFor={id} className="signup-label">
        Cenário simulado
      </label>
      <select
        id={id}
        value={demoScenario}
        onChange={(event) =>
          setDemoScenario(event.target.value as RegistrationDemoScenario)
        }
        className="signup-input"
      >
        {registrationDemoScenarios.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <p>
        Limite simulado: 3 tentativas. O reenvio no fluxo normal reinicia as
        tentativas. As regras reais dependem do backend.
      </p>
    </aside>
  );
}
