# Chamilleia's Trading Strategy — Rules & Process

> Trading plan & journal. Supply & Demand on the 5-minute execution timeframe,
> with a top-down daily bias.

## 1. Time Frames & Top-Down Analysis
A **Top-Down Analysis** is completed every morning to find the daily bias.

- **Analysis frames:** Daily → 4H → 1H → 30m → 15m. Look *inside* the current
  daily candle to read the story and set a single bias: strictly buys **or**
  strictly sells.
- **Execution frame:** All supply & demand trades are spotted and executed on
  the **5-minute** chart.
- **Exception:** The 1-minute is occasionally viewed to spot early minor breaks
  of structure / support, but is avoided for trading to minimize noise.

## 2. The 4-Step Core Supply & Demand Rules
> Only valid in a **trending** market (bullish or bearish) — never in sideways
> consolidation.

1. **Find the Trend.** Identify a clear bullish or bearish direction on the 5m.
2. **Wait for a Break of Structure (BOS).** Price must break a previous major
   structural high (buys) or low (sells). Valid whether broken by a **full body
   or just a wick**. Confirms trend continuation.
3. **Wait for Price to Tap Your Zone.**
   - **Zone identification:** the most recent **red** candle before an aggressive
     upward push (**Demand**), or the most recent **green** candle before an
     aggressive downward push (**Supply**). Draw from **top of wick to bottom of
     wick**.
   - **Recency rule:** only the most recent zone created by the structure break
     is valid. Older zones are ignored.
   - **The wait:** the zone is a "train stop." Wait for price to fully pull back
     and **tap** the zone. No tap → no trade.
4. **Take an Entry** (see below).

## 3. Entry Types
1. **Aggressive** — buy/sell the moment price spikes into the zone. Tightest stop,
   highest fake-out risk. Best when trending heavily.
2. **Conservative** — wait for a 5m candle to **close out of the zone** in your
   direction (e.g. a solid green close for a buy).
3. **Break of the Candle** — let the 5m candle tap & close, then enter when the
   next candle breaks the **high** (buys) / **low** (sells) of that closed candle.

## 4. Risk Management & Exits
- **Stop loss:** always completely **outside/under** a demand zone (or **above**
  a supply zone) — never random.
- **SL limit:** if a zone is massive, place the stop below the current 5m
  entering candle instead. Max SL ideally **≤ 50 points**.
- **Take profit:** primary target **1:1 R:R**. At 1:1, take partials and move stop
  to **break-even** (risk-free). Let a runner trail toward **1:2** or prior
  structural highs.

## 5. Exceptions, Invalidations & Additional Strategies
- **Zone invalidation:** if a 5m candle **body closes through** the zone, it is
  invalidated — abort. An **A+ setup** is when price only leaves a **wick** inside
  the zone, with no body closing inside.
- **Minor Break of Structure (mBOS):** if an aggressive pullback invalidates your
  zone, don't blindly buy the next zone. Wait for a **stair-step pattern** (minor
  BOS) showing support and a flip back toward the higher-timeframe bias,
  **confirmed by a second lower high (sells) / second higher low (buys)**. When
  that minor structure breaks, a new valid zone is created.
- **Support & Resistance (sideways):** when consolidating, S&D can't be used. Buy
  strictly at the **floor** (support), sell strictly at the **ceiling**
  (resistance). Don't get greedy — target 1:1 and get out.
- **Counter Trend-Line Breaks:** against the primary trend, draw a tight trend
  line on the pullback. Wait for a strong full-body candle to **close outside** the
  line — ideally combined with an S/R break for double confluence. Target a strict
  1:1.

---

*This document is the source of truth the indicator encodes. See
[`indicator/ChamilleiaSupplyDemand.pine`](indicator/ChamilleiaSupplyDemand.pine).*
