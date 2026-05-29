using ChamSD_Desktop;

var tests = new DesktopStrategyTests();
tests.PrimaryIndicationGateBlocksBuyBeforeReclaim();
tests.FailedDemandWaitsForSecondHigherLowReset();
tests.KeepsOnlyNewestZone();
tests.RangeFallbackUsesStrictOneToOneRisk();
tests.APlusRequiresWickOnlyZoneTap();
tests.CounterTrendNeedsStrongFullBodyBreakAndStrictRisk();
tests.SessionGateBlocksBuyOutsidePreferredWindows();
tests.OpenCodeUsesOnlyFreeModelLadder();
tests.OpenCodeTestsFreeModelsUntilOneWorks();
await tests.OpenCodeFallbackKeepsCurrentBotStatusAsync();
tests.PredictionParserKeepsGuiCardsFilled();
tests.DesktopStatusAnimationIsDramaticAndColorCoded();
tests.DesktopWindowIsFixedSize();
tests.DesktopUserInterfaceHasNoExampleOrAdClutter();
tests.DesktopUsesLiveMultiTimeframeDataOnly();
tests.DesktopUsesTwentyFourHourTimeOnly();
Console.WriteLine("desktop strategy tests passed");

internal sealed class DesktopStrategyTests
{
    private const long ActiveSessionBase = 1700051700;
    private const long OutsideSessionBase = 1700076900;
    private readonly StrategyEngine _engine = new();

    public void PrimaryIndicationGateBlocksBuyBeforeReclaim()
    {
        var execution = BaseExecution();
        execution.AddRange(new[]
        {
            Candle(26, 101, 102, 96.2, 98.8),
            Candle(27, 98.8, 99.4, 98.1, 99.2),
            Candle(28, 99.2, 99.5, 98.4, 98.9),
            Candle(29, 98.9, 99.3, 98.2, 99.1),
        });

        var decision = DecisionForExecution(execution);
        var reclaim = Checklist(decision, "Primary indication reclaim");
        var noTradeZone = Checklist(decision, "No-trade zone");

        Assert(noTradeZone.Text.Contains("Body-close outside this range", StringComparison.OrdinalIgnoreCase), "baseline no-trade zone must explain HTF body-close breakout");
        Assert(!reclaim.Ok, "price below the indication level must not pass continuation");
        Assert(decision.Label is not ("STATUS: BUY" or "STATUS: A+ BUY"), "BUY must not fire before indication reclaim");
    }

    public void FailedDemandWaitsForSecondHigherLowReset()
    {
        var execution = BaseExecution();
        for (var index = 26; index < 45; index++)
        {
            execution.Add(Candle(index, 101, 102, 92, 93));
        }

        var decision = DecisionForExecution(execution);
        var invalidation = Checklist(decision, "Invalidation");
        var minorReset = Checklist(decision, "Minor BOS reset");

        Assert(!invalidation.Ok, "body close through demand should invalidate the zone");
        Assert(!minorReset.Ok, "failed demand should wait for stair-step reset");
        Assert(
            minorReset.Text.Contains("second higher low", StringComparison.OrdinalIgnoreCase) &&
            minorReset.Text.Contains("break above minor structure", StringComparison.OrdinalIgnoreCase),
            "failed buy reset must ask for second higher low plus minor structure break");
    }

    public void KeepsOnlyNewestZone()
    {
        var execution = BaseExecution();
        execution.AddRange(new[]
        {
            Candle(26, 101, 102, 96, 98),
            Candle(27, 98, 104, 97, 103),
            Candle(28, 101, 102, 99, 100),
            Candle(29, 102, 106, 101, 105),
            Candle(30, 104, 107, 103, 106),
        });

        var decision = DecisionForExecution(execution);
        Assert(decision.Execution.Zones.Count <= 1, "engine must keep only the newest valid zone");
        Assert(decision.Risk.ScaleOut == "75-90%", "risk plan must carry document scale-out guidance");
        Assert(decision.Risk.Text.Contains("75-90% partials", StringComparison.OrdinalIgnoreCase), "risk note must tell users to secure 75-90% partials at TP1");
        Assert(decision.Risk.EntryMode == "AGGRESSIVE / CONSERVATIVE / BREAK OF CANDLE", "trend risk plan must expose all three documented entry types");
        foreach (var entryType in new[] { "aggressive", "conservative", "break-of-candle" })
        {
            Assert(decision.Risk.Text.Contains(entryType, StringComparison.OrdinalIgnoreCase), $"risk note must explain {entryType} entry type");
        }
    }

