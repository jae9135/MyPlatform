"use client";

import { createContext, useContext } from "react";

export type ErSelectionState = {
  selectedTableId: string | null;
  selectedTableIds: string[];
  selectedColumnName: string | null;
  showActions: boolean;
};

const defaultState: ErSelectionState = {
  selectedTableId: null,
  selectedTableIds: [],
  selectedColumnName: null,
  showActions: false,
};

export const ErSelectionContext = createContext<ErSelectionState>(defaultState);

export function useErSelection(): ErSelectionState {
  return useContext(ErSelectionContext);
}
