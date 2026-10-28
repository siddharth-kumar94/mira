import { useStore } from "zustand";
import { api } from "../api/client";
import { createAppStore, type AppState } from "./store";
import { createUiStore, type UiState } from "./ui";

export const appStore = createAppStore(api);
export const uiStore = createUiStore();

export const useApp = <T,>(selector: (s: AppState) => T): T => useStore(appStore, selector);
export const useUi = <T,>(selector: (s: UiState) => T): T => useStore(uiStore, selector);
/** Whole app state. Derive lists with useMemo; never return fresh arrays from a selector (zustand v5 needs stable snapshots). */
export const useAppState = (): AppState => useStore(appStore, (s) => s);
