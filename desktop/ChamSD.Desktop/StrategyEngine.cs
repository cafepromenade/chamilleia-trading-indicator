namespace ChamSD_Desktop;

public sealed class StrategyEngine
{
    private const int PivotLen = 2;
    private const int AvgRangeLen = 5;
    private const double ImpulseMult = 0.6;
    private const int MaxZones = 1;

    public StrategyDecision CalculateStrategyDecision(
        IReadOnlyList<MarketCandle> executionCandles,
        IReadOnlyList<MarketCandle> m15Candles,
        IReadOnlyList<MarketCandle> m30Candles,
        IReadOnlyList<MarketCandle> h1Candles,
        IReadOnlyList<MarketCandle> h4Candles,
        IReadOnlyList<MarketCandle> d1Candles)
    {
        if (executionCandles.Count < 30 || m15Candles.Count < 30 || m30Candles.Count < 30 || h1Candles.Count < 30 || h4Candles.Count < 30 || d1Candles.Count < 30)
        {
            throw new InvalidOperationException("At least 30 live candles are required for each timeframe.");
        }

        var execution = CalculateChamilleiaStatus(executionCandles);
        var m15Bias = CalculateHtfBias(m15Candles, "15M");
        var m30Bias = CalculateHtfBias(m30Candles, "30M");
        var h1Bias = CalculateHtfBias(h1Candles, "1H");
        var h4Bias = CalculateHtfBias(h4Candles, "4H");
        var d1Bias = CalculateHtfBias(d1Candles, "Daily");
        var bias = ChooseBias(h4Bias, h1Bias);
        var session = GetSessionContext(executionCandles[^1].Time);
        var latest = execution.Latest;
        var alignedBuy = latest.BuyTrigger && bias.Direction == "bullish";
        var alignedSell = latest.SellTrigger && bias.Direction == "bearish";
        var conflict = latest.BuyTrigger && bias.Direction == "bearish" || latest.SellTrigger && bias.Direction == "bullish";
        var hasAlignedTap = latest.LastTap is not null && (
            bias.Direction == "bullish" && latest.LastTap.IsDemand ||
            bias.Direction == "bearish" && !latest.LastTap.IsDemand);
        var rangeHigh = h1Bias.SwingHigh ?? h4Bias.SwingHigh;
        var rangeLow = h1Bias.SwingLow ?? h4Bias.SwingLow;
        var rangeSpan = rangeHigh is not null && rangeLow is not null ? Math.Abs(rangeHigh.Value - rangeLow.Value) : (double?)null;
        var rangeBuffer = rangeSpan is not null ? Math.Max(rangeSpan.Value * 0.12, Math.Abs(latest.Close) * 0.0004) : (double?)null;
        var rangeFallback = bias.Direction == "neutral" && rangeHigh is not null && rangeLow is not null && rangeSpan > 0;
        var nearSupport = rangeFallback && rangeBuffer is not null && latest.Close <= rangeLow + rangeBuffer;
        var nearResistance = rangeFallback && rangeBuffer is not null && latest.Close >= rangeHigh - rangeBuffer;
        var newestZoneInvalidated = execution.Zones.FirstOrDefault()?.Invalidated == true;
        var exceptions = AnalyzeExceptions(executionCandles, d1Candles, latest, bias, d1Bias, m15Bias, newestZoneInvalidated);

        var className = "wait";
        var label = "STATUS: WAIT";
        var phase = "INDICATION / CORRECTION";
        var note = bias.Direction == "neutral"
            ? "No clean 4H or 1H direction. Wait."
            : $"Bias is {bias.Direction.ToUpperInvariant()} from {bias.Source}. Wait for a 5M aligned trigger.";

        if (exceptions.Consolidation || exceptions.NoHistoricalTarget)
        {
            className = "caution";
            label = "STATUS: WAIT";
            phase = exceptions.Consolidation ? "CONSOLIDATION FILTER" : "NO TARGET FILTER";
            note = exceptions.Consolidation
                ? "Recent 5M price action is boxed in. Supply/demand trend rules are paused until structure breaks."
                : "Price is near the edge of available daily history, so there is no clean structural target.";
        }
        else if (alignedBuy)
        {
            className = "buy";
            label = latest.APlusBuy ? "STATUS: A+ BUY" : "STATUS: BUY";
            phase = "CONTINUATION";
            note = "HTF bias and 5M supply/demand trigger both point up.";
        }
        else if (alignedSell)
        {
            className = "sell";
            label = latest.APlusSell ? "STATUS: A+ SELL" : "STATUS: SELL";
            phase = "CONTINUATION";
            note = "HTF bias and 5M supply/demand trigger both point down.";
        }
        else if (bias.Direction == "neutral" || conflict)
        {
            className = "no-trade";
            if (nearSupport)
            {
                className = "wait";
                label = "STATUS: WAIT RANGE BUY";
                phase = "SUPPORT / RESISTANCE";
                note = "Market is ranging. Only consider the support floor with strict 1:1 risk.";
            }
            else if (nearResistance)
            {
                className = "wait";
                label = "STATUS: WAIT RANGE SELL";
                phase = "SUPPORT / RESISTANCE";
                note = "Market is ranging. Only consider the resistance ceiling with strict 1:1 risk.";
            }
            else
            {
                label = "STATUS: NO TRADE";
                phase = conflict ? "SHIFT OF GEARS CHECK" : "BASELINE SCAN";
                note = conflict
                    ? "5M trigger conflicts with higher-timeframe bias. Stand aside."
                    : "No clear HTF indication yet. Stand aside.";
            }
        }
        else if (hasAlignedTap)
        {
            label = bias.Direction == "bullish" ? "STATUS: WAIT FOR BUY" : "STATUS: WAIT FOR SELL";
            phase = "CORRECTION";
            note = "Price has tapped a live zone. Wait for the break-of-candle trigger.";
        }
        else
        {
            label = bias.Direction == "bullish" ? "STATUS: WAIT FOR BUY" : "STATUS: WAIT FOR SELL";
            phase = "INDICATION";
            note = "Higher timeframe has direction. Wait for a valid 5M zone tap.";
        }

        var confidence = 10;
        if (bias.Direction != "neutral") confidence += 25;
        if (h1Bias.Direction == h4Bias.Direction && h1Bias.Direction != "neutral") confidence += 20;
        if (bias.Direction == "bullish" && latest.Bull || bias.Direction == "bearish" && latest.Bear) confidence += 15;
        if (hasAlignedTap) confidence += 15;
        if (alignedBuy || alignedSell) confidence += 20;
        if (latest.APlusBuy || latest.APlusSell) confidence += 10;
        if (nearSupport || nearResistance) confidence += 10;
        if (exceptions.MinorResetReady) confidence += 8;
        if (exceptions.CounterBreakReady) confidence += 6;
        if (exceptions.Consolidation || exceptions.NoHistoricalTarget) confidence = Math.Min(confidence, 20);
        if (newestZoneInvalidated) confidence = Math.Min(confidence, 35);
        if (conflict) confidence = Math.Min(confidence, 25);
        confidence = Math.Clamp(confidence, 0, 100);

        var indicationLevel = bias.Direction == "bullish"
            ? h4Bias.IndicationLevel ?? h1Bias.IndicationLevel
            : bias.Direction == "bearish"
                ? h4Bias.IndicationLevel ?? h1Bias.IndicationLevel
                : null;

        var riskPlan = CalculateRiskPlan(latest, bias.Direction);

        return new StrategyDecision
        {
            Label = label,
            Note = note,
            ClassName = className,
            Phase = phase,
            Confidence = confidence,
            Bias = bias,
            D1Bias = d1Bias,
            M30Bias = m30Bias,
            M15Bias = m15Bias,
            H1Bias = h1Bias,
            H4Bias = h4Bias,
            SessionText = session.Text,
            SessionOk = session.Ok,
            Execution = execution,
            Checklist = new[]
            {
                new ChecklistItem { Label = "ICC phase", Ok = phase != "BASELINE SCAN", Text = $"{phase}: {note}" },
                new ChecklistItem
                {
                    Label = "Top-down story",
                    Ok = d1Bias.Direction == "neutral" || d1Bias.Direction == bias.Direction || bias.Direction == "neutral",
                    Text = $"Daily {d1Bias.Direction}, 4H {h4Bias.Direction}, 1H {h1Bias.Direction}, 30M {m30Bias.Direction}, 15M {m15Bias.Direction}. Use Daily as context, 4H overrides 1H, then execute on 5M.",
                },
                new ChecklistItem { Label = "Trading session", Ok = session.Ok, Text = session.Text },
                new ChecklistItem { Label = "4H/1H bias", Ok = bias.Direction != "neutral", Text = $"{bias.Reason} Indication level: {FormatNullable(indicationLevel)}." },
                new ChecklistItem
                {
                    Label = "5M structure alignment",
                    Ok = bias.Direction == "bullish" && latest.Bull || bias.Direction == "bearish" && latest.Bear,
                    Text = latest.Bull ? "5M market structure is bullish. 5M BOS accepts wick or body breaks." : latest.Bear ? "5M market structure is bearish. 5M BOS accepts wick or body breaks." : "5M has no clean market-structure direction.",
                },
                new ChecklistItem
                {
                    Label = "Zone tap",
                    Ok = hasAlignedTap,
                    Text = hasAlignedTap
                        ? "Price has tapped a live supply/demand zone aligned with HTF bias."
                        : "Waiting for price to tap the newest valid zone in the HTF direction.",
                },
                new ChecklistItem
                {
                    Label = "Newest zone only",
                    Ok = execution.Zones.Count <= 1,
                    Text = "Only the newest zone from the latest structure break is valid; older zones are ignored.",
                },
                new ChecklistItem
                {
                    Label = "Entry trigger",
                    Ok = alignedBuy || alignedSell,
                    Text = alignedBuy || alignedSell ? "Break-of-candle trigger is aligned." : EntryModeText(latest, bias.Direction, hasAlignedTap),
                },
                new ChecklistItem { Label = "Stop/exit plan", Ok = riskPlan.StopWithinLimit, Text = riskPlan.Text },
                new ChecklistItem
                {
                    Label = "Invalidation",
                    Ok = !newestZoneInvalidated,
                    Text = newestZoneInvalidated ? "Newest zone was body-closed through. Wait for minor structure reset." : "No body-close invalidation on the newest tracked zone.",
                },
                new ChecklistItem
                {
                    Label = "Minor BOS reset",
                    Ok = !newestZoneInvalidated || exceptions.MinorResetReady,
                    Text = newestZoneInvalidated
                        ? exceptions.MinorResetReady ? "Zone failed, but minor structure is rebuilding in the HTF direction." : "Do not jump to the next zone. Wait for a stair-step minor break of structure."
                        : "No failed zone needs a minor-BOS reset right now.",
                },
                new ChecklistItem
                {
                    Label = "Range fallback",
                    Ok = nearSupport || nearResistance || !rangeFallback,
                    Text = rangeFallback ? $"Range floor {FormatNullable(rangeLow)}, ceiling {FormatNullable(rangeHigh)}. {(nearSupport || nearResistance ? "Price is near an edge." : "Price is in the middle, so wait.")}" : "Not using support/resistance fallback while HTF bias is active.",
                },
                new ChecklistItem
                {
                    Label = "Consolidation/ATH filter",
                    Ok = !exceptions.Consolidation && !exceptions.NoHistoricalTarget,
                    Text = exceptions.Consolidation
                        ? "Random consolidation detected from recent 5M compression. Abort trend scanning until price escapes."
                        : exceptions.NoHistoricalTarget ? $"Near available daily-history edge ({FormatNullable(exceptions.HistoryLow)}-{FormatNullable(exceptions.HistoryHigh)}); skip if there is no clean structural target." : "Not boxed in and not at the available daily-history edge.",
                },
                new ChecklistItem
                {
                    Label = "Counter trend-line break",
                    Ok = !exceptions.CounterTrend || exceptions.CounterBreakReady,
                    Text = exceptions.CounterTrend
                        ? exceptions.CounterBreakReady ? "Counter-trend idea has a full structure break in the active direction; keep target strict 1:1." : "Daily context is opposite the active bias. Need a strong body-close break before any counter-trend idea."
                        : "Not a counter-trend setup against Daily context.",
                },
            },
            Risk = riskPlan,
        };
    }

