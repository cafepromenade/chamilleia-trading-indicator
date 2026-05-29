(function () {
  const heroStatus = document.querySelector("#hero-status");
  const heroNote = document.querySelector("#hero-status-note");
  const engineOutput = document.querySelector("#engine-output");
  const engineFacts = document.querySelector("#engine-facts");
  const chartStatus = document.querySelector("#chart-status");
  const liveChart = document.querySelector("#live-candlestick-chart");
  const runnerCaption = document.querySelector("#runner-caption");
  const marketSelect = document.querySelector("#market-select");
  const reloadLive = document.querySelector("#reload-live");

  const engineSettings = {
    pivotLen: 2,
    trendLen: 8,
    avgRangeLen: 5,
    impulseMult: 0.6,
  };

  const marketConfigs = {
    XAUUSD: {
      name: "XAUUSD - Gold",
      source: "BiQuote",
      url: "https://biquote.io/api/XAUUSD/ohlc?interval=5m",
    },
    GBPJPY: {
      name: "GBPJPY",
      source: "BiQuote",
      url: "https://biquote.io/api/GBPJPY/ohlc?interval=5m",
    },
    EURUSD: {
      name: "EURUSD",
      source: "BiQuote",
      url: "https://biquote.io/api/EURUSD/ohlc?interval=5m",
    },
    BTCUSD: {
      name: "BTCUSD",
      source: "BiQuote",
      url: "https://biquote.io/api/BTCUSD/ohlc?interval=5m",
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

  function setEngineOutput(result) {
    engineOutput.className = `status-output ${result.className}`;
    engineOutput.querySelector(".status-title").textContent = result.label;
    engineOutput.querySelector(".status-reason").textContent = result.note;
    chartStatus.className = `chart-status ${result.className}`;
    chartStatus.textContent = result.label;
    heroStatus.parentElement.className = `status-preview ${result.className}`;
    heroStatus.textContent = result.label;
    heroNote.textContent = result.note;
  }

  function renderFact(term, value) {
    return `<div><dt>${term}</dt><dd>${value}</dd></div>`;
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
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(seconds * 1000));
  }

  function renderLiveChart({ candles, result, productId }) {
    const width = 900;
    const height = 460;
    const pad = { top: 58, right: 76, bottom: 52, left: 34 };
    const chartWidth = width - pad.left - pad.right;
    const chartHeight = height - pad.top - pad.bottom;
    const lows = candles.map((candle) => candle.low);
    const highs = candles.map((candle) => candle.high);
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
      .slice(0, 4)
      .map((zone) => {
        const yTop = yFor(zone.top);
        const yBot = yFor(zone.bot);
        const className = zone.isDemand ? "demand-rect" : "supply-rect";
        return `<rect class="${className}" x="${pad.left}" y="${Math.min(yTop, yBot)}" width="${chartWidth}" height="${Math.max(2, Math.abs(yBot - yTop))}" rx="5" />`;
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
      ${candleMarkup}
      <line class="last-price-line" x1="${pad.left}" y1="${lastY}" x2="${width - pad.right}" y2="${lastY}" />
      <text class="last-price-label" x="${width - pad.right + 10}" y="${lastY - 8}">${formatPrice(last.close)}</text>
      ${timeMarkup}
    `;
  }

  function renderEngineResult({ productId, candles, source }) {
    const result = window.ChamilleiaEngine.calculateChamilleiaStatus(candles, engineSettings);
    const latest = result.latest;
    const lastCandle = candles[candles.length - 1];
    const visibleCandles = candles.slice(-72);

    setEngineOutput(latest);
    renderLiveChart({ candles: visibleCandles, result, productId });
    runnerCaption.textContent = `${productId} live 5-minute candles from ${source}. Last candle: ${formatDateTime(lastCandle.time)}.`;
    engineFacts.innerHTML = [
      renderFact("Market", productId),
      renderFact("Last close", formatPrice(latest.close)),
      renderFact("EMA", formatPrice(latest.ema)),
      renderFact("Zones found", result.zones.length),
      renderFact("Last candle", formatDateTime(lastCandle.time)),
      renderFact("Source", source),
    ].join("");
  }

  function parseBiquoteCandles(payload) {
    return payload.bars
      .map((bar) => ({
        time: Math.floor(new Date(bar.openTime).getTime() / 1000),
        low: Number(bar.low),
        high: Number(bar.high),
        open: Number(bar.open),
        close: Number(bar.close),
        volume: Number(bar.tickVolume || bar.volume || 0),
      }))
      .sort((a, b) => a.time - b.time);
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

    try {
      const payload = await fetchJsonWithFallback(market.url);
      const candles = parseBiquoteCandles(payload);
      if (candles.length < 30) {
        throw new Error("Not enough candle data returned");
      }

      renderEngineResult({
        productId: market.name,
        candles,
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
        renderFact("EMA", "-"),
        renderFact("Zones found", "-"),
        renderFact("Last candle", "-"),
        renderFact("Source", market.source),
      ].join("");
    } finally {
      reloadLive.disabled = false;
      reloadLive.textContent = "Refresh";
    }
  }

  marketSelect.addEventListener("change", loadLiveCandles);
  reloadLive.addEventListener("click", loadLiveCandles);

  loadLiveCandles();
})();
