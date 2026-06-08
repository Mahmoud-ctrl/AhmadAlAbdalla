export const UNITS = [
  'pcs',
  'kg',
  'g',
  'loaves',
  'bags',
  'packs',
  'boxes',
  'liters',
  'dozen',
  'trays',
  'rolls',
] as const

export type Unit = (typeof UNITS)[number]