    private static ChamilleiaStatus CalculateChamilleiaStatus(IReadOnlyList<MarketCandle> candles)
    {
        var ranges = new double[candles.Count];
        var zones = new List<WorkingZone>();
        double? priorSwingHigh = null;
        double? priorSwingLow = null;
        double? lastSwingHigh = null;
        double? lastSwingLow = null;
        var structureDirection = "neutral";
        Tap? lastTap = null;
        ChamilleiaLatest? latest = null;

        for (var index = 0; index < candles.Count; index++)
        {
            var candle = candles[index];
            ranges[index] = candle.High - candle.Low;

            var pivotHigh = GetPivot(candles, index, PivotLen, highMode: true);
            var pivotLow = GetPivot(candles, index, PivotLen, highMode: false);
            if (pivotHigh is not null)
            {
                if (lastSwingHigh is not null && pivotHigh.Value > lastSwingHigh)
                {
                    structureDirection = "bullish";
                }

                if (lastSwingHigh is not null && pivotHigh.Value < lastSwingHigh && lastSwingLow is not null && priorSwingLow is not null && lastSwingLow < priorSwingLow)
                {
                    structureDirection = "bearish";
                }

                priorSwingHigh = lastSwingHigh;
                lastSwingHigh = pivotHigh.Value;
            }

            if (pivotLow is not null)
            {
                if (lastSwingLow is not null && pivotLow.Value < lastSwingLow)
                {
                    structureDirection = "bearish";
                }

                if (lastSwingLow is not null && pivotLow.Value > lastSwingLow && lastSwingHigh is not null && priorSwingHigh is not null && lastSwingHigh > priorSwingHigh)
                {
                    structureDirection = "bullish";
                }

                priorSwingLow = lastSwingLow;
                lastSwingLow = pivotLow.Value;
            }

            var previous = index > 0 ? candles[index - 1] : null;
            var brokeHigh = previous is not null && lastSwingHigh is not null && (candle.High > lastSwingHigh || candle.Close > lastSwingHigh) && previous.High <= lastSwingHigh;
            var brokeLow = previous is not null && lastSwingLow is not null && (candle.Low < lastSwingLow || candle.Close < lastSwingLow) && previous.Low >= lastSwingLow;
            if (brokeHigh)
            {
                structureDirection = "bullish";
            }

            if (brokeLow)
            {
                structureDirection = "bearish";
            }

            var bull = structureDirection == "bullish";
            var bear = structureDirection == "bearish";
            var avgRange = GetRangeAverage(ranges, index, AvgRangeLen);
            var strongUp = avgRange is not null && candle.Close > candle.Open && ranges[index] > avgRange * ImpulseMult;
            var strongDown = avgRange is not null && candle.Close < candle.Open && ranges[index] > avgRange * ImpulseMult;
            var bosUp = brokeHigh;
            var bosDown = brokeLow;

            if (bosUp && bull && strongUp)
            {
                var baseZone = FindLastOppositeCandle(candles, index, wantRed: true);
                if (baseZone is not null)
                {
                    zones.Clear();
                    lastTap = null;
                    zones.Insert(0, baseZone with { IsDemand = true, CreatedAt = index });
                }
            }

            if (bosDown && bear && strongDown)
            {
                var baseZone = FindLastOppositeCandle(candles, index, wantRed: false);
                if (baseZone is not null)
                {
                    zones.Clear();
                    lastTap = null;
                    zones.Insert(0, baseZone with { IsDemand = false, CreatedAt = index });
                }
            }

            while (zones.Count > MaxZones)
            {
                zones.RemoveAt(zones.Count - 1);
            }

            var zone = zones.FirstOrDefault();
            if (zone is not null && !zone.Invalidated)
            {
                var tappedNow = candle.Low <= zone.Top && candle.High >= zone.Bot;
                if (tappedNow && !zone.Tapped && index > zone.CreatedAt)
                {
                    zone.Tapped = true;
                    lastTap = new Tap(zone.Top, zone.Bot, zone.IsDemand, index);
                }

                var bodyThrough = zone.IsDemand ? candle.Close < zone.Bot : candle.Close > zone.Top;
                if (bodyThrough)
                {
                    zone.Invalidated = true;
                    if (lastTap is not null && lastTap.Top == zone.Top && lastTap.Bot == zone.Bot && lastTap.IsDemand == zone.IsDemand)
                    {
                        lastTap = null;
                    }
                }
            }

            var demandTapClose = previous is not null && lastTap is not null && lastTap.IsDemand && previous.Low <= lastTap.Top && previous.High >= lastTap.Bot;
            var supplyTapClose = previous is not null && lastTap is not null && !lastTap.IsDemand && previous.Low <= lastTap.Top && previous.High >= lastTap.Bot;
            var buyTrigger = demandTapClose && candle.High > previous!.High && bull;
            var sellTrigger = supplyTapClose && candle.Low < previous!.Low && bear;
            var aPlusBuy = buyTrigger && lastTap is not null && candle.Open >= lastTap.Top;
            var aPlusSell = sellTrigger && lastTap is not null && candle.Open <= lastTap.Bot;
            var baseStatus = StatusForBar(buyTrigger, sellTrigger, aPlusBuy, aPlusSell, bull, bear);

            latest = new ChamilleiaLatest
            {
                Label = baseStatus.Label,
                Note = baseStatus.Note,
                ClassName = baseStatus.ClassName,
                Bar = index,
                Close = candle.Close,
                Bull = bull,
                Bear = bear,
                BuyTrigger = buyTrigger,
                SellTrigger = sellTrigger,
                APlusBuy = aPlusBuy,
                APlusSell = aPlusSell,
                LastSwingHigh = Round(lastSwingHigh),
                LastSwingLow = Round(lastSwingLow),
                LastTap = lastTap,
            };
        }

        return new ChamilleiaStatus
        {
            Latest = latest ?? new ChamilleiaLatest(),
            Candles = candles,
            Zones = zones.Select(zone => new Zone(Round(zone.Top) ?? zone.Top, Round(zone.Bot) ?? zone.Bot, zone.IsDemand, zone.Invalidated, zone.Tapped, zone.CreatedAt)).ToList(),
        };
    }

