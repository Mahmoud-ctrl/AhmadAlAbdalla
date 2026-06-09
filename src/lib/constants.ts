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

export const DECIMAL_UNITS = new Set<Unit>(['kg', 'g', 'liters'])

export function isDecimalUnit(unit: string): boolean {
  return DECIMAL_UNITS.has(unit as Unit)
}
