(function (global) {
  const DEFAULT_SETTINGS = {
    pivotLen: 2,
    avgRangeLen: 5,
    impulseMult: 0.6,
    maxZones: 1,
  };

  function round(value, places = 2) {
    if (!Number.isFinite(value)) {
      return null;
    }
    return Number(value.toFixed(places));
  }

  function getRangeAverage(ranges, index, length) {
    if (index < length - 1) {
      return null;
    }

    let total = 0;
    for (let i = index - length + 1; i <= index; i += 1) {
      total += ranges[i];
    }
    return total / length;
  }

  function findPivots(candles, pivotLen) {
    const highs = [];
    const lows = [];
    for (let index = pivotLen; index < candles.length; index += 1) {
      const high = getPivot(candles, index, pivotLen, "high", "high");
      const low = getPivot(candles, index, pivotLen, "low", "low");
      if (high) {
        highs.push(high);
      }
      if (low) {
        lows.push(low);
      }
    }
    return { highs, lows };
  }

  function getPivot(candles, index, pivotLen, field, mode) {
    const pivotIndex = index - pivotLen;
    if (pivotIndex < pivotLen) {
      return null;
    }

    const value = candles[pivotIndex][field];
    for (let i = pivotIndex - pivotLen; i <= pivotIndex + pivotLen; i += 1) {
      if (i === pivotIndex) {
        continue;
      }
      if (mode === "high" && value <= candles[i][field]) {
        return null;
      }
      if (mode === "low" && value >= candles[i][field]) {
        return null;
      }
    }

    return { value, index: pivotIndex };
  }

  function findLastOppositeCandle(candles, index, wantRed) {
    for (let offset = 1; offset <= 10; offset += 1) {
      const candle = candles[index - offset];
      if (!candle) {
        break;
      }

      const isRed = candle.close < candle.open;
      const isGreen = candle.close > candle.open;
      if ((wantRed && isRed) || (!wantRed && isGreen)) {
        return {
          sourceIndex: index - offset,
          top: candle.high,
          bot: candle.low,
        };
      }
    }

    return null;
  }

  function statusForBar({ buyTrigger, sellTrigger, aPlusBuy, aPlusSell, bull, bear }) {
    if (buyTrigger) {
      return {
        label: aPlusBuy ? "STATUS: A+ BUY" : "STATUS: BUY",
        note: aPlusBuy
          ? "The JavaScript runner found an extra clean Buy idea."
          : "The JavaScript runner found a Buy idea.",
        className: "buy",
      };
    }

    if (sellTrigger) {
      return {
        label: aPlusSell ? "STATUS: A+ SELL" : "STATUS: SELL",
        note: aPlusSell
          ? "The JavaScript runner found an extra clean Sell idea."
          : "The JavaScript runner found a Sell idea.",
        className: "sell",
      };
    }

    if (bull) {
      return {
        label: "STATUS: WAIT FOR BUY",
        note: "Market structure is bullish. Wait for the marked area and trigger.",
        className: "wait",
      };
    }

    if (bear) {
      return {
        label: "STATUS: WAIT FOR SELL",
        note: "Market structure is bearish. Wait for the marked area and trigger.",
        className: "wait",
      };
    }

    return {
      label: "STATUS: NO TRADE",
      note: "No clear direction. The runner says do nothing.",
      className: "no-trade",
    };
  }

  function calculateChamilleiaStatus(candles, options = {}) {
    const settings = { ...DEFAULT_SETTINGS, ...options };
    const ranges = [];
    const zones = [];
    const events = [];

    let priorSwingHigh = null;
    let priorSwingLow = null;
    let lastSwingHigh = null;
    let lastSwingLow = null;
    let structureDirection = "neutral";
    let lastTap = null;
    let latest = null;

    candles.forEach((candle, index) => {
      ranges[index] = candle.high - candle.low;

      const pivotHigh = getPivot(candles, index, settings.pivotLen, "high", "high");
      const pivotLow = getPivot(candles, index, settings.pivotLen, "low", "low");
      if (pivotHigh) {
        if (lastSwingHigh !== null && pivotHigh.value > lastSwingHigh) {
          structureDirection = "bullish";
        }
        if (lastSwingHigh !== null && pivotHigh.value < lastSwingHigh && lastSwingLow !== null && priorSwingLow !== null && lastSwingLow < priorSwingLow) {
          structureDirection = "bearish";
        }
        priorSwingHigh = lastSwingHigh;
        lastSwingHigh = pivotHigh.value;
      }
      if (pivotLow) {
        if (lastSwingLow !== null && pivotLow.value < lastSwingLow) {
          structureDirection = "bearish";
        }
        if (lastSwingLow !== null && pivotLow.value > lastSwingLow && lastSwingHigh !== null && priorSwingHigh !== null && lastSwingHigh > priorSwingHigh) {
          structureDirection = "bullish";
        }
        priorSwingLow = lastSwingLow;
        lastSwingLow = pivotLow.value;
      }

      const previous = candles[index - 1];
      const brokeHigh = Boolean(
        previous && lastSwingHigh !== null && (candle.high > lastSwingHigh || candle.close > lastSwingHigh) && previous.high <= lastSwingHigh
      );
      const brokeLow = Boolean(
        previous && lastSwingLow !== null && (candle.low < lastSwingLow || candle.close < lastSwingLow) && previous.low >= lastSwingLow
      );
      if (brokeHigh) {
        structureDirection = "bullish";
      }
      if (brokeLow) {
        structureDirection = "bearish";
      }
      const bull = structureDirection === "bullish";
      const bear = structureDirection === "bearish";

      const avgRange = getRangeAverage(ranges, index, settings.avgRangeLen);
      const strongUp = Boolean(
        avgRange && candle.close > candle.open && ranges[index] > avgRange * settings.impulseMult
      );
      const strongDown = Boolean(
        avgRange && candle.close < candle.open && ranges[index] > avgRange * settings.impulseMult
      );

      const bosUp = brokeHigh;
      const bosDown = brokeLow;

      if (bosUp && bull && strongUp) {
        const base = findLastOppositeCandle(candles, index, true);
        if (base) {
          zones.length = 0;
          lastTap = null;
          zones.unshift({ ...base, isDemand: true, invalidated: false, tapped: false, createdAt: index });
          events.push({ type: "BOS up", bar: index });
        }
      }

      if (bosDown && bear && strongDown) {
        const base = findLastOppositeCandle(candles, index, false);
        if (base) {
          zones.length = 0;
          lastTap = null;
          zones.unshift({ ...base, isDemand: false, invalidated: false, tapped: false, createdAt: index });
          events.push({ type: "BOS down", bar: index });
        }
      }

      const zone = zones[0];
      if (zone && !zone.invalidated) {
        const tappedNow = candle.low <= zone.top && candle.high >= zone.bot;
        if (tappedNow && !zone.tapped && index > zone.createdAt) {
          zone.tapped = true;
          lastTap = {
            top: zone.top,
            bot: zone.bot,
            isDemand: zone.isDemand,
            bar: index,
          };
          events.push({ type: zone.isDemand ? "Demand tap" : "Supply tap", bar: index });
        }

        const bodyThrough = zone.isDemand ? candle.close < zone.bot : candle.close > zone.top;
        if (bodyThrough) {
          zone.invalidated = true;
          if (lastTap && lastTap.top === zone.top && lastTap.bot === zone.bot && lastTap.isDemand === zone.isDemand) {
            lastTap = null;
          }
        }
      }

      const demandTapClose = Boolean(
        previous && lastTap && lastTap.isDemand && previous.low <= lastTap.top && previous.high >= lastTap.bot
      );
      const supplyTapClose = Boolean(
        previous && lastTap && !lastTap.isDemand && previous.low <= lastTap.top && previous.high >= lastTap.bot
      );
      const buyTrigger = Boolean(demandTapClose && candle.high > previous.high && bull);
      const sellTrigger = Boolean(supplyTapClose && candle.low < previous.low && bear);
      const aPlusBuy = Boolean(buyTrigger && candle.open >= lastTap.top);
      const aPlusSell = Boolean(sellTrigger && candle.open <= lastTap.bot);

      latest = {
        ...statusForBar({ buyTrigger, sellTrigger, aPlusBuy, aPlusSell, bull, bear }),
        bar: index,
        close: candle.close,
        bull,
        bear,
        structureDirection,
        buyTrigger,
        sellTrigger,
        aPlusBuy,
        aPlusSell,
        lastSwingHigh: round(lastSwingHigh),
        lastSwingLow: round(lastSwingLow),
        lastTap,
      };
    });

    return {
      latest,
      events,
      zones: zones.map((zone) => ({
        ...zone,
        top: round(zone.top),
        bot: round(zone.bot),
      })),
      candles,
      settings,
    };
  }

  function findBodyStructure(candles, pivotLen = 3) {
    let swingHigh = null;
    let swingLow = null;
    let priorSwingHigh = null;
    let priorSwingLow = null;

    for (let index = pivotLen; index < candles.length - pivotLen; index += 1) {
      const bodyHigh = Math.max(candles[index].open, candles[index].close);
      const bodyLow = Math.min(candles[index].open, candles[index].close);
      let isHigh = true;
      let isLow = true;

      for (let look = index - pivotLen; look <= index + pivotLen; look += 1) {
        if (look === index) {
          continue;
        }
        const compareHigh = Math.max(candles[look].open, candles[look].close);
        const compareLow = Math.min(candles[look].open, candles[look].close);
        if (bodyHigh <= compareHigh) {
          isHigh = false;
        }
        if (bodyLow >= compareLow) {
          isLow = false;
        }
      }

      if (isHigh) {
        priorSwingHigh = swingHigh;
        swingHigh = { price: bodyHigh, bar: index };
      }
      if (isLow) {
        priorSwingLow = swingLow;
        swingLow = { price: bodyLow, bar: index };
      }
    }

    return { swingHigh, swingLow, priorSwingHigh, priorSwingLow };
  }

  function calculateHtfBias(candles, label) {
    const latest = candles[candles.length - 1];
    const { swingHigh, swingLow, priorSwingHigh, priorSwingLow } = findBodyStructure(candles, 3);
    const bodyHigh = Math.max(latest.open, latest.close);
    const bodyLow = Math.min(latest.open, latest.close);
    const brokeHigh = Boolean(swingHigh && latest.close > swingHigh.price);
    const brokeLow = Boolean(swingLow && latest.close < swingLow.price);
    const higherHigh = Boolean(swingHigh && priorSwingHigh && swingHigh.price > priorSwingHigh.price);
    const higherLow = Boolean(swingLow && priorSwingLow && swingLow.price > priorSwingLow.price);
    const lowerHigh = Boolean(swingHigh && priorSwingHigh && swingHigh.price < priorSwingHigh.price);
    const lowerLow = Boolean(swingLow && priorSwingLow && swingLow.price < priorSwingLow.price);

    let direction = "neutral";
    let reason = "No clean body-close break or market-structure sequence.";
    if (brokeHigh || (!brokeLow && higherHigh && higherLow)) {
      direction = "bullish";
      reason = brokeHigh
        ? `${label} body closed above its latest structural high.`
        : `${label} has a higher high and higher low structure.`;
    }
    if (brokeLow || (!brokeHigh && lowerHigh && lowerLow)) {
      direction = "bearish";
      reason = brokeLow
        ? `${label} body closed below its latest structural low.`
        : `${label} has a lower high and lower low structure.`;
    }

    return {
      label,
      direction,
      reason,
      close: latest.close,
      swingHigh: swingHigh ? round(swingHigh.price) : null,
      swingLow: swingLow ? round(swingLow.price) : null,
      indicationLevel: direction === "bullish"
        ? swingHigh ? round(swingHigh.price) : null
        : direction === "bearish"
          ? swingLow ? round(swingLow.price) : null
          : null,
      bodyHigh: round(bodyHigh),
      bodyLow: round(bodyLow),
    };
  }

  function chooseBias(h4Bias, h1Bias) {
    if (h4Bias.direction !== "neutral") {
      return {
        direction: h4Bias.direction,
        source: "4H",
        reason: `4H overrides 1H. ${h4Bias.reason}`,
      };
    }

    return {
      direction: h1Bias.direction,
      source: "1H",
      reason: h1Bias.reason,
    };
  }

  function findStructureTarget(candles, close, direction) {
    const pivots = findPivots(candles, DEFAULT_SETTINGS.pivotLen);
    if (direction === "bullish") {
      return pivots.highs.map((pivot) => pivot.value).filter((value) => value > close).sort((a, b) => a - b)[0] ?? null;
    }
    if (direction === "bearish") {
      return pivots.lows.map((pivot) => pivot.value).filter((value) => value < close).sort((a, b) => b - a)[0] ?? null;
    }
    return null;
  }

  function calculateRangeRiskPlan(latest, rangeLow, rangeHigh, nearSupport, nearResistance, rangeBuffer) {
    if (!nearSupport && !nearResistance) {
      return null;
    }

    const entry = latest.close;
    const buffer = rangeBuffer || Math.abs(entry) * 0.0004 || 1;
    const stop = nearSupport ? rangeLow - buffer : rangeHigh + buffer;
    const risk = Math.abs(entry - stop);
    if (!Number.isFinite(risk) || risk === 0) {
      return null;
    }

    const targetOne = nearSupport ? entry + risk : entry - risk;
    return {
      entry: round(entry),
      stop: round(stop),
      risk: round(risk),
      targetOne: round(targetOne),
      targetTwo: null,
      structureTarget: round(nearSupport ? rangeHigh : rangeLow),
      entryMode: nearSupport ? "RANGE SUPPORT 1:1" : "RANGE RESISTANCE 1:1",
      scaleOut: "100% at 1:1",
      stopWithinLimit: risk <= 50,
      text: `Range fallback only: ${nearSupport ? "support floor" : "resistance ceiling"} with strict 1:1. No runner and no trend target until market structure breaks out of the range.`,
    };
  }

  function calculateRiskPlan(latest, direction, structureTarget, rangePlan = null) {
    if (rangePlan) {
      return rangePlan;
    }

    const tapMatchesDirection = latest.lastTap && (
      (direction === "bullish" && latest.lastTap.isDemand) ||
      (direction === "bearish" && !latest.lastTap.isDemand)
    );

    if (!tapMatchesDirection || direction === "neutral") {
      return {
        entry: null,
        stop: null,
        risk: null,
        targetOne: null,
        targetTwo: null,
        structureTarget: round(structureTarget),
        entryMode: "WAIT",
        scaleOut: "75-90%",
        stopWithinLimit: true,
        text: "No live entry plan until price taps a valid zone and gives a trigger. If market stays sideways, use support/resistance only with strict 1:1.",
      };
    }

    const entry = latest.close;
    const stop = direction === "bullish" ? latest.lastTap.bot : latest.lastTap.top;
    const risk = Math.abs(entry - stop);
    const stopIsValid = direction === "bullish" ? stop < entry : stop > entry;
    if (!Number.isFinite(risk) || risk === 0 || !stopIsValid) {
      return {
        entry: round(entry),
        stop: round(stop),
        risk: null,
        targetOne: null,
        targetTwo: null,
        structureTarget: round(structureTarget),
        entryMode: "ZONE TAPPED",
        scaleOut: "75-90%",
        stopWithinLimit: true,
        text: "Risk cannot be calculated from the current live zone.",
      };
    }

    const stopWithinLimit = risk <= 50;
    const stopText = stopWithinLimit
      ? "Stop size is inside the 50-point guide."
      : "Stop is larger than the 50-point guide; use the entering candle or skip.";
    const targetOne = direction === "bullish" ? entry + risk : entry - risk;
    const targetTwo = direction === "bullish" ? entry + risk * 2 : entry - risk * 2;
    return {
      entry: round(entry),
      stop: round(stop),
      risk: round(risk),
      targetOne: round(targetOne),
      targetTwo: round(targetTwo),
      structureTarget: round(structureTarget),
      entryMode: "BREAK OF CANDLE",
      scaleOut: "75-90%",
      stopWithinLimit,
      text: `Stop is outside the tapped zone. ${stopText} TP1 is 1:1: secure 75-90% partials and move stop to break-even; runner targets ${structureTarget === null ? "1:2 because no clean historical swing target is above/below price." : "the next major historical swing before stretching to 1:2."}`,
    };
  }

  function getSessionContext(seconds) {
    const date = new Date(seconds * 1000);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    const total = hour * 60 + minute;
    const london = total >= 180 && total <= 720;
    const ny = total >= 570 && total <= 960;
    const name = london && ny ? "London/New York overlap" : london ? "London session" : ny ? "New York session" : "outside main sessions";
    return {
      ok: london || ny,
      text: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ET is ${name}. Doc rule prefers London or New York 09:30 ET volume.`,
    };
  }

  function entryModeText(latest, direction, hasAlignedTap) {
    if (!hasAlignedTap) {
      return "No entry mode yet. Wait for the newest supply/demand zone tap.";
    }
    if (!latest.lastTap) {
      return "Zone state is not ready.";
    }
    const conservativeReady = direction === "bullish"
      ? latest.close > latest.lastTap.top
      : direction === "bearish" && latest.close < latest.lastTap.bot;
    return conservativeReady
      ? "Conservative entry can be watched: price closed out of the zone. Break-of-candle confirmation is still preferred."
      : "Aggressive entry would mean pressing inside the zone; safest rule waits for candle close and next-candle break.";
  }

  function analyzeMinorBosReset(candles, direction, newestZone) {
    if (!newestZone?.invalidated || direction === "neutral") {
      return {
        ready: false,
        text: "No failed zone needs a minor-BOS reset right now.",
      };
    }

    const afterZone = candles.slice(Math.max(0, newestZone.createdAt + 1));
    if (afterZone.length < 8) {
      return {
        ready: false,
        text: "Zone failed, but there are not enough new 5M candles to prove a stair-step reset.",
      };
    }

    const pivots = findPivots(afterZone, DEFAULT_SETTINGS.pivotLen);
    const lastClose = candles[candles.length - 1].close;
    if (direction === "bullish") {
      const lows = pivots.lows.slice(-2);
      const highs = pivots.highs.slice(-2);
      const secondHigherLow = lows.length >= 2 && lows[1].value > lows[0].value;
      const breakAboveMinorHigh = highs.length > 0 && lastClose > highs[highs.length - 1].value;
      return {
        ready: secondHigherLow && breakAboveMinorHigh,
        text: secondHigherLow && breakAboveMinorHigh
          ? "Zone failed, then 5M printed a second higher low and broke minor structure upward."
          : "Zone failed. Wait for a second higher low and a body-close break above minor structure before re-arming buys.",
      };
    }

    if (direction === "bearish") {
      const highs = pivots.highs.slice(-2);
      const lows = pivots.lows.slice(-2);
      const secondLowerHigh = highs.length >= 2 && highs[1].value < highs[0].value;
      const breakBelowMinorLow = lows.length > 0 && lastClose < lows[lows.length - 1].value;
      return {
        ready: secondLowerHigh && breakBelowMinorLow,
        text: secondLowerHigh && breakBelowMinorLow
          ? "Zone failed, then 5M printed a second lower high and broke minor structure downward."
          : "Zone failed. Wait for a second lower high and a body-close break below minor structure before re-arming sells.",
      };
    }

    return {
      ready: false,
      text: "No valid minor-BOS reset direction is available yet.",
    };
  }

  function analyzeExceptions({ executionCandles, d1Candles, latest, bias, d1Bias, m15Bias, newestZone }) {
    const recent = executionCandles.slice(-24);
    const recentHigh = Math.max(...recent.map((candle) => candle.high));
    const recentLow = Math.min(...recent.map((candle) => candle.low));
    const recentSpan = recentHigh - recentLow;
    const avgRange = recent.reduce((sum, candle) => sum + (candle.high - candle.low), 0) / Math.max(1, recent.length);
    const lastCandle = executionCandles[executionCandles.length - 1];
    const lastRange = lastCandle.high - lastCandle.low;
    const aggressiveFailure = avgRange > 0 && lastRange > avgRange * 1.2;
    const newestZoneInvalidated = Boolean(newestZone?.invalidated);
    const consolidation = recent.length >= 20 && recentSpan < avgRange * 5 && !latest.buyTrigger && !latest.sellTrigger;
    const historyHigh = Math.max(...d1Candles.map((candle) => candle.high));
    const historyLow = Math.min(...d1Candles.map((candle) => candle.low));
    const historyBuffer = Math.max((historyHigh - historyLow) * 0.015, Math.abs(latest.close) * 0.0008);
    const noUpsideTarget = bias.direction === "bullish" && latest.close >= historyHigh - historyBuffer;
    const noDownsideTarget = bias.direction === "bearish" && latest.close <= historyLow + historyBuffer;
    const noHistoricalTarget = noUpsideTarget || noDownsideTarget;
    const minorReset = analyzeMinorBosReset(executionCandles, bias.direction, newestZone);
    const minorResetReady = newestZoneInvalidated && minorReset.ready && (
      (bias.direction === "bullish" && m15Bias.direction !== "bearish") ||
      (bias.direction === "bearish" && m15Bias.direction !== "bullish")
    );
    const counterTrend = d1Bias.direction !== "neutral" && bias.direction !== "neutral" && d1Bias.direction !== bias.direction;
    const counterBreakReady = counterTrend && (
      (bias.direction === "bullish" && latest.bull && m15Bias.direction === "bullish") ||
      (bias.direction === "bearish" && latest.bear && m15Bias.direction === "bearish")
    );
    const bullishFailedThroughStop = newestZoneInvalidated && newestZone?.isDemand && bias.direction === "bullish" && latest.bear && latest.close < newestZone.bot;
    const bearishFailedThroughStop = newestZoneInvalidated && newestZone && !newestZone.isDemand && bias.direction === "bearish" && latest.bull && latest.close > newestZone.top;
    const shiftOfGears = aggressiveFailure && (bullishFailedThroughStop || bearishFailedThroughStop);
    const shiftDirection = bullishFailedThroughStop ? "bearish" : bearishFailedThroughStop ? "bullish" : "neutral";

    return {
      consolidation,
      historyHigh: round(historyHigh),
      historyLow: round(historyLow),
      noHistoricalTarget,
      minorResetReady,
      minorResetText: minorReset.text,
      counterTrend,
      counterBreakReady,
      shiftOfGears,
      shiftDirection,
    };
  }

  function calculateStrategyDecision({ executionCandles, m15Candles, m30Candles, h1Candles, h4Candles, d1Candles }, options = {}) {
    const execution = calculateChamilleiaStatus(executionCandles, options);
    const m15Bias = calculateHtfBias(m15Candles, "15M");
    const m30Bias = calculateHtfBias(m30Candles, "30M");
    const h1Bias = calculateHtfBias(h1Candles, "1H");
    const h4Bias = calculateHtfBias(h4Candles, "4H");
    const d1Bias = calculateHtfBias(d1Candles, "Daily");
    const bias = chooseBias(h4Bias, h1Bias);
    const latest = execution.latest;
    const session = getSessionContext(executionCandles[executionCandles.length - 1].time);
    const hasAlignedTap = Boolean(latest.lastTap && (
      (bias.direction === "bullish" && latest.lastTap.isDemand) ||
      (bias.direction === "bearish" && !latest.lastTap.isDemand)
    ));
    const indicationLevel = bias.direction === "bullish"
      ? h4Bias.indicationLevel ?? h1Bias.indicationLevel
      : bias.direction === "bearish"
        ? h4Bias.indicationLevel ?? h1Bias.indicationLevel
        : null;
    const continuationConfirmed = indicationLevel !== null && (
      (bias.direction === "bullish" && latest.close > indicationLevel) ||
      (bias.direction === "bearish" && latest.close < indicationLevel)
    );
    const rawAlignedBuy = latest.buyTrigger && bias.direction === "bullish";
    const rawAlignedSell = latest.sellTrigger && bias.direction === "bearish";
    const alignedBuy = rawAlignedBuy && continuationConfirmed;
    const alignedSell = rawAlignedSell && continuationConfirmed;
    const continuationBlocked = (rawAlignedBuy || rawAlignedSell) && !continuationConfirmed;
    const conflict = (latest.buyTrigger && bias.direction === "bearish") || (latest.sellTrigger && bias.direction === "bullish");
    const rangeHigh = h1Bias.swingHigh ?? h4Bias.swingHigh;
    const rangeLow = h1Bias.swingLow ?? h4Bias.swingLow;
    const rangeSpan = rangeHigh !== null && rangeLow !== null ? Math.abs(rangeHigh - rangeLow) : null;
    const rangeBuffer = rangeSpan ? Math.max(rangeSpan * 0.12, Math.abs(latest.close) * 0.0004) : null;
    const rangeFallback = bias.direction === "neutral" && rangeHigh !== null && rangeLow !== null && rangeSpan > 0;
    const nearSupport = Boolean(rangeFallback && latest.close <= rangeLow + rangeBuffer);
    const nearResistance = Boolean(rangeFallback && latest.close >= rangeHigh - rangeBuffer);
    const newestZone = execution.zones[0] || null;
    const newestZoneInvalidated = Boolean(newestZone?.invalidated);
    const exceptions = analyzeExceptions({ executionCandles, d1Candles, latest, bias, d1Bias, m15Bias, newestZone });

    let className = "wait";
    let label = "STATUS: WAIT";
    let phase = "INDICATION / CORRECTION";
    let note = bias.direction === "neutral"
      ? "No clean 4H or 1H direction. Wait."
      : `Bias is ${bias.direction.toUpperCase()} from ${bias.source}. Wait for a 5M aligned trigger.`;

    if (exceptions.shiftOfGears) {
      className = "caution";
      label = exceptions.shiftDirection === "bullish" ? "STATUS: WAIT FOR BUY" : "STATUS: WAIT FOR SELL";
      phase = "SHIFT OF GEARS";
      note = "Continuation failed through the stop/pullback extreme. Reset to the opposing ICC indication and wait for correction plus confirmation.";
    } else if (exceptions.consolidation || exceptions.noHistoricalTarget) {
      className = "caution";
      label = "STATUS: WAIT";
      phase = exceptions.consolidation ? "CONSOLIDATION FILTER" : "NO TARGET FILTER";
      note = exceptions.consolidation
        ? "Recent 5M price action is boxed in. Supply/demand trend rules are paused until structure breaks."
        : "Price is near the edge of available daily history, so there is no clean structural target.";
    } else if (continuationBlocked) {
      className = "wait";
      label = bias.direction === "bullish" ? "STATUS: WAIT FOR BUY" : "STATUS: WAIT FOR SELL";
      phase = "CONTINUATION GATE";
      note = "Supply/demand trigger formed, but ICC needs price back across the Primary Indication Level before BUY/SELL.";
    } else if (alignedBuy) {
      className = "buy";
      label = latest.aPlusBuy ? "STATUS: A+ BUY" : "STATUS: BUY";
      phase = "CONTINUATION";
      note = "HTF bias and 5M supply/demand trigger both point up.";
    } else if (alignedSell) {
      className = "sell";
      label = latest.aPlusSell ? "STATUS: A+ SELL" : "STATUS: SELL";
      phase = "CONTINUATION";
      note = "HTF bias and 5M supply/demand trigger both point down.";
    } else if (bias.direction === "neutral" || conflict) {
      className = "no-trade";
      if (nearSupport) {
        className = "wait";
        label = "STATUS: WAIT RANGE BUY";
        phase = "SUPPORT / RESISTANCE";
        note = "Market is ranging. Only consider the support floor with strict 1:1 risk.";
      } else if (nearResistance) {
        className = "wait";
        label = "STATUS: WAIT RANGE SELL";
        phase = "SUPPORT / RESISTANCE";
        note = "Market is ranging. Only consider the resistance ceiling with strict 1:1 risk.";
      } else {
        label = "STATUS: NO TRADE";
        phase = conflict ? "SHIFT OF GEARS CHECK" : "BASELINE SCAN";
        note = conflict
          ? "5M trigger conflicts with higher-timeframe bias. Stand aside."
          : "No clear HTF indication yet. Stand aside.";
      }
    } else if (hasAlignedTap) {
      label = bias.direction === "bullish" ? "STATUS: WAIT FOR BUY" : "STATUS: WAIT FOR SELL";
      phase = "CORRECTION";
      note = "Price has tapped a live zone. Wait for the break-of-candle trigger.";
    } else {
      label = bias.direction === "bullish" ? "STATUS: WAIT FOR BUY" : "STATUS: WAIT FOR SELL";
      phase = "INDICATION";
      note = "Higher timeframe has direction. Wait for a valid 5M zone tap.";
    }

    let confidence = 10;
    if (bias.direction !== "neutral") confidence += 25;
    if (h1Bias.direction === h4Bias.direction && h1Bias.direction !== "neutral") confidence += 20;
    if ((bias.direction === "bullish" && latest.bull) || (bias.direction === "bearish" && latest.bear)) confidence += 15;
    if (hasAlignedTap) confidence += 15;
    if (alignedBuy || alignedSell) confidence += 20;
    if (latest.aPlusBuy || latest.aPlusSell) confidence += 10;
    if (nearSupport || nearResistance) confidence += 10;
    if (exceptions.minorResetReady) confidence += 8;
    if (exceptions.counterBreakReady) confidence += 6;
    if (exceptions.consolidation || exceptions.noHistoricalTarget) confidence = Math.min(confidence, 20);
    if (exceptions.shiftOfGears) confidence = Math.min(confidence, 30);
    if (newestZoneInvalidated) confidence = Math.min(confidence, 35);
    if (conflict) confidence = Math.min(confidence, 25);
    confidence = Math.max(0, Math.min(100, confidence));
    const structureTarget = findStructureTarget(d1Candles, latest.close, bias.direction)
      ?? findStructureTarget(h4Candles, latest.close, bias.direction)
      ?? findStructureTarget(h1Candles, latest.close, bias.direction);
    const rangePlan = calculateRangeRiskPlan(latest, rangeLow, rangeHigh, nearSupport, nearResistance, rangeBuffer);
    const risk = calculateRiskPlan(latest, bias.direction, structureTarget, rangePlan);
    return {
      label,
      note,
      className,
      phase,
      confidence,
      bias,
      d1Bias,
      m30Bias,
      m15Bias,
      h1Bias,
      h4Bias,
      sessionText: session.text,
      sessionOk: session.ok,
      execution,
      checklist: [
        { label: "ICC phase", ok: phase !== "BASELINE SCAN", text: `${phase}: ${note}` },
        { label: "Top-down story", ok: d1Bias.direction === "neutral" || d1Bias.direction === bias.direction || bias.direction === "neutral", text: `Daily ${d1Bias.direction}, 4H ${h4Bias.direction}, 1H ${h1Bias.direction}, 30M ${m30Bias.direction}, 15M ${m15Bias.direction}. Use Daily as context, 4H overrides 1H, then execute on 5M.` },
        { label: "Trading session", ok: session.ok, text: session.text },
        { label: "4H/1H bias", ok: bias.direction !== "neutral", text: `${bias.reason} Indication level: ${indicationLevel ?? "-"}.` },
        { label: "No-trade zone", ok: indicationLevel !== null || rangeHigh === null || rangeLow === null, text: rangeHigh !== null && rangeLow !== null ? `Baseline range is ${rangeLow}-${rangeHigh}. Body-close outside this range creates the Primary Indication Level; wicks alone do not count on HTF.` : "Waiting for enough HTF swing structure to define the baseline no-trade zone. Body-close outside this range creates the Primary Indication Level; wicks alone do not count on HTF." },
        { label: "Primary indication reclaim", ok: continuationConfirmed || bias.direction === "neutral", text: indicationLevel === null ? "No Primary Indication Level yet. Wait for an HTF body-close breakout first." : continuationConfirmed ? `Price is back across ${indicationLevel} in the ${bias.direction} direction.` : `Price has not reclaimed ${indicationLevel}; no continuation entry yet.` },
        { label: "5M structure alignment", ok: (bias.direction === "bullish" && latest.bull) || (bias.direction === "bearish" && latest.bear), text: latest.bull ? "5M market structure is bullish. 5M BOS accepts wick or body breaks." : latest.bear ? "5M market structure is bearish. 5M BOS accepts wick or body breaks." : "5M has no clean market-structure direction." },
        { label: "Zone tap", ok: hasAlignedTap, text: hasAlignedTap ? "Price has tapped a live supply/demand zone aligned with HTF bias." : "Waiting for price to tap the newest valid zone in the HTF direction." },
        { label: "Newest zone only", ok: execution.zones.length <= 1, text: "Only the newest zone from the latest structure break is valid; older zones are ignored." },
        { label: "Entry trigger", ok: alignedBuy || alignedSell, text: alignedBuy || alignedSell ? "Break-of-candle trigger is aligned." : entryModeText(latest, bias.direction, hasAlignedTap) },
        { label: "Stop/exit plan", ok: risk.stopWithinLimit, text: risk.text },
        { label: "Invalidation", ok: !newestZoneInvalidated, text: newestZoneInvalidated ? "Newest zone was body-closed through. Wait for minor structure reset." : "No body-close invalidation on the newest tracked zone." },
        { label: "Minor BOS reset", ok: !newestZoneInvalidated || exceptions.minorResetReady, text: newestZoneInvalidated ? exceptions.minorResetText : "No failed zone needs a minor-BOS reset right now." },
        { label: "Shift of gears", ok: !exceptions.shiftOfGears, text: exceptions.shiftOfGears ? `Continuation failed aggressively through the stop/pullback extreme. Treat this as a fresh ${exceptions.shiftDirection} indication, not an immediate trade.` : "No failed continuation has crossed the stop/pullback extreme." },
        { label: "Range fallback", ok: nearSupport || nearResistance || !rangeFallback, text: rangeFallback ? `Range floor ${rangeLow}, ceiling ${rangeHigh}. ${nearSupport || nearResistance ? "Price is near an edge." : "Price is in the middle, so wait."}` : "Not using support/resistance fallback while HTF bias is active." },
        { label: "Consolidation/ATH filter", ok: !exceptions.consolidation && !exceptions.noHistoricalTarget, text: exceptions.consolidation ? "Random consolidation detected from recent 5M compression. Abort trend scanning until price escapes." : exceptions.noHistoricalTarget ? `Near available daily-history edge (${exceptions.historyLow}-${exceptions.historyHigh}); skip if there is no clean structural target.` : "Not boxed in and not at the available daily-history edge." },
        { label: "Counter trend-line break", ok: !exceptions.counterTrend || exceptions.counterBreakReady, text: exceptions.counterTrend ? (exceptions.counterBreakReady ? "Counter-trend idea has a full structure break in the active direction; keep target strict 1:1." : "Daily context is opposite the active bias. Need a strong body-close break before any counter-trend idea.") : "Not a counter-trend setup against Daily context." },
      ],
      risk,
    };
  }

  global.ChamilleiaEngine = {
    calculateChamilleiaStatus,
    calculateStrategyDecision,
    defaultSettings: DEFAULT_SETTINGS,
  };
})(window);