    private static HtfBias CalculateHtfBias(IReadOnlyList<MarketCandle> candles, string label)
    {
        var latest = candles[^1];
        var structure = FindBodyStructure(candles, 3);
        var brokeHigh = structure.SwingHigh is not null && latest.Close > structure.SwingHigh.Price;
        var brokeLow = structure.SwingLow is not null && latest.Close < structure.SwingLow.Price;
        var higherHigh = structure.SwingHigh is not null && structure.PriorSwingHigh is not null && structure.SwingHigh.Price > structure.PriorSwingHigh.Price;
        var higherLow = structure.SwingLow is not null && structure.PriorSwingLow is not null && structure.SwingLow.Price > structure.PriorSwingLow.Price;
        var lowerHigh = structure.SwingHigh is not null && structure.PriorSwingHigh is not null && structure.SwingHigh.Price < structure.PriorSwingHigh.Price;
        var lowerLow = structure.SwingLow is not null && structure.PriorSwingLow is not null && structure.SwingLow.Price < structure.PriorSwingLow.Price;

        var direction = "neutral";
        var reason = "No clean body-close break or market-structure sequence.";
        if (brokeHigh || !brokeLow && higherHigh && higherLow)
        {
            direction = "bullish";
            reason = brokeHigh
                ? $"{label} body closed above its latest structural high."
                : $"{label} has a higher high and higher low structure.";
        }

        if (brokeLow || !brokeHigh && lowerHigh && lowerLow)
        {
            direction = "bearish";
            reason = brokeLow
                ? $"{label} body closed below its latest structural low."
                : $"{label} has a lower high and lower low structure.";
        }

        return new HtfBias
        {
            Label = label,
            Direction = direction,
            Reason = reason,
            Close = latest.Close,
            SwingHigh = Round(structure.SwingHigh?.Price),
            SwingLow = Round(structure.SwingLow?.Price),
            IndicationLevel = direction == "bullish"
                ? Round(structure.SwingHigh?.Price)
                : direction == "bearish"
                    ? Round(structure.SwingLow?.Price)
                    : null,
        };
    }

