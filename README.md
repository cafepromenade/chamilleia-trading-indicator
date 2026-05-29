# Chamilleia Trading Indicator

Live price-action dashboard, TradingView scripts, and a WinUI 3 desktop app for the Chamilleia Supply/Demand plus ICC strategy.

The current system uses **price action and market structure only**. It does not use EMA or indicator-based trend filters.

## What It Does

- Reads live candles for XAUUSD, GBPJPY, EURUSD, and BTCUSD.
- Builds a top-down story from Daily, 4H, 1H, 30M, and 15M.
- Executes from the 5M chart using newest supply/demand zone logic.
- Gates BUY/SELL through ICC continuation: price must reclaim the Primary Indication Level.
- Keeps only the newest valid zone from the latest structure break.
- Invalidates a zone when a candle body closes through it.
- Requires a stair-step minor BOS reset after a failed zone: second higher low for buys, second lower high for sells.
- Calculates entry, stop, TP1, TP2, and structural target when a live setup is valid.
- Color-codes and animates status states: BUY, SELL, WAIT, NO TRADE, and caution states.
- Uses OpenCode free-model fallback for desktop prediction cards.

## Website

Live site: https://cafepromenade.github.io/chamilleia-trading-indicator/

The website in [`docs/`](docs/) is a focused live dashboard: status label, real candlestick chart, key live facts, risk plan, automatic prediction, and a desktop installer link.

Preview locally:

```bash
cd docs
python -m http.server 8000
```

## Desktop App

The WinUI 3 desktop app lives in [`desktop/ChamSD.Desktop`](desktop/ChamSD.Desktop). It mirrors the website strategy, adds Windows notifications, and supports unlimited webhooks with GET/POST, headers, and values.

Every push and every manual workflow run builds `ChamSD.Desktop.Setup.exe` and uploads that NSIS installer directly to the GitHub Release. It does not upload Actions artifacts.

Latest release: https://github.com/cafepromenade/chamilleia-trading-indicator/releases/latest

## TradingView Scripts

| Path | Description |
|------|-------------|
| [`indicator/ChamilleiaSupplyDemand.pine`](indicator/ChamilleiaSupplyDemand.pine) | Price-action Supply/Demand indicator for the 5M chart. |
| [`indicator/ICC_TradesBySci.pine`](indicator/ICC_TradesBySci.pine) | ICC Indication, Correction, Continuation strategy. |

## Strategy Docs

| Path | Description |
|------|-------------|
| [`STRATEGY.md`](STRATEGY.md) | Chamilleia Supply/Demand rules from the trading journal. |
| [`ICC_STRATEGY.md`](ICC_STRATEGY.md) | Trades by Sci ICC rules. |

## Tests

Run the strategy-engine regression suite:

```bash
npm test
```

The release workflow runs these tests before packaging the desktop app, so installer builds fail if core strategy rules regress.

## Disclaimer

This is an educational tool that mechanically encodes discretionary trading rules. It is not financial advice, not a guarantee, and not an automated trading execution system. Always manage risk and verify decisions yourself.