    public void RangeFallbackUsesStrictOneToOneRisk()
    {
        var ranging = RangingMarketAtSupport();
        var decision = _engine.CalculateStrategyDecision(
            ranging,
            ranging,
            ranging,
            ranging,
            ranging,
            ranging);

        Assert(decision.Phase == "SUPPORT / RESISTANCE", "range fallback should use support/resistance phase near a range edge");
        Assert(decision.Label == "STATUS: WAIT RANGE BUY", "support edge should produce wait range buy status");
        Assert(decision.Risk.EntryMode == "RANGE SUPPORT 1:1", "range fallback should identify the support 1:1 entry mode");
        Assert(decision.Risk.ScaleOut == "100% at 1:1", "range fallback should not use trend-runner scaling");
        Assert(decision.Risk.TargetTwo is null, "range fallback should not create a runner target");
        Assert(
            decision.Risk.Text.Contains("strict 1:1", StringComparison.OrdinalIgnoreCase) &&
            decision.Risk.Text.Contains("No runner", StringComparison.OrdinalIgnoreCase),
            "range fallback risk text must enforce strict 1:1 with no runner");
    }

    public void APlusRequiresWickOnlyZoneTap()
    {
        var bullish = HtfBullish();
        var wickOnlyDecision = _engine.CalculateStrategyDecision(
            ExecutionWithZoneTap(tapIsWickOnly: true),
            bullish,
            bullish,
            bullish,
            bullish,
            bullish);
        var bodyInZoneDecision = _engine.CalculateStrategyDecision(
            ExecutionWithZoneTap(tapIsWickOnly: false),
            bullish,
            bullish,
            bullish,
            bullish,
            bullish);

        Assert(wickOnlyDecision.Execution.Latest.APlusBuy, "wick-only tap with no body in zone should allow A+ buy");
        Assert(wickOnlyDecision.Execution.Latest.LastTap?.WickOnlyNoBodyInZone == true, "tap should record wick-only/no-body A+ eligibility");
        Assert(bodyInZoneDecision.Execution.Latest.BuyTrigger, "body-in-zone fixture should still be a normal buy trigger");
        Assert(!bodyInZoneDecision.Execution.Latest.APlusBuy, "body entering the zone must block A+ buy");
        Assert(bodyInZoneDecision.Execution.Latest.LastTap?.WickOnlyNoBodyInZone == false, "body-in-zone tap should record that it is not A+ clean");
    }

    public void CounterTrendNeedsStrongFullBodyBreakAndStrictRisk()
    {
        var bullish = HtfBullish();
        var bearishDaily = HtfBearish();
        var weakCounterTrend = _engine.CalculateStrategyDecision(
            ExecutionWithCounterTrendBreak(isStrongFullBody: false),
            bullish,
            bullish,
            bullish,
            bullish,
            bearishDaily);
        var strongCounterTrend = _engine.CalculateStrategyDecision(
            ExecutionWithCounterTrendBreak(isStrongFullBody: true),
            bullish,
            bullish,
            bullish,
            bullish,
            bearishDaily);
        var weakCounterChecklist = Checklist(weakCounterTrend, "Counter trend-line break");
        var strongCounterChecklist = Checklist(strongCounterTrend, "Counter trend-line break");

        Assert(weakCounterTrend.Phase == "COUNTER-TREND GATE", "Daily-opposite setup should wait if the break is not full-body strong");
        Assert(weakCounterTrend.Label == "STATUS: WAIT FOR BUY", "weak counter-trend break must not become BUY");
        Assert(!weakCounterChecklist.Ok, "weak counter-trend break should fail the counter checklist");
        Assert(strongCounterTrend.Label == "STATUS: A+ BUY", "strong full-body counter-trend break may continue to the live status");
        Assert(strongCounterChecklist.Ok, "strong full-body counter break should pass");
        Assert(strongCounterTrend.Risk.EntryMode == "COUNTER-TREND STRICT 1:1", "counter-trend exception must use strict 1:1 entry mode");
        Assert(strongCounterTrend.Risk.ScaleOut == "100% at 1:1", "counter-trend exception must fully exit at 1:1");
        Assert(strongCounterTrend.Risk.TargetTwo is null, "counter-trend exception must not create a runner target");
        Assert(strongCounterTrend.Risk.Text.Contains("no runner", StringComparison.OrdinalIgnoreCase), "counter-trend risk text must say no runner");
    }