    private static BiasChoice ChooseBias(HtfBias h4Bias, HtfBias h1Bias)
    {
        if (h4Bias.Direction != "neutral")
        {
            return new BiasChoice
            {
                Direction = h4Bias.Direction,
                Source = "4H",
                Reason = $"4H overrides 1H. {h4Bias.Reason}",
            };
        }

        return new BiasChoice
        {
            Direction = h1Bias.Direction,
            Source = "1H",
            Reason = h1Bias.Reason,
        };
    }

    private static RiskPlan CalculateRiskPlan(ChamilleiaLatest latest, string direction)
    {
        var tapMatchesDirection = latest.LastTap is not null && (
            direction == "bullish" && latest.LastTap.IsDemand ||
            direction == "bearish" && !latest.LastTap.IsDemand);

        if (!tapMatchesDirection || direction == "neutral")
        {
            return new RiskPlan
            {
                EntryMode = "WAIT",
                Text = "No live entry plan until price taps a valid zone and gives a trigger. If market stays sideways, use support/resistance only with strict 1:1.",
            };
        }

        var entry = latest.Close;
        var stop = direction == "bullish" ? latest.LastTap!.Bot : latest.LastTap!.Top;
        var risk = Math.Abs(entry - stop);
        var stopIsValid = direction == "bullish" ? stop < entry : stop > entry;
        if (!double.IsFinite(risk) || risk == 0 || !stopIsValid)
        {
            return new RiskPlan
            {
                Entry = Round(entry),
                Stop = Round(stop),
                EntryMode = "ZONE TAPPED",
                Text = "Risk cannot be calculated from the current live zone.",
            };
        }

        var stopWithinLimit = risk <= 50;
        var stopText = stopWithinLimit
            ? "Stop size is inside the 50-point guide."
            : "Stop is larger than the 50-point guide; use the entering candle or skip.";

        return new RiskPlan
        {
            Entry = Round(entry),
            Stop = Round(stop),
            Risk = Round(risk),
            TargetOne = Round(direction == "bullish" ? entry + risk : entry - risk),
            TargetTwo = Round(direction == "bullish" ? entry + risk * 2 : entry - risk * 2),
            EntryMode = "BREAK OF CANDLE",
            StopWithinLimit = stopWithinLimit,
            Text = $"Stop is outside the tapped zone. {stopText} TP1 is 1:1: secure partials and move stop to break-even; TP2 is the runner toward 1:2 or structure.",
        };
    }

