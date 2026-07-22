# AUTOMAT room templates — provenance

Generated 2026-07-16 via Higgsfield MCP (model `nano_banana_2` a.k.a. nano_banana_pro
route, 1k, 16:9, 2 credits each = 8 credits total, Tim-approved batch). Served from
`vending-run/public/room-templates/`; canonical copies here. Wired as the ROOM ·
TEMPLATE picker in `VendingExperience.tsx` (`ROOM_TEMPLATES`, default `off` =
procedural gradient room). Full prompts are embedded in each generation's job record;
job ids:

| File | Template | Higgsfield job id |
|---|---|---|
| t1-doodle-wall.png | WALL — porcelain wall with coal one-line doodle marks (our mark vocabulary), scrim 0.62 | c158209e-4cfe-4c6e-8879-68529fe9ce2a |
| t2-arcade-row.png | HALL — night arcade rows + cyan floor pool + gold sparkles, scrim 0.30 | 93094a5e-3626-49bb-8b8c-e3da39bc260c |
| t3-terminal-void.png | VOID — minimal navy terminal void (pulse register), scrim 0.28 | 0b28a560-ed4d-483f-bb73-03129a5df355 |
| t4-collector-wall.png | ARCHIVE — collector shelf niches with teal/gold pouches, scrim 0.38 | d8233c45-d28a-4334-8b5a-e83e798e8b6a |

Style-lock used: "flat 2D vector illustration, thick black ink outlines, bold flat
fills, dark uncluttered center, Hacksaw-style game background; no text, no characters,
no faces, no photorealism, no 3D render" + per-template scene block. All four verified
free of text artifacts/faces on 2026-07-16 (live composite shots in
`vending-run/shots-room-templates/`).

## Per-tier rooms (2026-07-16 night — Tim: achtergrond per machine + gloed-markering)

LIVE: the room follows the armed MACHINE (crossfade 700ms with the turntable);
the picker was removed. Difficulty glow overlay per tier (static, never pulsing):
easy green rgba(61,220,151,.16) · medium silver-blue rgba(180,200,235,.14) ·
hard ember-red rgba(229,72,77,.18); matching LED dots on the difficulty buttons.

| File | Room | Job id |
|---|---|---|
| t7-room-easy.png | EASY — cream wave-doodle wall, sea-green wash + green floor pool | 73beaeb5-8719-4649-9008-954ce9c8d516 |
| t8-room-medium.png | MEDIUM — indigo storm wall, lightning doodles, silver-blue moonlight wash | ac38f6d5-5620-4408-85e0-e1c85416e0c0 |
| t9-room-hard.png | HARD — obsidian wall, molten gold veins, ember-red furnace glow | ccbd1a9b-0b50-43d5-bd30-9f9ce1423f8f |

Earlier candidates t1/t5/t6 (WALL/ARCADE/STREET) stay on disk as alternates.
