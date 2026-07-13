// Placeholder tokens — this is where a project's own visual identity goes.
// Nothing here is meant to survive first contact with a real brief.
export const color = {
  bg: '#0b0c0f',
  fg: '#f4f4f5',
  fgMuted: 'rgba(244, 244, 245, 0.6)',
  accent: '#6366f1',
} as const;

export const type = {
  sans: 'system-ui, -apple-system, sans-serif',
  weight: { regular: 400, medium: 500, semibold: 600 },
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 } as const;
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;