    private static string EntryModeText(ChamilleiaLatest latest, string direction, bool hasAlignedTap)
    {
        if (!hasAlignedTap)
        {
            return "No entry mode yet. Wait for the newest supply/demand zone tap.";
        }

        if (latest.LastTap is null)
        {
            return "Zone state is not ready.";
        }

        var conservativeReady = direction == "bullish"
            ? latest.Close > latest.LastTap.Top
            : direction == "bearish" && latest.Close < latest.LastTap.Bot;
        if (conservativeReady)
        {
            return "Conservative entry can be watched: price closed out of the zone. Break-of-candle confirmation is still preferred.";
        }

        return "Aggressive entry would mean pressing inside the zone; safest rule waits for candle close and next-candle break.";
    }

    private static ExceptionRead AnalyzeExceptions(
        IReadOnlyList<MarketCandle> executionCandles,
        IReadOnlyList<MarketCandle> d1Candles,
        ChamilleiaLatest latest,
        BiasChoice bias,
        HtfBias d1Bias,
        HtfBias m15Bias,
        bool newestZoneInvalidated)
    {
        var recent = executionCandles.TakeLast(24).ToList();
        var recentHigh = recent.Max(candle => candle.High);
        var recentLow = recent.Min(candle => candle.Low);
        var recentSpan = recentHigh - recentLow;
        var avgRange = recent.Average(candle => candle.High - candle.Low);
        var consolidation = recent.Count >= 20 && recentSpan < avgRange * 5 && !latest.BuyTrigger && !latest.SellTrigger;
        var historyHigh = d1Candles.Max(candle => candle.High);
        var historyLow = d1Candles.Min(candle => candle.Low);
        var historyBuffer = Math.Max((historyHigh - historyLow) * 0.015, Math.Abs(latest.Close) * 0.0008);
        var noUpsideTarget = bias.Direction == "bullish" && latest.Close >= historyHigh - historyBuffer;
        var noDownsideTarget = bias.Direction == "bearish" && latest.Close <= historyLow + historyBuffer;
        var noHistoricalTarget = noUpsideTarget || noDownsideTarget;
        var minorResetReady = newestZoneInvalidated && (
            bias.Direction == "bullish" && latest.Bull && m15Bias.Direction != "bearish" ||
            bias.Direction == "bearish" && latest.Bear && m15Bias.Direction != "bullish");
        var counterTrend = d1Bias.Direction != "neutral" && bias.Direction != "neutral" && d1Bias.Direction != bias.Direction;
        var counterBreakReady = counterTrend && (
            bias.Direction == "bullish" && latest.Bull && m15Bias.Direction == "bullish" ||
            bias.Direction == "bearish" && latest.Bear && m15Bias.Direction == "bearish");

        return new ExceptionRead(
            consolidation,
            Round(historyHigh),
            Round(historyLow),
            noHistoricalTarget,
            minorResetReady,
            counterTrend,
            counterBreakReady);
    }

