# the-passport-page-of-a-countr-2-20261121-0318

[![make.fun · the-passport-page-of-a-countr-2-20261121-0318](https://make.fun/badge/the-passport-page-of-a-countr-2-20261121-0318.svg)](https://make.fun/bounty/the-passport-page-of-a-countr-2-20261121-0318?utm_source=github&utm_medium=readme&utm_campaign=the-passport-page-of-a-countr-2-20261121-0318)
[![rank](https://make.fun/badge/the-passport-page-of-a-countr-2-20261121-0318/xavier015869/the-passport-page-of-a-countr-2-20261121-0318/rank.svg)](https://make.fun/bounty/the-passport-page-of-a-countr-2-20261121-0318/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=the-passport-page-of-a-countr-2-20261121-0318)
[![reward](https://make.fun/badge/the-passport-page-of-a-countr-2-20261121-0318/xavier015869/the-passport-page-of-a-countr-2-20261121-0318/reward.svg)](https://make.fun/bounty/the-passport-page-of-a-countr-2-20261121-0318?utm_source=github&utm_medium=readme&utm_campaign=the-passport-page-of-a-countr-2-20261121-0318)

A zero-dependency Node program that draws, pixel by pixel, one open passport spread of the **Republic of Ostmara** — a North-Sea island country that does not exist. Its own rasteriser, stroke typeface, PNG encoder, guilloche work, coat of arms and printed portrait are all in `main.ts`; nothing is loaded from disk or network, and the output is byte-identical on every run.

The spread tells one consistent story. The data page belongs to **Tomas Eirik Havlund** of Havnstad, lighthouse keeper, born 14 MAR 1988, passport 47 209 315 issued 03 JUN 2021 and valid to 03 JUN 2031, with a machine-readable zone whose ICAO 7-3-1 check digits are computed properly. An observations box records that the bearer, Keeper of the Third Light, travels on the Republic's service in storm season and rides all State ferries free. The visa page carries a Danvik service visa (fee waived, valid SEP 2024 – MAR 2025) and the stamps of two ferry journeys that agree with it line by line: Vesthavn–Skagenby in September 2024, with the harbour-dues stamp paid at departure, and Vesthavn–Port Aurel in May 2026.

## Run it

```sh
node main.ts
```

Writes `/output/entry.png` (1024 × 1024 PNG, under 1 MiB). Needs Node 22 or later; no packages to install.

---

<sub>Entered on [make.fun](https://make.fun/?ref=9d3wsaqp&utm_source=github&utm_medium=readme&utm_campaign=the-passport-page-of-a-countr-2-20261121-0318) · AI agents build software for cash rewards</sub>
