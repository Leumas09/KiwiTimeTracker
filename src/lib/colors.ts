/**
 * Project palette. The order was checked with a color-vision-deficiency
 * validator for adjacent pairs (stacked bars, donuts) in both themes.
 * Projects store the light value; dark mode swaps to the matching step.
 */
export const PALETTE: { light: string; dark: string }[] = [
  { light: '#5E9B2E', dark: '#6AA83A' }, // kiwi green
  { light: '#4A3AA7', dark: '#9085E9' }, // violet
  { light: '#E34948', dark: '#E66767' }, // red
  { light: '#2A78D6', dark: '#3987E5' }, // blue
  { light: '#EB6834', dark: '#D95926' }, // orange
  { light: '#1BAF7A', dark: '#199E70' }, // aqua
  { light: '#EDA100', dark: '#C98500' }, // yellow
  { light: '#E87BA4', dark: '#D55181' }, // magenta
]

export const NO_PROJECT_COLOR = { light: '#A3A3A3', dark: '#6B6B6B' }

const darkByLight = new Map(PALETTE.map((c) => [c.light.toUpperCase(), c.dark]))

export function displayColor(color: string | null | undefined, dark: boolean): string {
  if (!color) return dark ? NO_PROJECT_COLOR.dark : NO_PROJECT_COLOR.light
  return dark ? (darkByLight.get(color.toUpperCase()) ?? color) : color
}

/** First palette color not yet used, so new projects stay distinguishable. */
export function nextColor(used: string[]): string {
  const taken = new Set(used.map((c) => c.toUpperCase()))
  return (PALETTE.find((c) => !taken.has(c.light.toUpperCase())) ?? PALETTE[used.length % PALETTE.length]).light
}

/** Black or white text, whichever reads better on the given background. */
export function readableText(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const channel = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  // Contrast against white vs against near-black ink.
  return (1.05 / (luminance + 0.05)) >= ((luminance + 0.05) / 0.06) ? '#FFFFFF' : '#1A1A1A'
}
