"use client";

import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";

type RecoveryState = { email: string; code: string; passwordChanged: boolean };
const empty: RecoveryState = { email: "", code: "", passwordChanged: false };
const RecoveryContext = createContext<{
  state: RecoveryState;
  setState: Dispatch<SetStateAction<RecoveryState>>;
} | null>(null);

export function RecoveryFlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(empty);
  return (
    <RecoveryContext.Provider value={{ state, setState }}>
      {children}
    </RecoveryContext.Provider>
  );
}

export function useRecoveryFlow() {
  return useContext(RecoveryContext);
}