    public void SessionGateBlocksBuyOutsidePreferredWindows()
    {
        var bullish = HtfBullish();
        var activeSession = _engine.CalculateStrategyDecision(
            ExecutionWithZoneTap(tapIsWickOnly: true),
            bullish,
            bullish,
            bullish,
            bullish,
            bullish);
        var outsidePreferredSession = _engine.CalculateStrategyDecision(
            OutsideSession(ExecutionWithZoneTap(tapIsWickOnly: true)),
            bullish,
            bullish,
            bullish,
            bullish,
            bullish);
        var sessionChecklist = Checklist(outsidePreferredSession, "Trading session");

        Assert(activeSession.Label == "STATUS: A+ BUY", "active London/New York session should allow the valid setup");
        Assert(outsidePreferredSession.Phase == "SESSION GATE", "outside preferred sessions should use the session gate");
        Assert(outsidePreferredSession.Label == "STATUS: WAIT SESSION BUY", "outside preferred sessions must not become BUY");
        Assert(outsidePreferredSession.ClassName == "caution", "session-gated setup should use caution coloring");
        Assert(!sessionChecklist.Ok, "session checklist should fail outside London/New York");
        Assert(sessionChecklist.Text.Contains("gated until London or New York", StringComparison.OrdinalIgnoreCase), "session checklist should explain why BUY/SELL is blocked");
    }

    public void OpenCodeUsesOnlyFreeModelLadder()
    {
        Assert(OpenCodeThinkingService.DisplayModelLabel == "free model auto", "prediction UI must show the free-model auto ladder");
        Assert(OpenCodeThinkingService.FreePredictionModels.Count >= 3, "OpenCode should have a fallback ladder, not one brittle model");
        foreach (var model in OpenCodeThinkingService.FreePredictionModels)
        {
            Assert(model.StartsWith("opencode/", StringComparison.OrdinalIgnoreCase), $"model {model} should use OpenCode provider routing");
            Assert(model.EndsWith("-free", StringComparison.OrdinalIgnoreCase), $"model {model} must be a free model");
        }
    }

    public async Task OpenCodeFallbackKeepsCurrentBotStatusAsync()
    {
        var service = new OpenCodeThinkingService((_, _, _) => Task.FromResult("Error: no prediction"));

        var output = await service.ThinkAsync("live prompt", "STATUS: WAIT FOR SELL", CancellationToken.None);

        Assert(output.Contains("OpenCode tried the free model ladder", StringComparison.OrdinalIgnoreCase), "fallback should explain that every free model was tested");
        Assert(output.Contains("FINAL BOT READ: STATUS: WAIT FOR SELL", StringComparison.Ordinal), "failed OpenCode fallback should keep the live engine status");
    }

    public void OpenCodeTestsFreeModelsUntilOneWorks()
    {
        var attemptedModels = new List<string>();
        var service = new OpenCodeThinkingService((model, _, _) =>
        {
            attemptedModels.Add(model);
            if (attemptedModels.Count == 1)
            {
                throw new InvalidOperationException("first free model failed");
            }

            return Task.FromResult("""
THINKING: Tested the next free model and it read the live structure.
PREDICTION: Wait for the zone tap.
INVALIDATION: Body close through the zone.
FINAL BOT READ: STATUS: WAIT FOR BUY
""");
        });

        var output = service.ThinkAsync("live prompt", "STATUS: WAIT", CancellationToken.None).GetAwaiter().GetResult();

        Assert(attemptedModels.Count == 2, "OpenCode should keep testing free models until one works");
        Assert(attemptedModels.All(model => model.EndsWith("-free", StringComparison.OrdinalIgnoreCase)), "OpenCode test attempts must stay on free models");
        Assert(output.Contains("MODEL: mimo-v2.5-free", StringComparison.Ordinal), "successful output should name the working free model");
        Assert(output.Contains("FINAL BOT READ: STATUS: WAIT FOR BUY", StringComparison.Ordinal), "successful model output should be preserved");
    }

