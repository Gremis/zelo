"use client";

import { createContext, useContext, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { RegistrationDemoScenario } from "@/lib/auth/registration-demo";

export type SignupDraft = {
  fullName: string;
  email: string;
  phone: string;
};

const SignupFlowContext = createContext<{
  draft: SignupDraft;
  setDraft: Dispatch<SetStateAction<SignupDraft>>;
  registrationId: string | null;
  setRegistrationId: Dispatch<SetStateAction<string | null>>;
  demoScenario: RegistrationDemoScenario;
  setDemoScenario: Dispatch<SetStateAction<RegistrationDemoScenario>>;
} | null>(null);

export function SignupFlowProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<SignupDraft>({
    fullName: "",
    email: "",
    phone: "",
  });
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [demoScenario, setDemoScenario] =
    useState<RegistrationDemoScenario>("standard");
  return (
    <SignupFlowContext.Provider
      value={{
        draft,
        setDraft,
        registrationId,
        setRegistrationId,
        demoScenario,
        setDemoScenario,
      }}
    >
      {children}
    </SignupFlowContext.Provider>
  );
}

export function useSignupFlow() {
  const context = useContext(SignupFlowContext);
  if (!context) throw new Error("SignupFlowProvider is required.");
  return context;
}
