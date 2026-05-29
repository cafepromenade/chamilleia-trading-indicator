(function (global) {
  const DEFAULT_SETTINGS = {
    pivotLen: 2,
    trendLen: 8,
    avgRangeLen: 5,
    impulseMult: 0.6,
    maxZones: 6,
    useEmaTrend: true,
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
        note: "Price is mostly going up. Wait for the marked area and trigger.",
        className: "wait",
      };
    }

    if (bear) {
      return {
        label: "STATUS: WAIT FOR SELL",
        note: "Price is mostly going down. Wait for the marked area and trigger.",
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
    const ema = [];
    const ranges = [];
    const zones = [];
    const events = [];
    const alpha = 2 / (settings.trendLen + 1);

    let lastSwingHigh = null;
    let lastSwingLow = null;
    let lastTap = null;
    let latest = null;

    candles.forEach((candle, index) => {
      ranges[index] = candle.high - candle.low;
      ema[index] = index === 0
        ? candle.close
        : candle.close * alpha + ema[index - 1] * (1 - alpha);

      const pivotHigh = getPivot(candles, index, settings.pivotLen, "high", "high");
      const pivotLow = getPivot(candles, index, settings.pivotLen, "low", "low");
      if (pivotHigh) {
        lastSwingHigh = pivotHigh.value;
      }
      if (pivotLow) {
        lastSwingLow = pivotLow.value;
      }

      const previous = candles[index - 1];
      const bull = settings.useEmaTrend
        ? index > 0 && ema[index] > ema[index - 1]
        : candle.close > ema[index];
      const bear = settings.useEmaTrend
        ? index > 0 && ema[index] < ema[index - 1]
        : candle.close < ema[index];

      const avgRange = getRangeAverage(ranges, index, settings.avgRangeLen);
      const strongUp = Boolean(
        avgRange && candle.close > candle.open && ranges[index] > avgRange * settings.impulseMult
      );
      const strongDown = Boolean(
        avgRange && candle.close < candle.open && ranges[index] > avgRange * settings.impulseMult
      );

      const bosUp = Boolean(
        previous && lastSwingHigh !== null && candle.high > lastSwingHigh && previous.high <= lastSwingHigh
      );
      const bosDown = Boolean(
        previous && lastSwingLow !== null && candle.low < lastSwingLow && previous.low >= lastSwingLow
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
        ema: round(ema[index]),
        bull,
        bear,
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

  global.ChamilleiaEngine = {
    calculateChamilleiaStatus,
    defaultSettings: DEFAULT_SETTINGS,
  };
})(window);
