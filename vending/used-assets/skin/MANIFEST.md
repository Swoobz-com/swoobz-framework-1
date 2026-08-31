# AUTOMAT one-brand skin — provenance

Generated 2026-07-16 via Higgsfield MCP (nano_banana_2, 1k, 2 cr each = 6 cr,
Tim-directed batch after his `input/vending/collector ref.png` drop: the machine
wrap + products + emblem must be ONE art system). Served from
`vending-run/public/skin/`; canonical copies here. Wired in
`VendingMachineCanvas.tsx`: mural cover-clipped to the cabinet body in the bake
(hot-swaps in on load; procedural porcelain skin is the fallback), pack wraps
cover-cropped into the pouch shape per class (standard/gold), source insets
10%/6% to drop the art's own margins.

| File | Role | Job id |
|---|---|---|
| mural.png (2:3) | cabinet wrap: teal wave → gold flame, integrated mark vocabulary, two hero capsules on the skirt | 5053268f-eb08-42d7-af30-d05a0f48fe72 |
| pack-standard.png (3:4) | v1 flat wrap (superseded by -cut, kept for provenance) | 0e102227-da6c-43c5-b828-e4abec254945 |
| pack-gold.png (3:4) | v1 flat wrap (superseded by -cut, kept for provenance) | 3374e863-656b-4858-aa7c-80184551dca1 |
| pack-standard-cut.png | v2 LIVE: real booster silhouette (crimped seal lips top+bottom), wave art + gold hex band; rembg cutout, alpha-trimmed to 555x971 | gen 554a8af3-4b44-4fc6-bc59-b8e464fab0c6 → rembg b5ebe360-b46e-4364-b58b-fcdce24fc32c |
| pack-gold-cut.png | v2 LIVE: gold flame booster with coal band + saturn-ringed hex (GOLD class); rembg cutout, alpha-trimmed to 544x943 | gen c4afd1e9-12a7-4cc9-b3bc-3d8dd85d25a8 → rembg 17b22428-10ef-461f-9c86-43dbc05b85c0 |
| mural-storm.png (2:3) | MEDIUM machine wrap: indigo storm waves + silver lightning + hero capsules (slate shell) | 6ceff328-a448-4ddf-988d-5edb68c6ac6f |
| mural-obsidian.png (2:3) | HARD machine wrap: obsidian shards + molten gold veins + hero capsules (near-black shell) | 3fd6dbf3-8722-42a3-ba2e-b87a867b3099 |
| pack-storm-cut.png | PER-MACHINE pack skins (Tim 2026-07-22): MEDIUM standard booster, storm clouds + lightning doodle, same silhouette + gold hex band (ref = pack-standard gen); rembg, alpha-trimmed 1245x2206 | gen 9158d2d6-880c-4fba-ba09-f71de0e73334 → rembg 12242025-3541-48a2-967d-e0cef78bf13f |
| pack-obsidian-cut.png | HARD standard booster, volcanic obsidian shards + warm glow doodle, same silhouette + gold hex band (ref = pack-standard gen); rembg, alpha-trimmed 1253x2203. GOLD pack stays SHARED (class marker, RG) | gen 771e0884-9d57-45e6-9576-8c4fa56f7729 → rembg 58239178-eb59-4ff8-b407-849ed004a6f8 |

Panel art (2026-07-16 late night — Tim: panels als art die samenkomt met de machine):
| panel-easy.png | UI panel underlay: charcoal + teal wave linework at edges, calm dark center | 7206be6e-85e2-4c93-a9df-8c30cd64d504 |
| panel-medium.png | indigo + silver lightning filigree at edges | bab52277-50d2-48d3-afcd-24ad2393467a |
| panel-hard.png | obsidian + molten gold veins at edges | b465af04-0e7e-4389-8269-43b5b8a28ecd |
Wired as `--tier-panel` CSS var → Card background (readability scrim 0.72/0.82 on top,
depth-gradient fallback below). Follows the armed machine with the rest of TIER_UI.

Tier turntable (2026-07-16 night): three machines EASY/MEDIUM/HARD, each its own
shell palette + mural (TIER_SKINS in VendingMachineCanvas.tsx), swing-out/in
carousel switch (arrows, mode buttons, ← → keys). Room candidates for Tim's
pick-and-test: t5-neon-arcade.png (job 43f8faae-075e-47b6-b85d-d16e728a0e3d) +
t6-night-street.png (job 385c516e-95a8-4821-99aa-2b739de3d965) in
used-assets/room-templates/, wired as the ROOM picker (WALL/ARCADE/STREET).

Palette locked in-prompt to the game tokens (#2b5e74/#1d4356/#f0b542/#F2EEE4/#0D0F15).
All three verified text-free/face-free 2026-07-16. Signage sits on solid dark
marquee islands (#14171d + gold lettering) so the wrap can never swallow it.

Also here: `swoobz-logo.svg` — Tim's supplied brand wordmark
(`input/vending/swoobz-logo-white (1).svg`, white letters + orange OO), copied
with explicit width/height attrs added (canvas needs an intrinsic size to
raster SVG crisply). Rides the header neon band as a right→left marquee
(LOGO_H 30, 40px/s, seamless wrap, reduced-motion pins it centered; AUTOMAT
lettering is the not-yet-loaded fallback).
