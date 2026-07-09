/**
 * The Assay Line — Monte-Carlo RTP harness (standalone, run FOREGROUND).
 *
 *   node originals/assay/assaySim.mjs [trialsPerL]
 *
 * Faithful mechanic, run for ALL THREE difficulty tiers (lean/standard/flooded):
 * place BOMB_COUNT bad veins uniformly at random among TOTAL_TILES; pick a
 * claim-line of L distinct tiles uniformly at random; if the line is disjoint
 * from the veins the run pays wager × T(L), else 0. RTP = Σpayout / Σwager.
 * Seeded RNG (mulberry32) → reproducible. Every tier holds the SAME flat RTP
 * (~0.9650) — bomb density sets volatility only. The ladders here are the FROZEN
 * GOLDEN vectors (mirror of assayMath.GOLDEN_COIN_LADDER_BPS_BY_TIER); the vitest
 * suite couples them to the runtime formula.
 */
const TOTAL = 196
const MIN_L = 8
const MAX_L = 60
const ONE_X = 10000n

// Tier table — bombCount + its golden ladder [0..60]. Kept IN SYNC with
// assayMath.GOLDEN_COIN_LADDER_BPS_BY_TIER (balance-analyst flagged a stale-sim
// trap when a lagging vector drifts — update BOTH files in the same commit).
// Generated, not hand-typed; verified against the runtime formula in
// assayMath.test.ts's golden-vector test. SAFE = TOTAL − bombCount (derived,
// nothing hardcoded to old survival numbers).
const TIERS = [
  {
    id: 'lean',
    bombs: 6,
    ladder: [
      9650n, 9954n, 10270n, 10598n, 10938n, 11291n, 11657n, 12037n, 12432n, 12842n,
      13268n, 13710n, 14169n, 14647n, 15144n, 15660n, 16197n, 16755n, 17336n, 17941n,
      18571n, 19226n, 19909n, 20620n, 21361n, 22133n, 22938n, 23777n, 24652n, 25565n,
      26518n, 27512n, 28551n, 29635n, 30767n, 31951n, 33188n, 34481n, 35833n, 37247n,
      38727n, 40276n, 41898n, 43597n, 45376n, 47241n, 49196n, 51246n, 53396n, 55652n,
      58020n, 60507n, 63119n, 65863n, 68748n, 71781n, 74971n, 78328n, 81862n, 85583n,
      89502n,
    ],
  },
  {
    id: 'standard',
    bombs: 8,
    ladder: [
      9650n, 10060n, 10491n, 10942n, 11415n, 11911n, 12432n, 12978n, 13552n, 14154n,
      14787n, 15452n, 16150n, 16884n, 17656n, 18468n, 19322n, 20221n, 21167n, 22163n,
      23212n, 24317n, 25482n, 26710n, 28005n, 29372n, 30813n, 32335n, 33941n, 35639n,
      37432n, 39327n, 41331n, 43451n, 45693n, 48067n, 50580n, 53242n, 56063n, 59053n,
      62224n, 65587n, 69157n, 72946n, 76971n, 81247n, 85792n, 90626n, 95768n, 101240n,
      107067n, 113274n, 119888n, 126941n, 134463n, 142491n, 151062n, 160217n, 170001n, 180463n,
      191654n,
    ],
  },
  {
    id: 'flooded',
    bombs: 16,
    ladder: [
      9650n, 10507n, 11447n, 12475n, 13603n, 14840n, 16197n, 17686n, 19322n, 21119n,
      23096n, 25269n, 27662n, 30296n, 33199n, 36399n, 39928n, 43824n, 48126n, 52879n,
      58134n, 63947n, 70382n, 77510n, 85409n, 94169n, 103890n, 114683n, 126676n, 140011n,
      154847n, 171364n, 189765n, 210280n, 233168n, 258721n, 287269n, 319188n, 354901n, 394890n,
      439701n, 489952n, 546350n, 609695n, 680900n, 761006n, 851199n, 952835n, 1067462n, 1196851n,
      1343032n, 1508328n, 1695407n, 1907333n, 2147627n, 2420342n, 2730146n, 3082423n, 3483388n, 3940226n,
      4461248n,
    ],
  },
]

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// One trial: draw L distinct trail tiles, `bombs` distinct veins, test disjoint.
function trialAllSafe(rng, L, bombs) {
  const veins = new Set()
  while (veins.size < bombs) veins.add((rng() * TOTAL) | 0)
  const picked = new Set()
  while (picked.size < L) {
    const t = (rng() * TOTAL) | 0
    if (picked.has(t)) continue
    picked.add(t)
    if (veins.has(t)) return false
  }
  return true
}

// Wager in lamports (1 USDC). Integer BigInt payout path (Domain A parity).
const WAGER = 1_000_000n

function measure(rng, L, trials, ladder, bombs) {
  let payout = 0n
  let wagered = 0n
  let wins = 0
  for (let i = 0; i < trials; i++) {
    wagered += WAGER
    if (trialAllSafe(rng, L, bombs)) {
      payout += (WAGER * ladder[L]) / ONE_X
      wins++
    }
  }
  const rtp = Number(payout) / Number(wagered)
  return { rtp, hitRate: wins / trials }
}