    private static (bool Ok, string Text) GetSessionContext(DateTimeOffset candleTime)
    {
        TimeZoneInfo eastern;
        try
        {
            eastern = TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time");
        }
        catch (TimeZoneNotFoundException)
        {
            eastern = TimeZoneInfo.Utc;
        }

        var local = TimeZoneInfo.ConvertTime(candleTime, eastern);
        var tod = local.TimeOfDay;
        var london = tod >= new TimeSpan(3, 0, 0) && tod <= new TimeSpan(12, 0, 0);
        var ny = tod >= new TimeSpan(9, 30, 0) && tod <= new TimeSpan(16, 0, 0);
        var ok = london || ny;
        var name = london && ny ? "London/New York overlap" : london ? "London session" : ny ? "New York session" : "outside main sessions";
        return (ok, $"{local:HH:mm} ET is {name}. Doc rule prefers London or New York 09:30 ET volume.");
    }

    private static (string Label, string Note, string ClassName) StatusForBar(bool buyTrigger, bool sellTrigger, bool aPlusBuy, bool aPlusSell, bool bull, bool bear)
    {
        if (buyTrigger)
        {
            return (
                aPlusBuy ? "STATUS: A+ BUY" : "STATUS: BUY",
                aPlusBuy ? "The runner found an extra clean Buy idea." : "The runner found a Buy idea.",
                "buy");
        }

        if (sellTrigger)
        {
            return (
                aPlusSell ? "STATUS: A+ SELL" : "STATUS: SELL",
                aPlusSell ? "The runner found an extra clean Sell idea." : "The runner found a Sell idea.",
                "sell");
        }

        if (bull)
        {
            return ("STATUS: WAIT FOR BUY", "Market structure is bullish. Wait for the marked area and trigger.", "wait");
        }

        if (bear)
        {
            return ("STATUS: WAIT FOR SELL", "Market structure is bearish. Wait for the marked area and trigger.", "wait");
        }

        return ("STATUS: NO TRADE", "No clear direction. The runner says do nothing.", "no-trade");
    }

