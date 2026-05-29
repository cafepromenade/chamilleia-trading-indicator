const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const code = fs.readFileSync("docs/indicator-engine.js", "utf8");
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

  assert(reclaim, "primary indication reclaim checklist item should exist");
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
}

testPrimaryIndicationGate();
testFailedDemandNeedsSecondHigherLowReset();
testNewestZoneOnly();

console.log("indicator-engine tests passed");
