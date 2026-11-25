import { useColorScheme } from "react-native";

/** Cores do MAG CRM web (bordô da marca, neutros levemente quentes), com a variante escura. */
const light = {
  bg: "#F6F5F5",
  surface: "#FFFFFF",
  surfaceAlt: "#F0ECED",
  ink: "#1F1B1C",
  muted: "#5F5759",
  line: "#E3DDDE",
  accent: "#981B28",
  onAccent: "#FFFFFF",
  accentSoft: "#F7E8EA",
  bubbleOut: "#F7E8EA",
  bubbleIn: "#FFFFFF",
  ok: "#1D7543",
  okSoft: "#E2F2E8",
  warn: "#8F5B00",
  warnSoft: "#FAEFD7",
  bad: "#BF3418",
  badSoft: "#FBE5DF",
  read: "#1F6FBF",
};
type Palette = typeof light;
const dark: Palette = {
  bg: "#151213",
  surface: "#1F1B1C",
  surfaceAlt: "#2A2425",
  ink: "#F1ECED",
  muted: "#ADA4A6",
  line: "#383133",
  accent: "#E7798A",
  onAccent: "#1F1B1C",
  accentSoft: "#3A1E23",
  bubbleOut: "#3A1E23",
  bubbleIn: "#262122",
  ok: "#63C98F",
  okSoft: "#16301F",
  warn: "#E9B551",
  warnSoft: "#382A10",
  bad: "#F2836A",
  badSoft: "#3B1C15",
  read: "#8AB4F8",
};

export type Theme = Palette & { dark: boolean };
export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === "dark" ? { ...dark, dark: true } : { ...light, dark: false };
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const font = { small: 13, body: 15, title: 17, h2: 22, h1: 28 } as const;
/** Área mínima de toque recomendada no Android (48 dp). */
export const touch = 48;
