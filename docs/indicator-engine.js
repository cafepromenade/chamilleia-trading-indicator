(function (global) {
  const DEFAULT_SETTINGS = {
    pivotLen: 2,
    avgRangeLen: 5,
    impulseMult: 0.6,
    maxZones: 6,
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
      const bodyBrokeHigh = Boolean(
        previous && lastSwingHigh !== null && candle.close > lastSwingHigh && previous.close <= lastSwingHigh
      );
      const bodyBrokeLow = Boolean(
        previous && lastSwingLow !== null && candle.close < lastSwingLow && previous.close >= lastSwingLow
      );
      if (bodyBrokeHigh) {
        structureDirection = "bullish";
      }
      if (bodyBrokeLow) {
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

      const bosUp = Boolean(
        previous && lastSwingHigh !== null && candle.close > lastSwingHigh && previous.close <= lastSwingHigh
      );
      const bosDown = Boolean(
        previous && lastSwingLow !== null && candle.close < lastSwingLow && previous.close >= lastSwingLow
      );

      if (bosUp && bull && strongUp) {
        const base = findLastOppositeCandle(candles, index, true);
        if (base) {
          zones.unshift({ ...base, isDemand: true, invalidated: false, tapped: false, createdAt: index });
          events.push({ type: "BOS up", bar: index });
        }
      }

      if (bosDown && bear && strongDown) {
        const base = findLastOppositeCandle(candles, index, false);
        if (base) {
          zones.unshift({ ...base, isDemand: false, invalidated: false, tapped: false, createdAt: index });
          events.push({ type: "BOS down", bar: index });
        }
      }

      while (zones.length > settings.maxZones) {
        zones.pop();
      }

      zones.forEach((zone) => {
        if (zone.invalidated) {
          return;
        }

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
        }
      });

      const demandTapClose = Boolean(
        previous && lastTap && lastTap.isDemand && previous.low <= lastTap.top && previous.low >= lastTap.bot
      );
      const supplyTapClose = Boolean(
        previous && lastTap && !lastTap.isDemand && previous.high <= lastTap.top && previous.high >= lastTap.bot
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

  function calculateRiskPlan(latest, direction) {
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
        text: "No live entry plan until price taps a valid zone and gives a trigger.",
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
        text: "Risk cannot be calculated from the current live zone.",
      };
    }

    const targetOne = direction === "bullish" ? entry + risk : entry - risk;
    const targetTwo = direction === "bullish" ? entry + risk * 2 : entry - risk * 2;
    return {
      entry: round(entry),
      stop: round(stop),
      risk: round(risk),
      targetOne: round(targetOne),
      targetTwo: round(targetTwo),
      text: "Stop is outside the tapped zone. TP1 is 1:1, TP2 is 1:2.",
    };
  }

  function calculateStrategyDecision({ executionCandles, h1Candles, h4Candles }, options = {}) {
    const execution = calculateChamilleiaStatus(executionCandles, options);
    const h1Bias = calculateHtfBias(h1Candles, "1H");
    const h4Bias = calculateHtfBias(h4Candles, "4H");
    const bias = chooseBias(h4Bias, h1Bias);
    const latest = execution.latest;
    const alignedBuy = latest.buyTrigger && bias.direction === "bullish";
    const alignedSell = latest.sellTrigger && bias.direction === "bearish";
    const conflict = (latest.buyTrigger && bias.direction === "bearish") || (latest.sellTrigger && bias.direction === "bullish");
    const hasAlignedTap = Boolean(latest.lastTap && (
      (bias.direction === "bullish" && latest.lastTap.isDemand) ||
      (bias.direction === "bearish" && !latest.lastTap.isDemand)
    ));
    const rangeHigh = h1Bias.swingHigh ?? h4Bias.swingHigh;
    const rangeLow = h1Bias.swingLow ?? h4Bias.swingLow;
    const rangeSpan = rangeHigh !== null && rangeLow !== null ? Math.abs(rangeHigh - rangeLow) : null;
    const rangeBuffer = rangeSpan ? Math.max(rangeSpan * 0.12, Math.abs(latest.close) * 0.0004) : null;
    const rangeFallback = bias.direction === "neutral" && rangeHigh !== null && rangeLow !== null && rangeSpan > 0;
    const nearSupport = Boolean(rangeFallback && latest.close <= rangeLow + rangeBuffer);
    const nearResistance = Boolean(rangeFallback && latest.close >= rangeHigh - rangeBuffer);
    const newestZoneInvalidated = Boolean(execution.zones[0]?.invalidated);

    let className = "wait";
    let label = "STATUS: WAIT";
    let phase = "INDICATION / CORRECTION";
    let note = bias.direction === "neutral"
      ? "No clean 4H or 1H direction. Wait."
      : `Bias is ${bias.direction.toUpperCase()} from ${bias.source}. Wait for a 5M aligned trigger.`;

    if (alignedBuy) {
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
    if (newestZoneInvalidated) confidence = Math.min(confidence, 35);
    if (conflict) confidence = Math.min(confidence, 25);
    confidence = Math.max(0, Math.min(100, confidence));

    return {
      label,
      note,
      className,
      phase,
      confidence,
      bias,
      h1Bias,
      h4Bias,
      execution,
      checklist: [
        { label: "ICC phase", ok: phase !== "BASELINE SCAN", text: `${phase}: ${note}` },
        { label: "4H/1H bias", ok: bias.direction !== "neutral", text: `${bias.reason} Indication level: ${bias.direction === "bullish" ? h4Bias.indicationLevel ?? h1Bias.indicationLevel ?? "-" : bias.direction === "bearish" ? h4Bias.indicationLevel ?? h1Bias.indicationLevel ?? "-" : "-"}.` },
        { label: "5M structure alignment", ok: (bias.direction === "bullish" && latest.bull) || (bias.direction === "bearish" && latest.bear), text: latest.bull ? "5M market structure is bullish." : latest.bear ? "5M market structure is bearish." : "5M has no clean market-structure direction." },
        { label: "Zone tap", ok: hasAlignedTap, text: hasAlignedTap ? "Price has tapped a live supply/demand zone aligned with HTF bias." : "Waiting for price to tap the newest valid zone in the HTF direction." },
        { label: "Entry trigger", ok: alignedBuy || alignedSell, text: alignedBuy || alignedSell ? "Break-of-candle trigger is aligned." : "No aligned break-of-candle trigger yet." },
        { label: "Invalidation", ok: !newestZoneInvalidated, text: newestZoneInvalidated ? "Newest zone was body-closed through. Wait for minor structure reset." : "No body-close invalidation on the newest tracked zone." },
        { label: "Range fallback", ok: nearSupport || nearResistance || !rangeFallback, text: rangeFallback ? `Range floor ${rangeLow}, ceiling ${rangeHigh}. ${nearSupport || nearResistance ? "Price is near an edge." : "Price is in the middle, so wait."}` : "Not using support/resistance fallback while HTF bias is active." },
      ],
      risk: calculateRiskPlan(latest, bias.direction),
    };
  }

  global.ChamilleiaEngine = {
    calculateChamilleiaStatus,
    calculateStrategyDecision,
    defaultSettings: DEFAULT_SETTINGS,
  };
})(window);
