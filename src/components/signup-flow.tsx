"use client";

import { createContext, useContext, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";

export type SignupDraft = {
  fullName: string;
  email: string;
  phone: string;
};

const SignupFlowContext = createContext<{
  confirmationComplete: boolean;
  setConfirmationComplete: Dispatch<SetStateAction<boolean>>;
  draft: SignupDraft;
  setDraft: Dispatch<SetStateAction<SignupDraft>>;
  recoveryEmail: string;
  setRecoveryEmail: Dispatch<SetStateAction<string>>;
  registrationId: string | null;
  setRegistrationId: Dispatch<SetStateAction<string | null>>;
} | null>(null);

export function SignupFlowProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<SignupDraft>({
    fullName: "",
    email: "",
    phone: "",
  });
  const [confirmationComplete, setConfirmationComplete] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  return (
    <SignupFlowContext.Provider
      value={{
        confirmationComplete,
        setConfirmationComplete,
        draft,
        setDraft,
        recoveryEmail,
        setRecoveryEmail,
        registrationId,
        setRegistrationId,
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