    private static double? GetRangeAverage(IReadOnlyList<double> ranges, int index, int length)
    {
        if (index < length - 1)
        {
            return null;
        }

        var total = 0.0;
        for (var i = index - length + 1; i <= index; i++)
        {
            total += ranges[i];
        }

        return total / length;
    }

    private static Pivot? GetPivot(IReadOnlyList<MarketCandle> candles, int index, int pivotLen, bool highMode)
    {
        var pivotIndex = index - pivotLen;
        if (pivotIndex < pivotLen)
        {
            return null;
        }

        var value = highMode ? candles[pivotIndex].High : candles[pivotIndex].Low;
        for (var i = pivotIndex - pivotLen; i <= pivotIndex + pivotLen; i++)
        {
            if (i == pivotIndex)
            {
                continue;
            }

            var compare = highMode ? candles[i].High : candles[i].Low;
            if (highMode && value <= compare || !highMode && value >= compare)
            {
                return null;
            }
        }

        return new Pivot(value, pivotIndex);
    }

    private static WorkingZone? FindLastOppositeCandle(IReadOnlyList<MarketCandle> candles, int index, bool wantRed)
    {
        for (var offset = 1; offset <= 10; offset++)
        {
            var sourceIndex = index - offset;
            if (sourceIndex < 0)
            {
                break;
            }

            var candle = candles[sourceIndex];
            var isRed = candle.Close < candle.Open;
            var isGreen = candle.Close > candle.Open;
            if (wantRed && isRed || !wantRed && isGreen)
            {
                return new WorkingZone
                {
                    SourceIndex = sourceIndex,
                    Top = candle.High,
                    Bot = candle.Low,
                };
            }
        }

        return null;
    }

