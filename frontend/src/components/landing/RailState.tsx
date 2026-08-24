"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

interface RailStateValue {
  collapsed: boolean;
  setCollapsed: Dispatch<SetStateAction<boolean>>;
}

const RailStateContext = createContext<RailStateValue | null>(null);

/**
 * Owns the catalogue-rail preference above both the catalogue and detail
 * routes, so client-side navigation does not reset it.
 */
export function RailStateProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const value = useMemo(() => ({ collapsed, setCollapsed }), [collapsed]);

  return <RailStateContext.Provider value={value}>{children}</RailStateContext.Provider>;
}

export function useRailState() {
  const state = useContext(RailStateContext);
  if (state === null) {
    throw new Error("useRailState must be used within RailStateProvider");
  }
  return state;
}