    public void PredictionParserKeepsGuiCardsFilled()
    {
        var sections = PredictionParser.Parse("""
MODEL: deepseek-v4-flash-free
THINKING: Price is in correction and waiting for a zone tap.
PREDICTION: Wait for buy, not an instant buy.
INVALIDATION: Body-close below the demand zone cancels it.
FINAL BOT READ: STATUS: WAIT FOR BUY
""", "STATUS: WAIT");

        Assert(sections.Thinking.Contains("correction", StringComparison.OrdinalIgnoreCase), "thinking card should receive thinking text");
        Assert(sections.Prediction.Contains("Wait for buy", StringComparison.OrdinalIgnoreCase), "next-move card should receive prediction text");
        Assert(sections.Invalidation.Contains("Body-close", StringComparison.OrdinalIgnoreCase), "invalidation card should receive invalidation text");
        Assert(sections.FinalRead == "STATUS: WAIT FOR BUY", "final bot read should preserve the model status");

        var fallback = PredictionParser.Parse("The model returned one useful paragraph without headings.", "STATUS: WAIT");
        Assert(!string.IsNullOrWhiteSpace(fallback.Thinking), "unstructured model output should still fill the thinking card");
        Assert(fallback.Prediction.Contains("one block of text", StringComparison.OrdinalIgnoreCase), "unstructured output should explain the fallback in the prediction card");
        Assert(fallback.FinalRead == "STATUS: WAIT", "missing final read should keep the engine status");
    }

    public void DesktopStatusAnimationIsDramaticAndColorCoded()
    {
        var pageCode = ReadRepoFile("desktop/ChamSD.Desktop/MainPage.xaml.cs");
        var pageXaml = ReadRepoFile("desktop/ChamSD.Desktop/MainPage.xaml");

        Assert(pageXaml.Contains("x:Name=\"StatusFlashOverlay\"", StringComparison.Ordinal), "desktop should have a full-window status flash overlay");
        Assert(pageXaml.Contains("x:Name=\"StatusFlashTransform\"", StringComparison.Ordinal), "desktop should animate the flash overlay transform");
        Assert(pageCode.Contains("StatusFlashOverlay.Background = Brush(border)", StringComparison.Ordinal), "flash overlay should use the active status color");
        Assert(pageCode.Contains("AddDoubleAnimation(storyboard, StatusFlashOverlay, \"Opacity\"", StringComparison.Ordinal), "status changes should flash visibly");
        Assert(pageCode.Contains("StatusBarTransform, \"TranslateX\"", StringComparison.Ordinal), "status bar should move on status changes");
        Assert(pageCode.Contains("ChartCanvasTransform, \"TranslateY\"", StringComparison.Ordinal), "chart should move on status changes");
        Assert(pageCode.Contains("className is \"buy\" or \"sell\" ? 1.0", StringComparison.Ordinal), "buy/sell statuses should use the strongest animation intensity");

        foreach (var status in new[] { "\"buy\"", "\"sell\"", "\"caution\"", "\"no-trade\"" })
        {
            Assert(pageCode.Contains(status, StringComparison.Ordinal), $"desktop status theme should include {status}");
        }
    }

    public void DesktopWindowIsFixedSize()
    {
        var windowCode = ReadRepoFile("desktop/ChamSD.Desktop/MainWindow.xaml.cs");

        Assert(windowCode.Contains("ConfigureFixedWindow()", StringComparison.Ordinal), "desktop window should configure fixed sizing on startup");
        Assert(windowCode.Contains("presenter.IsResizable = false", StringComparison.Ordinal), "desktop window should not be resizable");
        Assert(windowCode.Contains("presenter.IsMaximizable = false", StringComparison.Ordinal), "desktop window should not be maximizable");
    }

