/**
 * AUTOMAT — standalone Monte-Carlo + exact-EV verifier, ALL THREE TIERS.
 *   node vendingSim.mjs [packsPerTier]     (default 2_000_000)
 *
 * Byte-identical copies of the golden tier tables (assaySim pattern). Proofs:
 *   1. EXACT per tier: Σ weight·bps === 9650 · 100000.
 *   2. MONTE-CARLO per tier: measured RTP ≈ 0.9650, gold odds on target.
 */

const WEIGHT_TOTAL = 100_000n
const TARGET_RTP_BPS = 9_650n
const ONE_X_BPS = 10_000n

/** [id, class, multiplierBps, weight] per tier — golden copies. */
const TABLES = {
  easy: [
    ['dud', 'standard', 0n, 40_000n],
    ['q25', 'standard', 2_500n, 17_000n],
    ['h50', 'standard', 5_000n, 16_000n],
    ['x1', 'standard', 10_000n, 14_000n],
    ['x15', 'standard', 15_000n, 5_000n],
    ['x2', 'standard', 20_000n, 2_200n],
    ['x3', 'standard', 30_000n, 800n],
    ['g5', 'gold', 50_000n, 2_119n],
    ['g8', 'gold', 80_000n, 1_300n],
    ['g12', 'gold', 120_000n, 810n],
    ['g20', 'gold', 200_000n, 450n],
    ['g35', 'gold', 350_000n, 201n],
    ['g60', 'gold', 600_000n, 70n],
    ['g100', 'gold', 1_000_000n, 50n],
  ],
  medium: [
    ['dud', 'standard', 0n, 52_000n],
    ['h50', 'standard', 5_000n, 17_000n],
    ['x1', 'standard', 10_000n, 15_000n],
    ['x2', 'standard', 20_000n, 8_000n],
    ['x4', 'standard', 40_000n, 4_000n],
    ['g5', 'gold', 50_000n, 2_150n],
    ['g8', 'gold', 80_000n, 645n],
    ['g15', 'gold', 150_000n, 1_000n],
    ['g40', 'gold', 400_000n, 196n],
    ['g250', 'gold', 2_500_000n, 9n],
  ],
  hard: [
    ['dud', 'standard', 0n, 65_000n],
    ['h50', 'standard', 5_000n, 14_000n],
    ['x1', 'standard', 10_000n, 10_000n],
    ['x25', 'standard', 25_000n, 5_500n],
    ['x6', 'standard', 60_000n, 3_000n],
    ['g10', 'gold', 100_000n, 1_593n],
    ['g20', 'gold', 200_000n, 241n],
    ['g25', 'gold', 250_000n, 600n],
    ['g100', 'gold', 1_000_000n, 60n],
    ['g1000', 'gold', 10_000_000n, 6n],
  ],
}

const N = Number(process.argv[2] ?? 2_000_000)
const WAGER = 1_000_000n // 1 USDC per pack

for (const [tier, table] of Object.entries(TABLES)) {
  let weightSum = 0n
  let evSum = 0n
  let goldWeight = 0n
  for (const [, cls, bps, w] of table) {
    weightSum += w
    evSum += w * bps
    if (cls === 'gold') goldWeight += w
  }
  console.log(`\n═══ ${tier.toUpperCase()} ═══`)
  console.log(`Σ weights     = ${weightSum}  (must be ${WEIGHT_TOTAL})`)
  console.log(`Σ weight·bps  = ${evSum}  (must be ${TARGET_RTP_BPS * WEIGHT_TOTAL})`)
  console.log(`gold          = 1 in ${WEIGHT_TOTAL / goldWeight}`)
  if (weightSum !== WEIGHT_TOTAL) throw new Error(`${tier}: weight sum drift`)
  if (evSum !== TARGET_RTP_BPS * WEIGHT_TOTAL) throw new Error(`${tier}: EV identity drift`)

  const rollToPrize = (roll) => {
    let cum = 0n
    for (const row of table) {
      cum += row[3]
      if (roll < cum) return row
    }
    throw new Error('walk fell through')
  }
  let staked = 0n
  let paid = 0n
  let golds = 0
  let duds = 0
  for (let i = 0; i < N; i++) {
    const roll = BigInt(Math.floor(Math.random() * 100_000))
    const [, cls, bps] = rollToPrize(roll)
    staked += WAGER
    paid += (WAGER * bps) / ONE_X_BPS
    if (cls === 'gold') golds++
    if (bps === 0n) duds++
  }
  const rtp = Number((paid * 1_000_000n) / staked) / 1_000_000
  console.log(`measured RTP  = ${rtp.toFixed(5)} over ${N.toLocaleString()} packs`)
  console.log(`gold rate     = 1 in ${(N / golds).toFixed(1)} · any-return ${(((N - duds) / N) * 100).toFixed(1)}%`)
  // Hard is spiky (1000× at 6/100000): allow a wider MC band there.
  const band = tier === 'hard' ? 0.03 : 0.012
  if (Math.abs(rtp - 0.965) > band) throw new Error(`${tier}: Monte-Carlo RTP outside sanity band`)
}
console.log('\nPASS — all tiers: exact EV identity + Monte-Carlo in band.')