// Base is 5,000,000 trials/L. The per-L pass/fail band [0.96,0.97] has a
// half-width (0.005) that, on the high tail, is TIGHTER than a few× the
// Monte-Carlo standard error at low N — so a low-N default would spuriously flap
// "OUT OF BAND" even though the RTP is correct (guaranteed in-band ALGEBRAICALLY
// by the single-final-floor band test in assayMath.test.ts). The tail is longest
// on the FLOODED tier at L=60 (446x win on a low hit-rate ⇒ huge per-trial
// variance). So we POWER each (tier,L) individually: N = max(base, Var/targetSE²)
// with targetSE = half-width/3 (≥3σ headroom), where Var(L) = S(L)·(T(L)/1e4)² −
// 0.965² from the exact analytic survival (float here is DIAGNOSTIC-only powering,
// never a payout path). Base only ever grows on the tail. Pass a smaller arg
// (e.g. `node assaySim.mjs 500000`) for a quick, diagnostic-only pass.
const trials = Number(process.argv[2] || 5000000)
const rng = mulberry32(0xa55a1234)

// Exact analytic survival S(L) = ∏(safe−i)/(196−i), as a float (powering only).
function survivalProb(L, bombs) {
  let s = 1
  const SAFE = TOTAL - bombs // derived — never hardcoded to an old survival number
  for (let i = 0; i < L; i++) s *= (SAFE - i) / (TOTAL - i)
  return s
}
const HALF_WIDTH = 0.005
const TARGET_SE = HALF_WIDTH / 3
function trialsForL(L, base, ladder, bombs) {
  const p = survivalProb(L, bombs)
  const t = Number(ladder[L]) / 10000
  const variance = p * t * t - 0.965 * 0.965
  const needed = Math.ceil(variance / (TARGET_SE * TARGET_SE))
  return Math.max(base, needed)
}

console.log(
  `The Assay Line — Monte-Carlo RTP  (base trials/L = ${trials.toLocaleString()}, ≥3σ variance-powered on the tail, seed 0xa55a1234)`,
)
console.log(`board ${TOTAL} tiles · target RTP 0.9650 · band [0.96,0.97] · flat across ALL tiers`)

const perL = [MIN_L, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60]
let allIn = true

for (const tier of TIERS) {
  const SAFE = TOTAL - tier.bombs
  console.log('═'.repeat(72))
  console.log(`  TIER: ${tier.id.toUpperCase()}  ·  ${tier.bombs} bad veins  ·  SAFE=${SAFE}  ·  T(60)=${(Number(tier.ladder[MAX_L]) / 10000).toFixed(2)}x`)
  console.log('─'.repeat(72))
  console.log('  L    trials        hit-rate     RTP        in [0.96,0.97]?')
  for (const L of perL) {
    const nL = trials >= 5_000_000 ? trialsForL(L, trials, tier.ladder, tier.bombs) : trials
    const { rtp, hitRate } = measure(rng, L, nL, tier.ladder, tier.bombs)
    const inBand = rtp >= 0.96 && rtp <= 0.97
    if (!inBand) allIn = false
    console.log(
      `  ${String(L).padStart(3)}  ${String(nL.toLocaleString()).padStart(11)}   ${(hitRate * 100).toFixed(3)}%    ${rtp.toFixed(5)}    ${inBand ? 'YES' : 'NO  <-- OUT'}`,
    )
  }
  // Aggregate: mixed L uniform in [8,60] (the "any claim-line" player mix).
  let aggPay = 0n
  let aggWag = 0n
  const aggTrials = trials * 3
  for (let i = 0; i < aggTrials; i++) {
    const L = MIN_L + ((rng() * (MAX_L - MIN_L + 1)) | 0)
    aggWag += WAGER
    if (trialAllSafe(rng, L, tier.bombs)) aggPay += (WAGER * tier.ladder[L]) / ONE_X
  }
  const aggRtp = Number(aggPay) / Number(aggWag)
  const aggIn = aggRtp >= 0.96 && aggRtp <= 0.97
  if (!aggIn) allIn = false
  // S(8) sanity signal (196-tile board: ~78% lean / ~71% std / ~50% flood).
  const s8 = survivalProb(8, tier.bombs)
  console.log('─'.repeat(72))
  console.log(`  AGGREGATE (mixed L∈[8,60], ${aggTrials.toLocaleString()} trials): RTP ${aggRtp.toFixed(5)}  ${aggIn ? 'IN BAND' : 'OUT OF BAND'}`)
  console.log(`  S(8) = ${(s8 * 100).toFixed(2)}%  (survival sanity signal)`)
}

console.log('═'.repeat(72))
console.log(`  VERDICT: ${allIn ? 'ALL TIERS IN BAND ✓' : 'OUT OF BAND ✗'}`)
process.exit(allIn ? 0 : 1)