    public void DesktopUserInterfaceHasNoExampleOrAdClutter()
    {
        var pageXaml = ReadRepoFile("desktop/ChamSD.Desktop/MainPage.xaml");
        foreach (var forbidden in new[] { ".example", "sample", "demo", "mock", "fake", "advert", "sponsor" })
        {
            Assert(!pageXaml.Contains(forbidden, StringComparison.OrdinalIgnoreCase), $"desktop UI should not show {forbidden} wording");
        }
    }

    public void DesktopUsesLiveMultiTimeframeDataOnly()
    {
        var dataService = ReadRepoFile("desktop/ChamSD.Desktop/MarketDataService.cs");
        var pageCode = ReadRepoFile("desktop/ChamSD.Desktop/MainPage.xaml.cs");

        Assert(dataService.Contains("https://biquote.io/api/", StringComparison.Ordinal), "desktop app must fetch live candles from BiQuote");
        Assert(dataService.Contains("DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()", StringComparison.Ordinal), "desktop live data requests must be cache-busted");
        Assert(dataService.Contains("The live data server returned no candles.", StringComparison.Ordinal), "desktop app should fail closed when live data is unavailable");
        foreach (var interval in new[] { "5m", "15m", "30m", "1h", "4h", "1d" })
        {
            Assert(pageCode.Contains($"GetCandlesAsync(market.Symbol, \"{interval}\"", StringComparison.Ordinal), $"desktop app must fetch {interval} live candles");
        }

        foreach (var forbidden in new[] { "sampleCandles", "demoCandles", "mockCandles", "fakeCandles" })
        {
            Assert(!pageCode.Contains(forbidden, StringComparison.OrdinalIgnoreCase), $"desktop app must not use {forbidden}");
            Assert(!dataService.Contains(forbidden, StringComparison.OrdinalIgnoreCase), $"desktop data service must not use {forbidden}");
        }
    }

    public void DesktopUsesTwentyFourHourTimeOnly()
    {
        var pageCode = ReadRepoFile("desktop/ChamSD.Desktop/MainPage.xaml.cs");
        var strategyCode = ReadRepoFile("desktop/ChamSD.Desktop/StrategyEngine.cs");

        Assert(pageCode.Contains("HH:mm zzz", StringComparison.Ordinal), "desktop live candle timestamp should use 24-hour HH:mm format");
        Assert(pageCode.Contains("HH:mm:ss", StringComparison.Ordinal), "desktop update/log timestamps should use 24-hour HH:mm:ss format");
        Assert(strategyCode.Contains("{local:HH:mm} ET", StringComparison.Ordinal), "desktop session text should use 24-hour HH:mm ET");
        Assert(strategyCode.Contains("09:30 ET", StringComparison.Ordinal), "desktop session rule should describe New York 09:30 ET in 24-hour time");

        foreach (var forbidden in new[] { "hh:mm", "h:mm tt", "hh:mm tt", ":mm tt", " AM", " PM" })
        {
            Assert(!pageCode.Contains(forbidden, StringComparison.Ordinal), $"desktop page must not use 12-hour time token {forbidden}");
            Assert(!strategyCode.Contains(forbidden, StringComparison.Ordinal), $"desktop strategy text must not use 12-hour time token {forbidden}");
        }
    }

    private StrategyDecision DecisionForExecution(IReadOnlyList<MarketCandle> executionCandles)
    {
        var bullish = HtfBullish();
        return _engine.CalculateStrategyDecision(
            executionCandles,
            bullish,
            bullish,
            bullish,
            bullish,
            bullish);
    }

    private static List<MarketCandle> BaseExecution()
    {
        var bars = Filler(20, 96);
        bars.AddRange(new[]
        {
            Candle(20, 96, 97, 95, 96),
            Candle(21, 97, 101, 96, 100),
            Candle(22, 96, 97, 94, 95),
            Candle(23, 98, 99, 97, 98),
            Candle(24, 95, 96, 94, 95),
            Candle(25, 96, 103, 95, 102),
        });
        return bars;
    }

