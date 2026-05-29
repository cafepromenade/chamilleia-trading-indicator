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

const ACTIVE_SESSION_BASE = 1700051700;
const OUTSIDE_SESSION_BASE = 1700076900;

function candle(index, open, high, low, close, volume = 1000) {
  return {
    time: ACTIVE_SESSION_BASE + index * 300,
    open,
    high,
    low,
    close,
    volume,
  };
}

function outsideSession(candles) {
  return candles.map((bar, index) => ({
    ...bar,
    time: OUTSIDE_SESSION_BASE + index * 300,
  }));
}

function filler(count, base = 100) {
  return Array.from({ length: count }, (_, index) =>
    candle(index, base, base + 1, base - 1, base + (index % 2 ? 0.2 : -0.2)));
}

function htfBullish() {
  const bars = filler(34, 95);
  bars.push(
    candle(34, 97, 120, 96, 100),
    candle(35, 98, 99, 97, 98),
    candle(36, 96, 97, 95, 96),
    candle(37, 98, 99, 97, 98),
    candle(38, 96, 97, 95, 96),
    candle(39, 100, 106, 99, 105),
  );
  return bars;
}

function htfBearish() {
  const bars = filler(34, 112);
  bars.push(
    candle(34, 103, 116, 99, 100),
    candle(35, 102, 114, 101, 102),
    candle(36, 104, 115, 103, 104),
    candle(37, 102, 113, 101, 102),
    candle(38, 104, 115, 103, 104),
    candle(39, 100, 110, 94, 95),
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

function executionWithZoneTap(tapIsWickOnly) {
  const bars = filler(22, 96);
  bars.push(
    candle(22, 96, 97, 95, 96),
    candle(23, 97, 101, 96, 100),
    candle(24, 96, 97, 94, 95),
    candle(25, 98, 99, 97, 98),
    candle(26, 95, 96, 94, 95),
    candle(27, 96, 103, 95, 102),
    tapIsWickOnly
      ? candle(28, 102, 103, 94.5, 102.5)
      : candle(28, 96.2, 103, 94.5, 96.5),
    candle(29, 103.1, 107, 103, 106),
  );
  return bars;
}

function executionWithCounterTrendBreak(isStrongFullBody) {
  const bars = executionWithZoneTap(true);
  bars[bars.length - 1] = isStrongFullBody
    ? candle(29, 103.1, 107, 103, 106)
    : candle(29, 100, 107, 99.8, 106);
  return bars;
}

function executionWithWideZoneStop() {
  const bars = executionWithZoneTap(true);
  bars[26] = candle(26, 95, 96, 55, 94.9);
  return bars;
}

function rangingMarketAtSupport() {
  const bars = [];
  for (let index = 0; index < 45; index += 1) {
    let open = 104.8;
    let high = 105.5;
    let low = 104.5;
    let close = 105.2;
    if (index % 8 === 2) {
      open = 109.2;
      high = 110.4;
      low = 109;
      close = 110;
    }
    if (index % 8 === 6) {
      open = 100.8;
      high = 101;
      low = 99.6;
      close = 100;
    }
    if (index === 44) {
      open = 101.1;
      high = 101.3;
      low = 100.7;
      close = 101;
    }
    bars.push(candle(index, open, high, low, close));
  }
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
  assert.strictEqual(
    decision.risk.entryMode,
    "AGGRESSIVE / CONSERVATIVE / BREAK OF CANDLE",
    "trend risk plan must expose all three documented entry types",
  );
  for (const entryType of ["aggressive", "conservative", "break-of-candle"]) {
    assert(decision.risk.text.includes(entryType), `risk note must explain ${entryType} entry type`);
  }
}

function testRangeFallbackUsesStrictOneToOneRisk() {
  const ranging = rangingMarketAtSupport();
  const decision = engine.calculateStrategyDecision({
    executionCandles: ranging,
    m15Candles: ranging,
    m30Candles: ranging,
    h1Candles: ranging,
    h4Candles: ranging,
    d1Candles: ranging,
  });

  assert.strictEqual(decision.phase, "SUPPORT / RESISTANCE", "range fallback should use support/resistance phase near a range edge");
  assert.strictEqual(decision.label, "STATUS: WAIT RANGE BUY", "support edge should produce wait range buy status");
  assert.strictEqual(decision.risk.entryMode, "RANGE SUPPORT 1:1", "range fallback should identify the support 1:1 entry mode");
  assert.strictEqual(decision.risk.scaleOut, "100% at 1:1", "range fallback should not use trend-runner scaling");
  assert.strictEqual(decision.risk.targetTwo, null, "range fallback should not create a runner target");
  assert(
    decision.risk.text.includes("strict 1:1") && decision.risk.text.includes("No runner"),
    "range fallback risk text must enforce strict 1:1 with no runner",
  );
}

function testAPlusRequiresWickOnlyZoneTap() {
  const bullish = htfBullish();
  const wickOnlyDecision = engine.calculateStrategyDecision({
    executionCandles: executionWithZoneTap(true),
    m15Candles: bullish,
    m30Candles: bullish,
    h1Candles: bullish,
    h4Candles: bullish,
    d1Candles: bullish,
  });
  const bodyInZoneDecision = engine.calculateStrategyDecision({
    executionCandles: executionWithZoneTap(false),
    m15Candles: bullish,
    m30Candles: bullish,
    h1Candles: bullish,
    h4Candles: bullish,
    d1Candles: bullish,
  });

  assert.strictEqual(wickOnlyDecision.execution.latest.aPlusBuy, true, "wick-only tap with no body in zone should allow A+ buy");
  assert.strictEqual(wickOnlyDecision.execution.latest.lastTap.wickOnlyNoBodyInZone, true, "tap should record wick-only/no-body A+ eligibility");
  assert.strictEqual(bodyInZoneDecision.execution.latest.buyTrigger, true, "body-in-zone fixture should still be a normal buy trigger");
  assert.strictEqual(bodyInZoneDecision.execution.latest.aPlusBuy, false, "body entering the zone must block A+ buy");
  assert.strictEqual(bodyInZoneDecision.execution.latest.lastTap.wickOnlyNoBodyInZone, false, "body-in-zone tap should record that it is not A+ clean");
}

function testCounterTrendNeedsStrongFullBodyBreakAndStrictRisk() {
  const bullish = htfBullish();
  const bearishDaily = htfBearish();
  const weakCounterTrend = engine.calculateStrategyDecision({
    executionCandles: executionWithCounterTrendBreak(false),
    m15Candles: bullish,
    m30Candles: bullish,
    h1Candles: bullish,
    h4Candles: bullish,
    d1Candles: bearishDaily,
  });
  const strongCounterTrend = engine.calculateStrategyDecision({
    executionCandles: executionWithCounterTrendBreak(true),
    m15Candles: bullish,
    m30Candles: bullish,
    h1Candles: bullish,
    h4Candles: bullish,
    d1Candles: bearishDaily,
  });
  const weakCounterChecklist = weakCounterTrend.checklist.find((item) => item.label === "Counter trend-line break");
  const strongCounterChecklist = strongCounterTrend.checklist.find((item) => item.label === "Counter trend-line break");

  assert(weakCounterChecklist, "counter trend-line checklist item should exist");
  assert(strongCounterChecklist, "counter trend-line checklist item should exist");
  assert.strictEqual(weakCounterTrend.phase, "COUNTER-TREND GATE", "Daily-opposite setup should wait if the break is not full-body strong");
  assert.strictEqual(weakCounterTrend.label, "STATUS: WAIT FOR BUY", "weak counter-trend break must not become BUY");
  assert.strictEqual(weakCounterChecklist.ok, false, "weak counter-trend break should fail the counter checklist");
  assert.strictEqual(strongCounterTrend.label, "STATUS: A+ BUY", "strong full-body counter-trend break may continue to the live status");
  assert.strictEqual(strongCounterChecklist.ok, true, "strong full-body counter break should pass");
  assert.strictEqual(strongCounterTrend.risk.entryMode, "COUNTER-TREND STRICT 1:1", "counter-trend exception must use strict 1:1 entry mode");
  assert.strictEqual(strongCounterTrend.risk.scaleOut, "100% at 1:1", "counter-trend exception must fully exit at 1:1");
  assert.strictEqual(strongCounterTrend.risk.targetTwo, null, "counter-trend exception must not create a runner target");
  assert(strongCounterTrend.risk.text.includes("no runner"), "counter-trend risk text must say no runner");
}

function testSessionGateBlocksBuyOutsidePreferredWindows() {
  const bullish = htfBullish();
  const activeSession = engine.calculateStrategyDecision({
    executionCandles: executionWithZoneTap(true),
    m15Candles: bullish,
    m30Candles: bullish,
    h1Candles: bullish,
    h4Candles: bullish,
    d1Candles: bullish,
  });
  const outsidePreferredSession = engine.calculateStrategyDecision({
    executionCandles: outsideSession(executionWithZoneTap(true)),
    m15Candles: bullish,
    m30Candles: bullish,
    h1Candles: bullish,
    h4Candles: bullish,
    d1Candles: bullish,
  });
  const sessionChecklist = outsidePreferredSession.checklist.find((item) => item.label === "Trading session");

  assert.strictEqual(activeSession.label, "STATUS: A+ BUY", "active London/New York session should allow the valid setup");
  assert.strictEqual(outsidePreferredSession.phase, "SESSION GATE", "outside preferred sessions should use the session gate");
  assert.strictEqual(outsidePreferredSession.label, "STATUS: WAIT SESSION BUY", "outside preferred sessions must not become BUY");
  assert.strictEqual(outsidePreferredSession.className, "caution", "session-gated setup should use caution coloring");
  assert(sessionChecklist && !sessionChecklist.ok, "session checklist should fail outside London/New York");
  assert(sessionChecklist.text.includes("gated until London or New York"), "session checklist should explain why BUY/SELL is blocked");
}

function testWideZoneStopUsesEnteringCandleFallback() {
  const bullish = htfBullish();
  const decision = engine.calculateStrategyDecision({
    executionCandles: executionWithWideZoneStop(),
    m15Candles: bullish,
    m30Candles: bullish,
    h1Candles: bullish,
    h4Candles: bullish,
    d1Candles: bullish,
  });

  assert.strictEqual(decision.label, "STATUS: A+ BUY", "wide-zone fixture should still be a valid buy setup");
  assert.strictEqual(decision.risk.stop, 103, "risk plan should use the entering candle low instead of the huge zone low");
  assert.strictEqual(decision.risk.risk, 3, "entering candle stop should shrink risk inside the 50-point guide");
  assert.strictEqual(decision.risk.stopWithinLimit, true, "entering candle fallback should make the stop acceptable");
  assert(decision.risk.text.includes("entering candle stop"), "risk text should explain the entering-candle fallback");
}

function testLowerTimeframeOppositionBlocksEntry() {
  const bullish = htfBullish();
  const bearishM15 = htfBearish();
  const decision = engine.calculateStrategyDecision({
    executionCandles: executionWithZoneTap(true),
    m15Candles: bearishM15,
    m30Candles: bullish,
    h1Candles: bullish,
    h4Candles: bullish,
    d1Candles: bullish,
  });
  const topDown = decision.checklist.find((item) => item.label === "Top-down story");

  assert.strictEqual(decision.phase, "TOP-DOWN GATE", "lower-timeframe opposition should use the top-down gate");
  assert.strictEqual(decision.label, "STATUS: WAIT CONFIRM BUY", "lower-timeframe opposition must not become BUY");
  assert.strictEqual(decision.className, "caution", "top-down-gated setup should use caution coloring");
  assert(topDown && !topDown.ok, "top-down checklist should fail when 15M opposes the active bias");
  assert(topDown.text.includes("30M/15M must stop opposing"), "top-down checklist should explain the required confirmation");
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

function testWebsiteLinksLatestDesktopInstaller() {
  assert(htmlCode.includes('id="status-install-desktop"'), "sticky status bar should include a desktop install link");
  assert(htmlCode.includes("data-install-desktop"), "desktop install links should share the latest-release hook");
  assert(
    htmlCode.includes("releases/latest/download/ChamSD.Desktop.Setup.exe"),
    "desktop install link should default to the latest GitHub Actions installer asset",
  );
  assert(statusCode.includes("https://api.github.com/repos/cafepromenade/chamilleia-trading-indicator/releases/latest"), "website should look up the newest GitHub release");
  assert(statusCode.includes("installDesktopLinks.forEach"), "all desktop install links should update from the latest release response");
  assert(statusCode.includes("ChamSD.Desktop.Setup.exe"), "latest release lookup should target the NSIS installer asset");
}

function testWebsiteUsesTwentyFourHourTimeOnly() {
  assert(statusCode.includes('hour: "2-digit"'), "website visible chart timestamps should use fixed-width 24-hour hours");
  assert(statusCode.includes('hourCycle: "h23"'), "website visible timestamps should use 00-23 hour cycle");
  assert(statusCode.includes("hour12: false"), "website visible timestamps should explicitly disable AM/PM output");
  assert(code.includes('hourCycle: "h23"'), "strategy session text should use 00-23 hour cycle");
  assert(code.includes('padStart(2, "0")'), "strategy session text should show fixed-width HH:mm time");
  assert(!/\bhour12\s*:\s*true\b/.test(statusCode), "website must not enable 12-hour time");
  assert(!/\b(AM|PM)\b/.test([htmlCode, statusCode].join("\n")), "website public UI code must not contain AM/PM time labels");
}

testPrimaryIndicationGate();
testFailedDemandNeedsSecondHigherLowReset();
testNewestZoneOnly();
testRangeFallbackUsesStrictOneToOneRisk();
testAPlusRequiresWickOnlyZoneTap();
testCounterTrendNeedsStrongFullBodyBreakAndStrictRisk();
testSessionGateBlocksBuyOutsidePreferredWindows();
testWideZoneStopUsesEnteringCandleFallback();
testLowerTimeframeOppositionBlocksEntry();
testPineIndicatorIsPriceActionOnly();
testWebsiteHasDramaticStatusFlash();
testWebsiteHasNoExampleOrAdClutter();
testWebsiteUsesLiveMultiTimeframeDataOnly();
testWebsiteLinksLatestDesktopInstaller();
testWebsiteUsesTwentyFourHourTimeOnly();

console.log("indicator-engine tests passed");
