# Chamilleia Supply & Demand Indicator

A TradingView (Pine Script v5) indicator that highlights **high-probability
supply & demand trade setups** — built directly from Chamilleia's trading plan.

It marks demand/supply zones created off a **Break of Structure** in a trending
market, waits for price to **tap** the zone, flags **A+ setups**, draws entry
triggers, and confirms **minor break-of-structure reversals** via a *second lower
high / second higher low*.

## What it does
- 📈 **Trend filter** — EMA slope to keep you on the right side (buys-only / sells-only).
- 🧱 **Break of Structure (BOS)** — detects breaks of the most recent swing high/low (body *or* wick).
- 🟦 **Zones** — auto-draws the most recent opposite candle before an aggressive push, wick-to-wick, with the **recency rule** (keeps only the newest N).
- 🎯 **Tap + entry signals** — `BUY` / `SELL` markers on the *break-of-candle* entry.
- ⭐ **A+ flag** — when price only wicks into the zone (no body close inside).
- ❌ **Invalidation** — greys out a zone when a candle body closes through it.
- 🪜 **Minor BOS confirmation** — `✕` second lower high (sells) / `+` second higher low (buys).
- 🔔 **Alerts** for every key event.

> ⚙️ Tuned for the **5-minute** execution timeframe described in the plan.

## Install on TradingView
1. Open [TradingView](https://www.tradingview.com/) → **Pine Editor** (bottom panel).
2. Open [`indicator/ChamilleiaSupplyDemand.pine`](indicator/ChamilleiaSupplyDemand.pine), copy its contents.
3. Paste into the Pine Editor → **Save** → **Add to chart**.
4. Set your chart to the **5-minute** timeframe.
5. (Optional) Right-click the indicator → **Settings** to tune pivot length, trend EMA, impulse strength, and styling.
6. (Optional) Create alerts from the built-in `alertcondition`s.

## Repo layout
| Path | Description |
|------|-------------|
| [`indicator/ChamilleiaSupplyDemand.pine`](indicator/ChamilleiaSupplyDemand.pine) | The Pine Script v5 indicator. |
| [`STRATEGY.md`](STRATEGY.md) | The full written strategy the indicator encodes. |
| [`website/`](website/) | A landing site documenting the strategy & indicator. |

## Website
A static site lives in [`website/`](website/). To view locally, open
`website/index.html` in a browser, or serve it:
```bash
cd website && python -m http.server 8000
# then open http://localhost:8000
```
It can be published free via **GitHub Pages** (Settings → Pages → deploy from
`main` / `website` folder).

## ⚠️ Disclaimer
This is an educational tool that encodes a discretionary trading plan. It is
**not financial advice**. Indicator signals are mechanical approximations of
discretionary rules and can be wrong. Trade your own plan and manage risk.
