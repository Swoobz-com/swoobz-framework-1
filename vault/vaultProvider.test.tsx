/**
 * Vault provider — grid-size regression tests (Tim 2026-05-26 SCENE-REBUILD).
 *
 * Tim ruling: support 3×3, 5×5, and 7×7. The provider's `setGridSize`
 * accepts those three values and clamps `mineCount` into `[1, total-1]`
 * for the new grid. Pre-rebuild it only accepted 5.
 *
 * No crypto mocking required: these tests stay in `lobby` / `bet-entry`
 * phases (no `placeBet` calls) so the round-secrets path never executes.
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GRID_SIZE_3X3, GRID_SIZE_5X5, GRID_SIZE_7X7 } from './vaultMath'
import { useVaultController } from './vaultProvider'

describe('vaultProvider.setGridSize', () => {
  it('starts at the default 5×5 grid', () => {
    const { result } = renderHook(() => useVaultController())
    expect(result.current.state.gridSize).toBe(GRID_SIZE_5X5)
  })

  it('accepts 3×3 and updates the grid size', () => {
    const { result } = renderHook(() => useVaultController())
    act(() => {
      result.current.setGridSize(GRID_SIZE_3X3)
    })
    expect(result.current.state.gridSize).toBe(GRID_SIZE_3X3)
  })

  it('accepts 7×7 (frontend preview — Phase 2 on-chain)', () => {
    const { result } = renderHook(() => useVaultController())
    act(() => {
      result.current.setGridSize(GRID_SIZE_7X7)
    })
    expect(result.current.state.gridSize).toBe(GRID_SIZE_7X7)
  })

  it('rejects unsupported sizes (the on-chain band is {3,5,7})', () => {
    const { result } = renderHook(() => useVaultController())
    const before = result.current.state.gridSize
    act(() => {
      result.current.setGridSize(4)
    })
    expect(result.current.state.gridSize).toBe(before)
    act(() => {
      result.current.setGridSize(6)
    })
    expect(result.current.state.gridSize).toBe(before)
    act(() => {
      result.current.setGridSize(9)
    })
    expect(result.current.state.gridSize).toBe(before)
  })

  it('clamps mineCount into [1, total-1] when shrinking 5→3 with mines=10', () => {
    const { result } = renderHook(() => useVaultController())
    act(() => {
      result.current.setMineCount(10)
    })
    expect(result.current.state.mineCount).toBe(10)
    act(() => {
      result.current.setGridSize(GRID_SIZE_3X3)
    })
    // 3×3 = 9 tiles → mineCount must drop to 8 (total-1).
    expect(result.current.state.gridSize).toBe(GRID_SIZE_3X3)
    expect(result.current.state.mineCount).toBeLessThanOrEqual(8)
    expect(result.current.state.mineCount).toBeGreaterThanOrEqual(1)
  })

  it('does NOT raise mineCount when growing 3→7 (3 stays valid for 7×7)', () => {
    const { result } = renderHook(() => useVaultController())
    act(() => {
      result.current.setGridSize(GRID_SIZE_3X3)
    })
    act(() => {
      result.current.setMineCount(3)
    })
    act(() => {
      result.current.setGridSize(GRID_SIZE_7X7)
    })
    expect(result.current.state.gridSize).toBe(GRID_SIZE_7X7)
    expect(result.current.state.mineCount).toBe(3)
  })
})
