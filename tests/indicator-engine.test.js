const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const code = fs.readFileSync("docs/indicator-engine.js", "utf8");
const pineCode = fs.readFileSync("indicator/ChamilleiaSupplyDemand.pine", "utf8");
const statusCode = fs.readFileSync("docs/status.js", "utf8");
const styleCode = fs.readFileSync("docs/style.css", "utf8");
const htmlCode = fs.readFileSync("docs/index.html", "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(code, context);

const engine = context.window.ChamilleiaEngine;
assert(engine, "ChamilleiaEngine should be exposed on window");

function candle(index, open, high, low, close, volume = 1000) {
  return {
    time: 1700000000 + index * 300,
    open,
    high,
    low,
    close,
    volume,
  };
}

function filler(count, base = 100) {
  return Array.from({ length: count }, (_, index) =>
    candle(index, base, base + 1, base - 1, base + (index % 2 ? 0.2 : -0.2)));
}

function htfBullish() {
  const bars = filler(34, 95);
  bars.push(
    candle(34, 97, 101, 96, 100),
    candle(35, 98, 99, 97, 98),
    candle(36, 96, 97, 95, 96),
    candle(37, 98, 99, 97, 98),
    candle(38, 96, 97, 95, 96),
    candle(39, 100, 106, 99, 105),
  );
  return bars;
}

function decisionForExecution(executionCandles) {
  const bullish = htfBullish();
  return engine.calculateStrategyDecision({
    executionCandles,
    m15Candles: bullish,
    m30Candles: bullish,
    h1Candles: bullish,
    h4Candles: bullish,
    d1Candles: bullish,
  });
}

function baseExecution() {
  const bars = filler(20, 96);
  bars.push(
    candle(20, 96, 97, 95, 96),
    candle(21, 97, 101, 96, 100),
    candle(22, 96, 97, 94, 95),
    candle(23, 98, 99, 97, 98),
    candle(24, 95, 96, 94, 95),
    candle(25, 96, 103, 95, 102),
  );
  return bars;
}

function testPrimaryIndicationGate() {
  const execution = baseExecution();
  execution.push(
    candle(26, 101, 102, 96.2, 98.8),
    candle(27, 98.8, 99.4, 98.1, 99.2),
  );

  const decision = decisionForExecution(execution);
  const reclaim = decision.checklist.find((item) => item.label === "Primary indication reclaim");
  const noTradeZone = decision.checklist.find((item) => item.label === "No-trade zone");

  assert(reclaim, "primary indication reclaim checklist item should exist");
  assert(noTradeZone, "no-trade zone checklist item should exist");
  assert(noTradeZone.text.includes("Body-close outside this range"), "baseline no-trade zone must explain HTF body-close breakout");
  assert.strictEqual(reclaim.ok, false, "price below the indication level must not pass continuation");
  assert(!["STATUS: BUY", "STATUS: A+ BUY"].includes(decision.label), "BUY must not fire before indication reclaim");
}

function testFailedDemandNeedsSecondHigherLowReset() {
  const execution = baseExecution();
  for (let index = 26; index < 45; index += 1) {
    execution.push(candle(index, 101, 102, 92, 93));
  }

  const decision = decisionForExecution(execution);
  const invalidation = decision.checklist.find((item) => item.label === "Invalidation");
  const minorReset = decision.checklist.find((item) => item.label === "Minor BOS reset");

  assert(invalidation, "invalidation checklist item should exist");
  assert(minorReset, "minor BOS reset checklist item should exist");
  assert.strictEqual(invalidation.ok, false, "body close through demand should invalidate the zone");
  assert.strictEqual(minorReset.ok, false, "failed demand should wait for stair-step reset");
  assert(
    minorReset.text.includes("second higher low") && minorReset.text.includes("break above minor structure"),
    "failed buy reset must ask for second higher low plus minor structure break",
  );
}

function testNewestZoneOnly() {
  const execution = baseExecution();
  execution.push(
    candle(26, 101, 102, 96, 98),
    candle(27, 98, 104, 97, 103),
    candle(28, 101, 102, 99, 100),
    candle(29, 102, 106, 101, 105),
    candle(30, 104, 107, 103, 106),
  );

  const decision = decisionForExecution(execution);
  assert(decision.execution.zones.length <= 1, "engine must keep only the newest valid zone");
  assert.strictEqual(decision.risk.scaleOut, "75-90%", "risk plan must carry document scale-out guidance");
  assert(decision.risk.text.includes("75-90% partials"), "risk note must tell users to secure 75-90% partials at TP1");
}

function testPineIndicatorIsPriceActionOnly() {
  assert(!/ta\.ema|useEmaTrend|Trend EMA/i.test(pineCode), "Pine indicator must not use EMA trend filtering");
  assert(/array\.size\(zones\) > 1/.test(pineCode), "Pine indicator should keep only the newest zone");
}

function testWebsiteHasDramaticStatusFlash() {
  assert(htmlCode.includes('id="status-flash"'), "website should include a full-page status flash layer");
  assert(statusCode.includes("statusFlash.className"), "status script should color the flash layer by current status");
  assert(statusCode.includes("document.body.classList.add(`status-${result.className}`)"), "status script should theme the full dashboard by status");
  assert(/@keyframes\s+status-flash-burst/.test(styleCode), "CSS should define the dramatic status flash animation");
  for (const className of ["buy", "sell", "wait", "no-trade", "caution"]) {
    assert(styleCode.includes(`.status-flash.${className}`), `CSS should color flash state ${className}`);
    assert(styleCode.includes(`status-${className}`), `CSS should theme body state ${className}`);
  }
}

function testWebsiteHasNoExampleOrAdClutter() {
  const publicText = [htmlCode, statusCode, styleCode].join("\n");
  for (const word of ["example", "sample", "demo", "mock", "fake", "advert", "sponsor"]) {
    assert(!new RegExp(word, "i").test(publicText), `website should not contain ${word} wording`);
  }
}

function testWebsiteUsesLiveMultiTimeframeDataOnly() {
  assert(statusCode.includes("https://biquote.io/api/"), "website must fetch live market candles from BiQuote");
  assert(statusCode.includes("cache: \"no-store\""), "website live data requests must avoid cached candle payloads");
  assert(statusCode.includes("withCacheBust(url)"), "website must cache-bust live candle requests");
  for (const interval of ["5m", "15m", "30m", "1h", "4h", "1d"]) {
    assert(statusCode.includes(`biquoteUrl(market.symbol, "${interval}")`), `website must fetch ${interval} live candles`);
  }
  assert(statusCode.includes("Promise.all"), "website should load all required live timeframes together");
  assert(!/const\s+(sample|demo|mock|fake)Candles/i.test(statusCode), "website must not define static candle data");
}

testPrimaryIndicationGate();
testFailedDemandNeedsSecondHigherLowReset();
testNewestZoneOnly();
testPineIndicatorIsPriceActionOnly();
testWebsiteHasDramaticStatusFlash();
testWebsiteHasNoExampleOrAdClutter();
testWebsiteUsesLiveMultiTimeframeDataOnly();

console.log("indicator-engine tests passed");
