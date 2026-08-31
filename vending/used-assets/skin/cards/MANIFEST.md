# AUTOMAT pull-card art — provenance

Generated 2026-07-16 night via Higgsfield MCP (nano_banana_2, 3:4, 2 cr each =
26 cr, Tim-directed batch for the pack-rip cutscene per `input/vending/packref/`
refs). Served from `vending-run/public/skin/cards/`; canonical copies here.
Card = (machine tier × multiplier range); the multiplier NUMBER is overlaid in
DOM (Geist Mono), art stays text-free. Range mapping (vendingExperience
`cardRange`): gold class → gold · 0 bps → empty · <1× → common · ≥1× std → rare.

| File | Job id |
|---|---|
| back.png (shared) | ef2e03dc-08a7-4b7c-9dfb-903a38f5a9b5 |
| easy-empty.png | 714825ca-588a-4006-bddd-4221ec809903 |
| easy-common.png | 646afa8e-8c15-4f25-8d00-12f523e9278d |
| easy-rare.png | 6b47eb15-c23a-4f92-8635-33fb5793cb80 |
| easy-gold.png | 46bb2de2-6362-4df4-a31f-dcb5717d3602 |
| medium-empty.png | f392d6ff-7668-4290-a106-bb1e947cd453 |
| medium-common.png | 0786f73e-1506-408f-b3ad-a7b445591797 |
| medium-rare.png | 95644b8b-ffed-417d-9a92-70e8b24056f0 |
| medium-gold.png | 9213b293-cee8-47df-bc7e-cc13cc77cb54 |
| hard-empty.png | bd5036fd-8d5c-4765-87eb-39817901ac31 |
| hard-common.png | 00d8a7ec-0bf8-49fb-83a4-6122ee662f10 |
| hard-rare.png | 1122c6a0-d1d5-4a42-9f1b-7d6362ff33f7 |
| hard-gold.png | 8387d750-fef7-4211-9b60-7ce12ec8766d |

Cutscene (PackRipCutscene in VendingExperience.tsx): floating booster (per-class
pack cutout) → crimp-lip tear (clip-path strip flies, seam glow) → card rises +
flips (back → tier×range face) → rarity ray-burst + number slam → auto-advance
(click = next, SKIP · SHOW RESULT = straight to receipt). Module-const timings
(550/520/750/950ms), rarity is an outcome CLASS (RG-C5: identical per class,
never scaled by value). CUTSCENE · ON/OFF toggle in the panel; reduced-motion
skips the cutscene entirely.
