'use client'

/**
 * OO-Fisher cosmetics/perk ownership + equip state (UI layer, EV-neutral).
 *
 * Cosmetics are presentation only, so their owned/equipped state lives here
 * (localStorage), NOT in the money provider. Buying spends SCALES via the
 * provider's `spendScales` (the only money-adjacent step); everything else is
 * pure UI. Defaults (the free baseline of each category) are always owned.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  ALL_COSMETICS,
  cosmeticById,
  type CosmeticItem,
  DEFAULT_EQUIPPED,
  type EquippedCosmetics,
} from './ooFisherCosmetics'

const OWNED_KEY = 'swoobz.oo-fisher.cosmetics.owned.v1'
const EQUIPPED_KEY = 'swoobz.oo-fisher.cosmetics.equipped.v1'

const defaultOwned = (): Set<string> =>
  new Set(ALL_COSMETICS.filter((c) => c.isDefault).map((c) => c.id))

export interface FisherCosmetics {
  readonly owned: ReadonlySet<string>
  readonly equipped: EquippedCosmetics
  /** Try to buy a cosmetic/perk. Returns true on success (or already owned). */
  readonly buy: (id: string) => boolean
  /** Equip an owned cosmetic in its category. */
  readonly equip: (id: string) => void
  /** Is an EV-neutral perk owned? */
  readonly hasPerk: (perkId: string) => boolean
}

export function useFisherCosmetics(
  spendScales: (amountLamports: bigint) => boolean,
): FisherCosmetics {
  const [owned, setOwned] = useState<Set<string>>(defaultOwned)
  const [equipped, setEquipped] = useState<EquippedCosmetics>(DEFAULT_EQUIPPED)

  // Hydrate after mount (client-only) to avoid SSR mismatch.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const rawOwned = window.localStorage.getItem(OWNED_KEY)
      if (rawOwned) {
        const ids = JSON.parse(rawOwned) as string[]
        setOwned(new Set([...defaultOwned(), ...ids.filter((id) => cosmeticById(id))]))
      }
      const rawEq = window.localStorage.getItem(EQUIPPED_KEY)
      if (rawEq) {
        const eq = JSON.parse(rawEq) as Partial<EquippedCosmetics>
        setEquipped((cur) => ({ ...cur, ...eq }))
      }
    } catch {
      // corrupt storage — defaults stand
    }
  }, [])

  const persistOwned = (next: Set<string>): void => {
    try {
      window.localStorage.setItem(OWNED_KEY, JSON.stringify([...next]))
    } catch {
      /* degrade gracefully */
    }
  }
  const persistEquipped = (next: EquippedCosmetics): void => {
    try {
      window.localStorage.setItem(EQUIPPED_KEY, JSON.stringify(next))
    } catch {
      /* degrade gracefully */
    }
  }

  const equip = useCallback((id: string) => {
    const c = cosmeticById(id)
    if (!c || c.category === 'perk') return
    setEquipped((cur) => {
      const next = { ...cur, [c.category]: id } as EquippedCosmetics
      persistEquipped(next)
      return next
    })
  }, [])

  const buy = useCallback(
    (id: string): boolean => {
      const c: CosmeticItem | undefined = cosmeticById(id)
      if (!c) return false
      if (owned.has(id) || c.isDefault) {
        if (c.category !== 'perk') equip(id)
        return true
      }
      if (!spendScales(c.priceLamports)) return false
      setOwned((cur) => {
        const next = new Set(cur)
        next.add(id)
        persistOwned(next)
        return next
      })
      if (c.category !== 'perk') equip(id)
      return true
    },
    [owned, spendScales, equip],
  )

  const hasPerk = useCallback((perkId: string) => owned.has(perkId), [owned])

  return { owned, equipped, buy, equip, hasPerk }
}
