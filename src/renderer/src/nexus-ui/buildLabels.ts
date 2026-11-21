import type { CatalogItem } from '@shared/dataDragon'

/** Kept out of the component files so Vite fast refresh keeps working on them. */
export const ROLE_LABEL: Record<string, string> = {
  top: 'Top',
  jungle: 'Jungle',
  middle: 'Mid',
  bottom: 'ADC',
  support: 'Support'
}

export function itemName(catalog: ReadonlyMap<number, CatalogItem> | null | undefined, itemId: number): string {
  return catalog?.get(itemId)?.name ?? `Item ${itemId}`
}

export function itemCost(catalog: ReadonlyMap<number, CatalogItem> | null | undefined, itemId: number): number | null {
  const total = catalog?.get(itemId)?.gold.total
  return typeof total === 'number' ? total : null
}
