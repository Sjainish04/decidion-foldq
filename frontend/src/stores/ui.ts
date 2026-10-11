import { create } from "zustand";

/** Shell chrome state: the mobile navigation drawer and the command palette.
 *  Shared because more than one control opens each (the keyboard shortcut and
 *  the top-bar search button both open the palette). */
interface UiState {
  navOpen: boolean;
  paletteOpen: boolean;
  setNavOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  togglePalette: () => void;
}

export const useUi = create<UiState>((set) => ({
  navOpen: false,
  paletteOpen: false,
  setNavOpen: (open) => set({ navOpen: open }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  togglePalette: () => set((state) => ({ paletteOpen: !state.paletteOpen })),
}));
