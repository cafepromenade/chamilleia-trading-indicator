(function () {
  const statusOutput = document.querySelector("#status-output");
  const heroStatus = document.querySelector("#hero-status");
  const heroNote = document.querySelector("#hero-status-note");
  const form = document.querySelector(".signal-controls");
  const wickOnly = document.querySelector("#wickOnly");
  const engineOutput = document.querySelector("#engine-output");
  const engineFacts = document.querySelector("#engine-facts");
  const runnerCandles = document.querySelector("#runner-candles");
  const runnerCaption = document.querySelector("#runner-caption");
  const marketSelect = document.querySelector("#market-select");
  const reloadLive = document.querySelector("#reload-live");

  const demoSettings = {
    pivotLen: 2,
    trendLen: 8,
    avgRangeLen: 5,
    impulseMult: 0.6,
  };

  const states = [
    {
      label: "STATUS: WAIT",
      note: "No trade until the setup is complete.",
      className: "wait",
    },
    {
      label: "STATUS: BUY",
      note: "The chart is going up, touched the marked area, and moved up again.",
      className: "buy",
    },
    {
      label: "STATUS: SELL",
      note: "The chart is going down, touched the marked area, and moved down again.",
      className: "sell",
    },
  ];

  let heroIndex = 0;

  function setOutput(result) {
    statusOutput.className = `status-output ${result.className}`;
    statusOutput.querySelector(".status-title").textContent = result.label;
    statusOutput.querySelector(".status-reason").textContent = result.note;
  }

  function setEngineOutput(result) {
    engineOutput.className = `status-output ${result.className}`;
    engineOutput.querySelector(".status-title").textContent = result.label;
    engineOutput.querySelector(".status-reason").textContent = result.note;
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

  function renderCandles(candles, latestIndex) {
    const lows = candles.map((candle) => candle.low);
    const highs = candles.map((candle) => candle.high);
    const minLow = Math.min(...lows);
    const maxHigh = Math.max(...highs);
    const span = maxHigh - minLow || 1;

    runnerCandles.innerHTML = candles.map((candle, index) => {
      const isUp = candle.close >= candle.open;
      const rangeHeight = Math.max(22, ((candle.high - candle.low) / span) * 88);
      const bottom = ((candle.low - minLow) / span) * 82;
      const classes = ["candle", isUp ? "up" : "down"];
      if (index === latestIndex) {
        classes.push("status-candle");
      }
      return `<span class="${classes.join(" ")}" style="height: ${rangeHeight}%; margin-bottom: ${bottom}%"></span>`;
    }).join("");
  }

  function renderEngineResult({ productId, candles, source }) {
    const result = window.ChamilleiaEngine.calculateChamilleiaStatus(candles, demoSettings);
    const latest = result.latest;
    const lastCandle = candles[candles.length - 1];

    setEngineOutput(latest);
    renderCandles(candles.slice(-48), Math.min(47, latest.bar));
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

  function parseCoinbaseCandles(rows) {
    return rows
      .map(([time, low, high, open, close, volume]) => ({
        time,
        low,
        high,
        open,
        close,
        volume,
      }))
      .sort((a, b) => a.time - b.time);
  }

  async function loadLiveCandles() {
    const productId = marketSelect.value;
    const url = `https://api.exchange.coinbase.com/products/${encodeURIComponent(productId)}/candles?granularity=300`;

    reloadLive.disabled = true;
    reloadLive.textContent = "Loading";
    setEngineOutput({
      label: "STATUS: LOADING",
      note: `Fetching live ${productId} 5-minute candles from Coinbase.`,
      className: "wait",
    });

    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Coinbase returned ${response.status}`);
      }

      const rows = await response.json();
      const candles = parseCoinbaseCandles(rows);
      if (candles.length < 30) {
        throw new Error("Not enough candle data returned");
      }

      renderEngineResult({
        productId,
        candles,
        source: "Coinbase Exchange",
      });
    } catch (error) {
      setEngineOutput({
        label: "STATUS: DATA UNAVAILABLE",
        note: `Could not load live ${productId} candles. Try Refresh again.`,
        className: "no-trade",
      });
      runnerCaption.textContent = `Live data failed: ${error.message}`;
      engineFacts.innerHTML = [
        renderFact("Market", productId),
        renderFact("Last close", "-"),
        renderFact("EMA", "-"),
        renderFact("Zones found", "-"),
        renderFact("Last candle", "-"),
        renderFact("Source", "Coinbase Exchange"),
      ].join("");
    } finally {
      reloadLive.disabled = false;
      reloadLive.textContent = "Refresh";
    }
  }

  function readValue(name) {
    const selected = document.querySelector(`input[name="${name}"]:checked`);
    return selected ? selected.value : "";
  }

  function calculateStatus() {
    const trend = readValue("trend");
    const tap = readValue("tap");
    const candleBreak = readValue("break");
    const clean = wickOnly.checked;

    if (trend === "up" && tap === "yes" && candleBreak === "up") {
      return {
        label: clean ? "STATUS: A+ BUY" : "STATUS: BUY",
        note: clean
          ? "Extra clean Buy idea. It still does not promise you will make money."
          : "Buy idea. Price moved up, came back, then moved up again.",
        className: "buy",
      };
    }

    if (trend === "down" && tap === "yes" && candleBreak === "down") {
      return {
        label: clean ? "STATUS: A+ SELL" : "STATUS: SELL",
        note: clean
          ? "Extra clean Sell idea. It still does not promise you will make money."
          : "Sell idea. Price moved down, came back, then moved down again.",
        className: "sell",
      };
    }

    if (trend === "flat") {
      return {
        label: "STATUS: NO TRADE",
        note: "Price is wiggling sideways. The helper says do nothing.",
        className: "no-trade",
      };
    }

    if (tap === "no") {
      return {
        label: trend === "up" ? "STATUS: WAIT FOR BUY" : "STATUS: WAIT FOR SELL",
        note: "Price is moving, but it has not come back to the marked area yet.",
        className: "wait",
      };
    }

    return {
      label: "STATUS: WAIT",
      note: "Some pieces match, but not enough. Waiting is the answer.",
      className: "wait",
    };
  }

  function rotateHeroStatus() {
    const state = states[heroIndex % states.length];
    heroStatus.textContent = state.label;
    heroNote.textContent = state.note;
    heroIndex += 1;
  }

  form.addEventListener("change", () => setOutput(calculateStatus()));
  marketSelect.addEventListener("change", loadLiveCandles);
  reloadLive.addEventListener("click", loadLiveCandles);

  loadLiveCandles();
  setOutput(calculateStatus());
  rotateHeroStatus();
  setInterval(rotateHeroStatus, 3200);
})();
