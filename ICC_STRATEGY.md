# ICC — Indication · Correction · Continuation ("Trades by Sci")

A rules-based framework that scans price action for directional intent, waits for
a liquidity grab, and executes on trend realignment. Encoded as a Pine **v6
strategy** in [`indicator/ICC_TradesBySci.pine`](indicator/ICC_TradesBySci.pine).

## Core directives
- **Objective:** scan for directional intent → wait for liquidity grab → execute on realignment.
- **Timeframe hierarchy:** HTF (1H/4H) sets direction; LTF (5M/15M) executes. **4H overrides 1H.**
- **Operating hours:** high-volume sessions only — **London** and **New York** (9:30 AM EST).
- **Exclusion zones:** abort during random consolidation or at **All-Time Highs** (no structural target).

## Phase 0 — Baseline Scan (HTF)
- Scan 1H/4H. Locate most recent structural **Swing High** and **Swing Low**.
- **Precision rule:** use candle **body closes only** — ignore wicks.
- Define the **No-Trade Zone** = range between current Swing High and Swing Low.
- Hold two conditional alerts (above High, below Low); wait for a breakout.

## Phase 1 — INDICATION (the blueprint)
- **Trigger:** HTF price breaks **and closes** outside the No-Trade Zone for the first time.
- Log that breakout coordinate as **`Primary_Indication_Level`**.
- **Do not trade yet** — this is a directional blueprint / likely liquidity trap.
- Shift scanning to the LTF.

## Phase 2 — CORRECTION (the liquidity grab)
- Watch the LTF for a **counter-trend pullback** (bullish breakout → look for an LTF downtrend).
- Shallow pullbacks = high momentum (no perfect retest required).
- **End trigger:** the LTF counter-trend **breaks its own structure** and realigns with Phase 1 direction (e.g. an LTF lower high is broken → higher highs).
- Log the **absolute extreme** of the pullback as **`Stop_Loss_Level`**.

## Phase 3 — CONTINUATION (execution & invalidation)
- **Execution trigger:** price pushes back across `Primary_Indication_Level` in the original direction → **execute**.
- **Take profit:** target the next major historical Swing High (buys) / Swing Low (sells). Scale out **75–90%** at the first checkpoint; trail the runner.
- **Failure / Shift of Gears:** if price aggressively reverses **through `Stop_Loss_Level`**, the sequence is invalidated. The system instantly **resets to Phase 1 in the opposite direction**, logging the failure as a new high-speed Indication.

## How the code maps to the rules
| Rule | Implementation |
|------|----------------|
| Body-close swings | HTF pivots computed on `close` via `request.security` |
| No-Trade Zone | Box between HTF swing high/low |
| Indication | First HTF `close` beyond the zone sets `dir` + `indication` |
| Correction | Tracks pullback extreme; realignment = LTF breaking its last swing back toward `dir` |
| Continuation | Entry when chart price re-crosses `indication` in `dir`; SL = pullback extreme |
| Targets | Next HTF structural swing (toggle) or RR fallback |
| Shift of Gears | Close through `stopLevel` flips `dir` and re-arms Phase 2 |
| Sessions | London + NY session gate; ATH exclusion for longs |

## ⚠️ Honest limitations
- **Not a guaranteed profit system.** It mechanically encodes a discretionary plan; discretionary judgment (genuine consolidation vs. trend, "aggressive" reversal) is approximated.
- **HTF repainting:** values use confirmed bars (`lookahead_off`) to minimise repaint, but HTF-derived signals can still update intrabar. **Backtest and forward-test** before any live use.
- Tune pivot strengths, RR, and sessions per instrument. Past performance ≠ future results. **Not financial advice.**