    private static BodyStructure FindBodyStructure(IReadOnlyList<MarketCandle> candles, int pivotLen)
    {
        BodySwing? swingHigh = null;
        BodySwing? swingLow = null;
        BodySwing? priorSwingHigh = null;
        BodySwing? priorSwingLow = null;

        for (var index = pivotLen; index < candles.Count - pivotLen; index++)
        {
            var bodyHigh = Math.Max(candles[index].Open, candles[index].Close);
            var bodyLow = Math.Min(candles[index].Open, candles[index].Close);
            var isHigh = true;
            var isLow = true;

            for (var look = index - pivotLen; look <= index + pivotLen; look++)
            {
                if (look == index)
                {
                    continue;
                }

                var compareHigh = Math.Max(candles[look].Open, candles[look].Close);
                var compareLow = Math.Min(candles[look].Open, candles[look].Close);
                if (bodyHigh <= compareHigh) isHigh = false;
                if (bodyLow >= compareLow) isLow = false;
            }

            if (isHigh)
            {
                priorSwingHigh = swingHigh;
                swingHigh = new BodySwing(bodyHigh, index);
            }

            if (isLow)
            {
                priorSwingLow = swingLow;
                swingLow = new BodySwing(bodyLow, index);
            }
        }

        return new BodyStructure(swingHigh, swingLow, priorSwingHigh, priorSwingLow);
    }

    private static double? Round(double? value, int places = 2)
    {
        return value is null || !double.IsFinite(value.Value) ? null : Math.Round(value.Value, places);
    }

    private static string FormatNullable(double? value)
    {
        return value is null ? "-" : value.Value.ToString("0.##");
    }

    private sealed record Pivot(double Value, int Index);

    private sealed record BodySwing(double Price, int Bar);

    private sealed record BodyStructure(BodySwing? SwingHigh, BodySwing? SwingLow, BodySwing? PriorSwingHigh, BodySwing? PriorSwingLow);

    private sealed record ExceptionRead(
        bool Consolidation,
        double? HistoryHigh,
        double? HistoryLow,
        bool NoHistoricalTarget,
        bool MinorResetReady,
        bool CounterTrend,
        bool CounterBreakReady);

    private sealed record WorkingZone
    {
        public int SourceIndex { get; init; }
        public double Top { get; init; }
        public double Bot { get; init; }
        public bool IsDemand { get; init; }
        public bool Invalidated { get; set; }
        public bool Tapped { get; set; }
        public int CreatedAt { get; init; }
    }
}
