(function () {
  const heroStatus = document.querySelector("#hero-status");
  const heroNote = document.querySelector("#hero-status-note");
  const liveStatusBar = document.querySelector("#live-status-bar");
  const statusFlash = document.querySelector("#status-flash");
  const engineOutput = document.querySelector("#engine-output");
  const engineFacts = document.querySelector("#engine-facts");
  const chartStatus = document.querySelector("#chart-status");
  const liveChart = document.querySelector("#live-candlestick-chart");
  const runnerCaption = document.querySelector("#runner-caption");
  const marketSelect = document.querySelector("#market-select");
  const reloadLive = document.querySelector("#reload-live");
  const strategyChecklist = document.querySelector("#strategy-checklist");
  const riskBox = document.querySelector(".risk-box");
  const riskPlan = document.querySelector("#risk-plan");
  const riskNote = document.querySelector("#risk-note");
  const predictionPanel = document.querySelector("#prediction-panel");
  const predictionStatus = document.querySelector("#prediction-status");
  const predictionThinking = document.querySelector("#prediction-thinking");
  const predictionNext = document.querySelector("#prediction-next");
  const predictionInvalid = document.querySelector("#prediction-invalid");
  const predictionFinal = document.querySelector("#prediction-final");
  const predictionUpCase = document.querySelector("#prediction-up-case");
  const predictionDownCase = document.querySelector("#prediction-down-case");
  const predictionLeanCase = document.querySelector("#prediction-lean-case");
  const predictionConfidenceLabel = document.querySelector("#prediction-confidence-label");
  const predictionConfidenceFill = document.querySelector("#prediction-confidence-fill");
  const predictionUpScore = document.querySelector("#prediction-up-score");
  const predictionDownScore = document.querySelector("#prediction-down-score");
  const predictionWaitScore = document.querySelector("#prediction-wait-score");
  const predictionUpFill = document.querySelector("#prediction-up-fill");
  const predictionDownFill = document.querySelector("#prediction-down-fill");
  const predictionWaitFill = document.querySelector("#prediction-wait-fill");
  const predictionLights = {
    buy: document.querySelector("#prediction-buy-light"),
    sell: document.querySelector("#prediction-sell-light"),
    wait: document.querySelector("#prediction-wait-light"),
  };
  const installDesktopLinks = [...document.querySelectorAll("[data-install-desktop]")];
  const latestReleaseLink = document.querySelector("#latest-release-link");
  let previousStatusLabel = "";
  const githubReleaseApi = "https://api.github.com/repos/cafepromenade/chamilleia-trading-indicator/releases/latest";

  const engineSettings = {
    pivotLen: 2,
    avgRangeLen: 5,
    impulseMult: 0.6,
  };

  const marketConfigs = {
    XAUUSD: {
      name: "XAUUSD - Gold",
      source: "BiQuote",
      symbol: "XAUUSD",
    },
    GBPJPY: {
      name: "GBPJPY",
      source: "BiQuote",
      symbol: "GBPJPY",
    },
    EURUSD: {
      name: "EURUSD",
      source: "BiQuote",
      symbol: "EURUSD",
    },
    BTCUSD: {
      name: "BTCUSD",
      source: "BiQuote",
      symbol: "BTCUSD",
    },
  };

  function proxyUrls(url) {
    const encoded = encodeURIComponent(url);
    return [
      `https://api.codetabs.com/v1/proxy?quest=${encoded}`,
      `https://cors.eu.org/${encoded}`,
      `https://api.allorigins.win/raw?url=${encoded}`,
    ];
  }

  async function loadLatestDesktopRelease() {
    if (installDesktopLinks.length === 0 && !latestReleaseLink) {
      return;
    }

    try {
      const response = await fetch(githubReleaseApi, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) {
        throw new Error(`GitHub release lookup failed: ${response.status}`);
      }

      const release = await response.json();
      const setupAsset = release.assets?.find((asset) => asset.name === "ChamSD.Desktop.Setup.exe");
      const releaseUrl = release.html_url || "https://github.com/cafepromenade/chamilleia-trading-indicator/releases/latest";

      installDesktopLinks.forEach((installDesktop) => {
        installDesktop.href = setupAsset?.browser_download_url || releaseUrl;
        installDesktop.textContent = setupAsset ? "Install Desktop App" : "Open Desktop Release";
        installDesktop.title = release.tag_name
          ? `Latest GitHub Actions release: ${release.tag_name}`
          : "Latest GitHub Actions release";
      });

      if (latestReleaseLink) {
        latestReleaseLink.href = releaseUrl;
        latestReleaseLink.textContent = "Latest GitHub Actions Release";
        latestReleaseLink.title = release.tag_name
          ? `View ${release.tag_name} release assets`
          : "View latest release assets";
      }
    } catch (error) {
      console.warn(error);
    }
  }

  function animateStatusChange(result) {
    const targets = [
      liveStatusBar,
      engineOutput,
      chartStatus,
      statusFlash,
      heroStatus?.parentElement,
      liveChart,
      predictionPanel,
      riskBox,
    ].filter(Boolean);

    if (previousStatusLabel && previousStatusLabel !== result.label) {
      targets.forEach((target) => {
        target.classList.remove("status-change");
        void target.offsetWidth;
        target.classList.add("status-change");
      });
    }

    previousStatusLabel = result.label;
  }

  function setEngineOutput(result) {
    document.body.classList.remove("status-buy", "status-sell", "status-wait", "status-no-trade", "status-caution");
    document.body.classList.add(`status-${result.className}`);
    engineOutput.className = `status-output ${result.className}`;
    engineOutput.querySelector(".status-title").textContent = result.label;
    engineOutput.querySelector(".status-reason").textContent = result.note;
    chartStatus.className = `chart-status ${result.className}`;
    chartStatus.textContent = result.label;
    if (heroStatus && heroNote) {
      heroStatus.parentElement.className = `status-preview ${result.className}`;
      heroStatus.textContent = result.label;
      heroNote.textContent = result.note;
    }
    liveStatusBar.className = `live-status-bar ${result.className}`;
    liveStatusBar.querySelector(".bar-status").textContent = result.label;
    liveStatusBar.querySelector(".bar-note").textContent = result.note;
    if (statusFlash) {
      statusFlash.className = `status-flash ${result.className}`;
    }
    if (riskBox) {
      riskBox.className = `strategy-box risk-box ${result.className}`;
    }
    animateStatusChange(result);
  }

  function renderFact(term, value) {
    return `<div><dt>${term}</dt><dd>${value}</dd></div>`;
  }

  function biquoteUrl(symbol, interval) {
    return `https://biquote.io/api/${encodeURIComponent(symbol)}/ohlc?interval=${encodeURIComponent(interval)}`;
  }

  function formatPrice(value) {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: value >= 100 ? 2 : 4,
    }).format(value);
  }

  function formatDateTime(seconds) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      hour12: false,
      timeZoneName: "short",
    }).format(new Date(seconds * 1000));
  }

  function renderLiveChart({ candles, decision, productId }) {
    const result = decision.execution;
    const risk = decision.risk || {};
    const width = 900;
    const height = 460;
    const pad = { top: 58, right: 76, bottom: 52, left: 34 };
    const chartWidth = width - pad.left - pad.right;
    const chartHeight = height - pad.top - pad.bottom;
    const visibleLevels = [risk.entry, risk.stop, risk.targetOne, risk.targetTwo, risk.structureTarget]
      .filter((value) => Number.isFinite(value));
    const lows = [...candles.map((candle) => candle.low), ...visibleLevels];
    const highs = [...candles.map((candle) => candle.high), ...visibleLevels];
    const minLow = Math.min(...lows);
    const maxHigh = Math.max(...highs);
    const padding = (maxHigh - minLow) * 0.1 || 1;
    const priceMin = minLow - padding;
    const priceMax = maxHigh + padding;
    const priceSpan = priceMax - priceMin || 1;
    const slot = chartWidth / candles.length;
    const bodyWidth = Math.max(3, Math.min(12, slot * 0.58));

    const xFor = (index) => pad.left + slot * index + slot / 2;
    const yFor = (price) => pad.top + ((priceMax - price) / priceSpan) * chartHeight;
    const priceTicks = Array.from({ length: 5 }, (_, index) => priceMin + (priceSpan / 4) * index);
    const timeIndexes = [0, Math.floor(candles.length / 2), candles.length - 1];
    const latestIndex = candles.length - 1;

    const zoneMarkup = result.zones
      .filter((zone) => zone.top >= priceMin && zone.bot <= priceMax)
      .slice(0, 1)
      .map((zone) => {
        const yTop = yFor(zone.top);
        const yBot = yFor(zone.bot);
        const className = zone.isDemand ? "demand-rect" : "supply-rect";
        return `<rect class="${className}" x="${pad.left}" y="${Math.min(yTop, yBot)}" width="${chartWidth}" height="${Math.max(2, Math.abs(yBot - yTop))}" rx="5" />`;
      })
      .join("");

    const riskMarkup = [
      { label: "ENTRY", value: risk.entry, className: decision.className === "sell" ? "sell" : "buy" },
      { label: "STOP", value: risk.stop, className: "stop" },
      { label: "TP1", value: risk.targetOne, className: "target" },
      { label: "TP2", value: risk.targetTwo, className: "target" },
      { label: "STRUCTURE", value: risk.structureTarget, className: "structure" },
    ]
      .filter((level) => Number.isFinite(level.value))
      .map((level) => {
        const y = yFor(level.value);
        return `
          <line class="risk-level ${level.className}" x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" />
          <text class="risk-level-label ${level.className}" x="${pad.left + 8}" y="${y - 6}">${level.label} ${formatPrice(level.value)}</text>
        `;
      })
      .join("");

    const gridMarkup = priceTicks
      .map((price) => {
        const y = yFor(price);
        return `
          <line class="chart-grid" x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" />
          <text class="price-label" x="${width - pad.right + 10}" y="${y + 4}">${formatPrice(price)}</text>
        `;
      })
      .join("");

    const candleMarkup = candles
      .map((candle, index) => {
        const x = xFor(index);
        const isUp = candle.close >= candle.open;
        const className = isUp ? "chart-candle up" : "chart-candle down";
        const yHigh = yFor(candle.high);
        const yLow = yFor(candle.low);
        const yOpen = yFor(candle.open);
        const yClose = yFor(candle.close);
        const bodyY = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));
        const latestClass = index === latestIndex ? " latest" : "";
        return `
          <g class="${className}${latestClass}">
            <line x1="${x}" y1="${yHigh}" x2="${x}" y2="${yLow}" />
            <rect x="${x - bodyWidth / 2}" y="${bodyY}" width="${bodyWidth}" height="${bodyHeight}" rx="2" />
          </g>
        `;
      })
      .join("");

    const timeMarkup = timeIndexes
      .map((index) => {
        const candle = candles[index];
        return `<text class="time-label" x="${xFor(index)}" y="${height - 20}">${formatDateTime(candle.time).replace(/, /, " ")}</text>`;
      })
      .join("");

    const last = candles[latestIndex];
    const lastY = yFor(last.close);
    liveChart.innerHTML = `
      <rect class="chart-bg" x="0" y="0" width="${width}" height="${height}" rx="8" />
      <text class="chart-title" x="${pad.left}" y="32">${productId} live 5-minute candlestick chart</text>
      ${gridMarkup}
      ${zoneMarkup}
      ${riskMarkup}
      ${candleMarkup}
      <line class="last-price-line" x1="${pad.left}" y1="${lastY}" x2="${width - pad.right}" y2="${lastY}" />
      <text class="last-price-label" x="${width - pad.right + 10}" y="${lastY - 8}">${formatPrice(last.close)}</text>
      ${timeMarkup}
    `;
  }

  function renderStrategyChecklist(items) {
    const visibleGateLabels = new Set([
      "ICC phase",
      "4H/1H bias",
      "No-trade zone",
      "Primary indication reclaim",
      "Zone tap",
      "Entry trigger",
      "Invalidation",
    ]);
    strategyChecklist.innerHTML = items
      .filter((item) => visibleGateLabels.has(item.label))
      .map((item) => `
        <li class="${item.ok ? "ok" : "wait"}">
          <span>${item.ok ? "YES" : "WAIT"}</span>
          <div><strong>${item.label}</strong><p>${item.text}</p></div>
        </li>
      `)
      .join("");
  }

  function renderRiskPlan(risk) {
    riskPlan.innerHTML = [
      renderFact("Entry", risk.entry === null ? "-" : formatPrice(risk.entry)),
      renderFact("Stop", risk.stop === null ? "-" : formatPrice(risk.stop)),
      renderFact("TP1", risk.targetOne === null ? "-" : formatPrice(risk.targetOne)),
      renderFact("Scale", risk.scaleOut || "75-90%"),
      renderFact("Entry type", risk.entryMode || "WAIT"),
      renderFact("Structure", risk.structureTarget === null ? "-" : formatPrice(risk.structureTarget)),
    ].join("");
    riskNote.textContent = risk.text;
  }

  function checklistText(decision, label) {
    return decision.checklist.find((item) => item.label === label)?.text || "-";
  }

  function predictionForDecision(decision) {
    const bias = decision.bias.direction;
    const label = decision.label;
    const entryMode = decision.risk.entryMode;
    const invalidation = checklistText(decision, "Invalidation");
    const structure = checklistText(decision, "5M structure alignment");
    const zoneTap = checklistText(decision, "Zone tap");
    const upCase = bias === "bearish"
      ? "Needs a fresh bullish indication, correction, and continuation before any up read matters."
      : "Could go up if price taps demand cleanly, holds the zone, then reclaims structure.";
    const downCase = bias === "bullish"
      ? "Could go down if price closes through demand or fails continuation into a shift of gears."
      : "Could go down if price taps supply cleanly, holds the zone, then breaks lower.";
    const leanCase = `${label.replace("STATUS: ", "")} with ${decision.confidence}% confidence.`;

    if (decision.className === "buy") {
      return {
        status: `${decision.confidence}% BUY`,
        thinking: `Live structure is aligned bullish. ${entryMode}.`,
        next: "The next likely bot action is BUY unless price closes through the tapped demand zone.",
        invalid: invalidation,
        final: label,
        up: "Up case is active: demand held, structure reclaimed, and the bot has a BUY read.",
        down: "Down case needs invalidation first: body close through demand or a failed continuation.",
        lean: leanCase,
      };
    }

    if (decision.className === "sell") {
      return {
        status: `${decision.confidence}% SELL`,
        thinking: `Live structure is aligned bearish. ${entryMode}.`,
        next: "The next likely bot action is SELL unless price closes through the tapped supply zone.",
        invalid: invalidation,
        final: label,
        up: "Up case needs invalidation first: body close through supply or a failed continuation.",
        down: "Down case is active: supply held, structure broke lower, and the bot has a SELL read.",
        lean: leanCase,
      };
    }

    if (decision.className === "no-trade") {
      return {
        status: "NO TRADE",
        thinking: decision.note,
        next: "The bot should not buy or sell until live structure gives a clean setup.",
        invalid: checklistText(decision, "Consolidation/ATH filter"),
        final: label,
        up: "Up case is blocked until price action builds a clean bullish structure.",
        down: "Down case is blocked until price action builds a clean bearish structure.",
        lean: "No trade. The bot is waiting for structure instead of guessing.",
      };
    }

    return {
      status: bias === "neutral" ? "WAIT" : `WAIT ${bias.toUpperCase()}`,
      thinking: `${structure} ${zoneTap}`,
      next: decision.note,
      invalid: invalidation,
      final: label,
      up: upCase,
      down: downCase,
      lean: leanCase,
    };
  }

  function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  }

  function predictionReadoutForDecision(decision) {
    const confidence = clampPercent(decision.confidence);
    const bias = decision.bias.direction;
    let up = bias === "bullish" ? 44 : bias === "bearish" ? 18 : 28;
    let down = bias === "bearish" ? 44 : bias === "bullish" ? 18 : 28;
    let wait = 72;

    if (decision.className === "buy") {
      up = confidence;
      down = clampPercent(100 - confidence);
      wait = clampPercent(100 - confidence + 10);
    } else if (decision.className === "sell") {
      down = confidence;
      up = clampPercent(100 - confidence);
      wait = clampPercent(100 - confidence + 10);
    } else if (decision.className === "no-trade") {
      up = 8;
      down = 8;
      wait = 100;
    } else if (decision.className === "caution") {
      up = bias === "bullish" ? clampPercent(confidence * 0.58) : 22;
      down = bias === "bearish" ? clampPercent(confidence * 0.58) : 22;
      wait = Math.max(70, clampPercent(100 - confidence + 42));
    } else {
      up = bias === "bullish" ? clampPercent(confidence * 0.68) : up;
      down = bias === "bearish" ? clampPercent(confidence * 0.68) : down;
      wait = Math.max(62, clampPercent(100 - confidence + 35));
    }

    const active = decision.className === "buy" ? "buy" : decision.className === "sell" ? "sell" : "wait";
    return {
      confidence,
      up: clampPercent(up),
      down: clampPercent(down),
      wait: clampPercent(wait),
      active,
    };
  }

  function setPredictionLight(name, activeName, score) {
    const light = predictionLights[name];
    if (!light) return;
    const isActive = name === activeName;
    light.className = `prediction-light ${isActive ? "on" : "off"} ${name}`;
    light.querySelector("small").textContent = isActive ? (score >= 70 ? "READY" : "ON") : "OFF";
  }

  function renderPredictionReadout(readout) {
    if (predictionConfidenceLabel) predictionConfidenceLabel.textContent = `${readout.confidence}%`;
    if (predictionConfidenceFill) predictionConfidenceFill.style.width = `${readout.confidence}%`;
    if (predictionUpScore) predictionUpScore.textContent = `${readout.up}%`;
    if (predictionDownScore) predictionDownScore.textContent = `${readout.down}%`;
    if (predictionWaitScore) predictionWaitScore.textContent = `${readout.wait}%`;
    if (predictionUpFill) predictionUpFill.style.width = `${readout.up}%`;
    if (predictionDownFill) predictionDownFill.style.width = `${readout.down}%`;
    if (predictionWaitFill) predictionWaitFill.style.width = `${readout.wait}%`;
    setPredictionLight("buy", readout.active, readout.up);
    setPredictionLight("sell", readout.active, readout.down);
    setPredictionLight("wait", readout.active, readout.wait);
  }

  function renderPrediction(decision) {
    const prediction = predictionForDecision(decision);
    const readout = predictionReadoutForDecision(decision);
    predictionPanel.className = `prediction-panel ${decision.className}`;
    predictionStatus.textContent = prediction.status;
    renderPredictionReadout(readout);
    predictionThinking.textContent = prediction.thinking;
    predictionNext.textContent = prediction.next;
    predictionInvalid.textContent = prediction.invalid;
    predictionFinal.textContent = prediction.final;
    predictionUpCase.textContent = prediction.up;
    predictionDownCase.textContent = prediction.down;
    predictionLeanCase.textContent = prediction.lean;
  }

  function renderPredictionUnavailable(message, className = "wait") {
    predictionPanel.className = `prediction-panel ${className}`;
    predictionStatus.textContent = className === "no-trade" ? "OFFLINE" : "WAITING";
    renderPredictionReadout({
      confidence: 0,
      up: 0,
      down: 0,
      wait: className === "no-trade" ? 100 : 70,
      active: "wait",
    });
    predictionThinking.textContent = message;
    predictionNext.textContent = "No live prediction is available yet.";
    predictionInvalid.textContent = "Live candles are required before invalidation can be read.";
    predictionFinal.textContent = className === "no-trade" ? "STATUS: DATA UNAVAILABLE" : "STATUS: LOADING";
    predictionUpCase.textContent = "Up case needs live candles first.";
    predictionDownCase.textContent = "Down case needs live candles first.";
    predictionLeanCase.textContent = "Waiting for the live status.";
  }

  function renderEngineResult({ productId, candles, m15Candles, m30Candles, h1Candles, h4Candles, d1Candles, source }) {
    const decision = window.ChamilleiaEngine.calculateStrategyDecision({
      executionCandles: candles,
      m15Candles,
      m30Candles,
      h1Candles,
      h4Candles,
      d1Candles,
    }, engineSettings);
    const latest = decision.execution.latest;
    const lastCandle = candles[candles.length - 1];
    const visibleCandles = candles.slice(-72);

    liveStatusBar.querySelector(".bar-market").textContent = productId;
    setEngineOutput(decision);
    renderLiveChart({ candles: visibleCandles, decision, productId });
    runnerCaption.textContent = `${productId} live 5-minute execution with Daily, 4H, 1H, 30M, and 15M top-down bias from ${source}. Last 5M candle: ${formatDateTime(lastCandle.time)}.`;
    const reclaimGate = decision.checklist.find((item) => item.label === "Primary indication reclaim");
    const noTradeZone = decision.checklist.find((item) => item.label === "No-trade zone");
    engineFacts.innerHTML = [
      renderFact("Market", productId),
      renderFact("Phase", decision.phase),
      renderFact("HTF bias", `${decision.bias.direction.toUpperCase()} (${decision.bias.source})`),
      renderFact("Confidence", `${decision.confidence}%`),
      renderFact("Gate", reclaimGate?.ok ? "RECLAIMED" : "WAIT"),
      renderFact("No-trade zone", noTradeZone?.text.match(/[-\d.]+-[\d.]+/)?.[0] || "-"),
      renderFact("Last close", formatPrice(latest.close)),
      renderFact("Last candle", formatDateTime(lastCandle.time)),
    ].join("");
    renderStrategyChecklist(decision.checklist);
    renderPrediction(decision);
    renderRiskPlan(decision.risk);
  }

  function parseBiquoteCandles(payload) {
    if (!Array.isArray(payload?.bars)) {
      throw new Error("Live data payload did not include candle bars");
    }

    return payload.bars
      .map((bar) => {
        const time = Math.floor(new Date(bar.openTime).getTime() / 1000);
        const low = Number(bar.low);
        const high = Number(bar.high);
        const open = Number(bar.open);
        const close = Number(bar.close);
        const volume = Number(bar.tickVolume || bar.volume || 0);
        if (![time, low, high, open, close, volume].every(Number.isFinite) || high < low) {
          return null;
        }
        return { time, low, high, open, close, volume };
      })
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);
  }

  const liveFreshnessSeconds = {
    "5m": 90 * 60,
    "15m": 3 * 60 * 60,
    "30m": 6 * 60 * 60,
    "1h": 12 * 60 * 60,
    "4h": 48 * 60 * 60,
    "1d": 10 * 24 * 60 * 60,
  };

  function assertFreshCandles(candles, interval, nowSeconds = Date.now() / 1000) {
    const newest = candles.at(-1);
    const maxAge = liveFreshnessSeconds[interval] || liveFreshnessSeconds["5m"];
    if (!newest || !Number.isFinite(newest.time)) {
      throw new Error(`Live ${interval.toUpperCase()} candles are unavailable`);
    }

    const age = nowSeconds - newest.time;
    if (age > maxAge) {
      throw new Error(`Live ${interval.toUpperCase()} candles are stale. Newest candle is ${formatDateTime(newest.time)}.`);
    }
  }

  function withCacheBust(url) {
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}_=${Date.now()}`;
  }

  async function fetchJsonCandidate(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`data server returned ${response.status}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchJsonWithFallback(url) {
    const freshUrl = withCacheBust(url);
    const urls = [freshUrl, ...proxyUrls(freshUrl)];
    return Promise.any(urls.map((candidate) => fetchJsonCandidate(candidate)));
  }

  async function loadLiveCandles() {
    const productId = marketSelect.value;
    const market = marketConfigs[productId] || marketConfigs.XAUUSD;

    reloadLive.disabled = true;
    reloadLive.textContent = "Loading";
    setEngineOutput({
      label: "STATUS: LOADING",
      note: `Fetching live ${market.name} 5-minute candles from ${market.source}.`,
      className: "wait",
    });
    renderPredictionUnavailable(`Fetching live ${market.name} candles and calculating the next bot read.`);

    try {
      const [payload5m, payload15m, payload30m, payload1h, payload4h, payload1d] = await Promise.all([
        fetchJsonWithFallback(biquoteUrl(market.symbol, "5m")),
        fetchJsonWithFallback(biquoteUrl(market.symbol, "15m")),
        fetchJsonWithFallback(biquoteUrl(market.symbol, "30m")),
        fetchJsonWithFallback(biquoteUrl(market.symbol, "1h")),
        fetchJsonWithFallback(biquoteUrl(market.symbol, "4h")),
        fetchJsonWithFallback(biquoteUrl(market.symbol, "1d")),
      ]);
      const candles = parseBiquoteCandles(payload5m);
      const m15Candles = parseBiquoteCandles(payload15m);
      const m30Candles = parseBiquoteCandles(payload30m);
      const h1Candles = parseBiquoteCandles(payload1h);
      const h4Candles = parseBiquoteCandles(payload4h);
      const d1Candles = parseBiquoteCandles(payload1d);
      if (candles.length < 30) {
        throw new Error("Not enough 5M candle data returned");
      }
      if (m15Candles.length < 30 || m30Candles.length < 30 || h1Candles.length < 30 || h4Candles.length < 30 || d1Candles.length < 30) {
        throw new Error("Not enough higher-timeframe candle data returned");
      }
      assertFreshCandles(candles, "5m");
      assertFreshCandles(m15Candles, "15m");
      assertFreshCandles(m30Candles, "30m");
      assertFreshCandles(h1Candles, "1h");
      assertFreshCandles(h4Candles, "4h");
      assertFreshCandles(d1Candles, "1d");

      renderEngineResult({
        productId: market.name,
        candles,
        m15Candles,
        m30Candles,
        h1Candles,
        h4Candles,
        d1Candles,
        source: market.source,
      });
    } catch (error) {
      setEngineOutput({
        label: "STATUS: DATA UNAVAILABLE",
        note: `Could not load live ${market.name} candles. Try Refresh again.`,
        className: "no-trade",
      });
      runnerCaption.textContent = `Live data failed: ${error.message}`;
      engineFacts.innerHTML = [
        renderFact("Market", market.name),
        renderFact("Last close", "-"),
        renderFact("HTF bias", "-"),
        renderFact("Confidence", "-"),
        renderFact("Last candle", "-"),
        renderFact("Source", market.source),
      ].join("");
      strategyChecklist.innerHTML = "";
      renderPredictionUnavailable(`Live data failed: ${error.message}`, "no-trade");
      renderRiskPlan({
        entry: null,
        stop: null,
        targetOne: null,
        targetTwo: null,
        structureTarget: null,
        text: "Live data is unavailable, so no automated strategy can be calculated.",
      });
    } finally {
      reloadLive.disabled = false;
      reloadLive.textContent = "Refresh";
    }
  }

  marketSelect.addEventListener("change", loadLiveCandles);
  reloadLive.addEventListener("click", loadLiveCandles);

  loadLatestDesktopRelease();
  loadLiveCandles();
})();