    private static List<MarketCandle> ExecutionWithZoneTap(bool tapIsWickOnly)
    {
        var bars = Filler(22, 96);
        bars.AddRange(new[]
        {
            Candle(22, 96, 97, 95, 96),
            Candle(23, 97, 101, 96, 100),
            Candle(24, 96, 97, 94, 95),
            Candle(25, 98, 99, 97, 98),
            Candle(26, 95, 96, 94, 95),
            Candle(27, 96, 103, 95, 102),
        });
        bars.Add(tapIsWickOnly
            ? Candle(28, 102, 103, 94.5, 102.5)
            : Candle(28, 96.2, 103, 94.5, 96.5));
        bars.Add(Candle(29, 103.1, 107, 103, 106));
        return bars;
    }

    private static List<MarketCandle> ExecutionWithCounterTrendBreak(bool isStrongFullBody)
    {
        var bars = ExecutionWithZoneTap(tapIsWickOnly: true);
        bars[^1] = isStrongFullBody
            ? Candle(29, 103.1, 107, 103, 106)
            : Candle(29, 100, 107, 99.8, 106);
        return bars;
    }

    private static List<MarketCandle> OutsideSession(IReadOnlyList<MarketCandle> candles)
    {
        return candles
            .Select((bar, index) => bar with { Time = DateTimeOffset.FromUnixTimeSeconds(OutsideSessionBase + index * 300) })
            .ToList();
    }

    private static List<MarketCandle> RangingMarketAtSupport()
    {
        var bars = new List<MarketCandle>();
        for (var index = 0; index < 45; index++)
        {
            var open = 104.8;
            var high = 105.5;
            var low = 104.5;
            var close = 105.2;
            if (index % 8 == 2)
            {
                open = 109.2;
                high = 110.4;
                low = 109;
                close = 110;
            }

            if (index % 8 == 6)
            {
                open = 100.8;
                high = 101;
                low = 99.6;
                close = 100;
            }

            if (index == 44)
            {
                open = 101.1;
                high = 101.3;
                low = 100.7;
                close = 101;
            }

            bars.Add(Candle(index, open, high, low, close));
        }

        return bars;
    }

    private static List<MarketCandle> HtfBullish()
    {
        var bars = Filler(34, 95);
        bars.AddRange(new[]
        {
            Candle(34, 97, 120, 96, 100),
            Candle(35, 98, 99, 97, 98),
            Candle(36, 96, 97, 95, 96),
            Candle(37, 98, 99, 97, 98),
            Candle(38, 96, 97, 95, 96),
            Candle(39, 100, 106, 99, 105),
        });
        return bars;
    }

    private static List<MarketCandle> HtfBearish()
    {
        var bars = Filler(34, 112);
        bars.AddRange(new[]
        {
            Candle(34, 103, 116, 99, 100),
            Candle(35, 102, 114, 101, 102),
            Candle(36, 104, 115, 103, 104),
            Candle(37, 102, 113, 101, 102),
            Candle(38, 104, 115, 103, 104),
            Candle(39, 100, 110, 94, 95),
        });
        return bars;
    }

    private static List<MarketCandle> Filler(int count, double basePrice)
    {
        return Enumerable.Range(0, count)
            .Select(index => Candle(index, basePrice, basePrice + 1, basePrice - 1, basePrice + (index % 2 == 1 ? 0.2 : -0.2)))
            .ToList();
    }

    private static MarketCandle Candle(int index, double open, double high, double low, double close, double volume = 1000)
    {
        return new MarketCandle(
            DateTimeOffset.FromUnixTimeSeconds(ActiveSessionBase + index * 300),
            open,
            high,
            low,
            close,
            volume);
    }

    private static ChecklistItem Checklist(StrategyDecision decision, string label)
    {
        return decision.Checklist.FirstOrDefault(item => item.Label == label)
            ?? throw new InvalidOperationException($"{label} checklist item should exist");
    }

    private static string ReadRepoFile(string relativePath)
    {
        var directory = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, relativePath);
            if (File.Exists(candidate))
            {
                return File.ReadAllText(candidate);
            }

            directory = directory.Parent;
        }

        throw new FileNotFoundException($"Could not find {relativePath} from {Directory.GetCurrentDirectory()}.");
    }

    private static void Assert(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidOperationException(message);
        }
    }
}
