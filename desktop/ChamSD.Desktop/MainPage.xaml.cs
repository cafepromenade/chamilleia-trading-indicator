using System.Collections.ObjectModel;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Animation;
using Microsoft.UI.Xaml.Shapes;
using Windows.Foundation;

namespace ChamSD_Desktop;

public sealed partial class MainPage : Page
{
    private const string PredictionModelLabel = OpenCodeThinkingService.DisplayModelLabel;

    private static readonly IReadOnlyList<MarketConfig> Markets =
    [
        new("XAUUSD", "XAUUSD - Gold", "XAUUSD"),
        new("GBPJPY", "GBPJPY", "GBPJPY"),
        new("EURUSD", "EURUSD", "EURUSD"),
        new("BTCUSD", "BTCUSD", "BTCUSD"),
    ];

    private readonly MarketDataService _marketData = new();
    private readonly StrategyEngine _strategyEngine = new();
    private readonly WebhookService _webhookService = new();
    private readonly OpenCodeThinkingService _thinkingService = new();
    private readonly WindowsNotificationService _notificationService = new();
    private readonly DispatcherTimer _refreshTimer = new() { Interval = TimeSpan.FromSeconds(60) };
    private readonly ObservableCollection<WebhookEndpoint> _webhooks = new();
    private readonly SolidColorBrush _chartTextBrush = Brush(0xFFD8DEE9);
    private IReadOnlyList<MarketCandle> _visibleCandles = Array.Empty<MarketCandle>();
    private StrategyDecision? _currentDecision;
    private MarketConfig? _currentMarket;
    private string? _lastStatusLabel;
    private bool _isLoading;
    private bool _isThinking;

    public MainPage()
    {
        InitializeComponent();

        MarketComboBox.ItemsSource = Markets;
        MarketComboBox.SelectedIndex = 0;
        WebhookMethodComboBox.ItemsSource = new[] { "POST", "GET" };
        WebhookMethodComboBox.SelectedIndex = 0;
        WebhookList.ItemsSource = _webhooks;
        AddDefaultWebhook();

        _refreshTimer.Tick += async (_, _) =>
        {
            if (AutoRefreshCheckBox.IsChecked == true)
            {
                await LoadLiveDataAsync();
            }
        };
        _refreshTimer.Start();

        Loaded += async (_, _) => await LoadLiveDataAsync();
    }

    private async Task LoadLiveDataAsync()
    {
        if (_isLoading || MarketComboBox.SelectedItem is not MarketConfig market)
        {
            return;
        }

        _isLoading = true;
        RefreshButton.IsEnabled = false;
        RefreshButton.Content = "Loading";
        SetStatus("STATUS: LOADING", $"Fetching live {market.Name} candles from BiQuote.", "wait", 0, "Loading");

        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(22));
            var executionTask = _marketData.GetCandlesAsync(market.Symbol, "5m", timeout.Token);
            var m15Task = _marketData.GetCandlesAsync(market.Symbol, "15m", timeout.Token);
            var m30Task = _marketData.GetCandlesAsync(market.Symbol, "30m", timeout.Token);
            var h1Task = _marketData.GetCandlesAsync(market.Symbol, "1h", timeout.Token);
            var h4Task = _marketData.GetCandlesAsync(market.Symbol, "4h", timeout.Token);
            var d1Task = _marketData.GetCandlesAsync(market.Symbol, "1d", timeout.Token);
            await Task.WhenAll(executionTask, m15Task, m30Task, h1Task, h4Task, d1Task);

            var executionCandles = executionTask.Result;
            var m15Candles = m15Task.Result;
            var m30Candles = m30Task.Result;
            var h1Candles = h1Task.Result;
            var h4Candles = h4Task.Result;
            var d1Candles = d1Task.Result;
            var previousStatus = _currentDecision?.Label;
            var decision = _strategyEngine.CalculateStrategyDecision(executionCandles, m15Candles, m30Candles, h1Candles, h4Candles, d1Candles);

            _currentMarket = market;
            _currentDecision = decision;
            _visibleCandles = executionCandles.TakeLast(72).ToList();
            RenderDecision(market, decision, executionCandles[^1]);
            DrawChart();

            var statusChanged = !string.IsNullOrWhiteSpace(previousStatus) && previousStatus != decision.Label;
            var shouldAutoThink = AutoThinkCheckBox.IsChecked == true && (string.IsNullOrWhiteSpace(previousStatus) || statusChanged);
            if (statusChanged)
            {
                await SendStatusChangeWebhooksAsync();
                SendWindowsStatusNotification();
            }

            if (shouldAutoThink)
            {
                await RunThinkingAsync();
            }
        }
        catch (Exception ex)
        {
            SetStatus("STATUS: DATA UNAVAILABLE", $"Live data could not be loaded: {ex.Message}", "no-trade", 0, "DATA ERROR");
            SetPredictionMessage("AI: live data unavailable", "Could not read the live candles.", "No automatic prediction can run until data loads.", ex.Message, "STATUS: DATA UNAVAILABLE", "no-trade");
            LastUpdatedText.Text = "Live data unavailable";
            ChecklistItems.ItemsSource = Array.Empty<ChecklistItem>();
            _visibleCandles = Array.Empty<MarketCandle>();
            ChartCanvas.Children.Clear();
            AppendLog($"Data error: {ex.Message}");
        }
        finally
        {
            RefreshButton.IsEnabled = true;
            RefreshButton.Content = "Refresh";
            _isLoading = false;
        }
    }

    private void RenderDecision(MarketConfig market, StrategyDecision decision, MarketCandle latestCandle)
    {
        SetStatus(decision.Label, decision.Note, decision.ClassName, decision.Confidence, decision.Phase);
        FactMarketText.Text = market.Name;
        FactBiasText.Text = $"{decision.Bias.Direction.ToUpperInvariant()} ({decision.Bias.Source})";
        FactCloseText.Text = FormatPrice(decision.Execution.Latest.Close);
        FactCandleText.Text = latestCandle.Time.ToLocalTime().ToString("MMM d, HH:mm zzz");
        FactSessionText.Text = decision.SessionText;
        FactD1Text.Text = decision.D1Bias.Reason;
        FactM30Text.Text = decision.M30Bias.Reason;
        FactM15Text.Text = decision.M15Bias.Reason;
        FactH1Text.Text = decision.H1Bias.Reason;
        FactH4Text.Text = decision.H4Bias.Reason;
        RiskEntryText.Text = FormatNullablePrice(decision.Risk.Entry);
        RiskStopText.Text = FormatNullablePrice(decision.Risk.Stop);
        RiskTp1Text.Text = FormatNullablePrice(decision.Risk.TargetOne);
        RiskTp2Text.Text = FormatNullablePrice(decision.Risk.TargetTwo);
        RiskStructureText.Text = FormatNullablePrice(decision.Risk.StructureTarget);
        RiskEntryModeText.Text = decision.Risk.EntryMode;
        RiskScaleText.Text = decision.Risk.ScaleOut;
        RiskNoteText.Text = decision.Risk.Text;
        ChecklistItems.ItemsSource = decision.Checklist;
        LastUpdatedText.Text = $"Live update: {DateTimeOffset.Now:MMM d, HH:mm:ss}";
    }

    private void SetStatus(string label, string note, string className, int confidence, string phase)
    {
        var shouldAnimate = _lastStatusLabel != label;
        _lastStatusLabel = label;

        StatusText.Text = label;
        StatusNoteText.Text = note;
        ConfidenceText.Text = $"{confidence}%";
        PhaseText.Text = phase;

        var (background, border, foreground, workspace) = className switch
        {
            "buy" => (0xFFEAF8EFu, 0xFF1F9D55u, 0xFF145C32u, 0xFFF1FBF5u),
            "sell" => (0xFFFDECECu, 0xFFD64545u, 0xFF8F1D1Du, 0xFFFFF2F2u),
            "caution" => (0xFFFFF3CDu, 0xFFF0B429u, 0xFF7A4F00u, 0xFFFFF9E8u),
            "no-trade" => (0xFFF0F2F5u, 0xFF6B7280u, 0xFF343A46u, 0xFFF5F7FAu),
            _ => (0xFFFFF7E0u, 0xFFE5B21Fu, 0xFF7A5B00u, 0xFFFFF9ECu),
        };

        RootGrid.Background = Brush(workspace);
        StatusBar.Background = Brush(background);
        StatusBar.BorderBrush = Brush(border);
        StatusFlashOverlay.Background = Brush(border);
        StatusText.Foreground = Brush(foreground);
        ConfidenceText.Foreground = Brush(foreground);

        if (shouldAnimate)
        {
            AnimateStatusChange(className);
        }
    }

    private void SetPredictionTheme(string className)
    {
        var (background, border, foreground) = className switch
        {
            "buy" => (0xFFEAF8EFu, 0xFF1F9D55u, 0xFF145C32u),
            "sell" => (0xFFFDECECu, 0xFFD64545u, 0xFF8F1D1Du),
            "no-trade" => (0xFFF0F2F5u, 0xFF6B7280u, 0xFF343A46u),
            "caution" => (0xFFFFF3CDu, 0xFFF0B429u, 0xFF7A4F00u),
            _ => (0xFFFFF7E0u, 0xFFE5B21Fu, 0xFF7A5B00u),
        };

        PredictionPanel.Background = Brush(background);
        PredictionPanel.BorderBrush = Brush(border);
        PredictionStateText.Foreground = Brush(foreground);

        foreach (var card in new[] { PredictionThinkingCard, PredictionMoveCard, PredictionInvalidationCard, PredictionFinalCard })
        {
            card.BorderBrush = Brush(border);
        }
    }

    private void SetPredictionMessage(string state, string thinking, string prediction, string invalidation, string finalRead, string className)
    {
        PredictionStateText.Text = state;
        PredictionModelText.Text = PredictionModelLabel;
        PredictionThinkingText.Text = thinking;
        PredictionMoveText.Text = prediction;
        PredictionInvalidationText.Text = invalidation;
        PredictionFinalReadText.Text = finalRead;
        SetPredictionTheme(className);
        AnimatePredictionChange();
    }

    private void SetPredictionSections(ChamSD_Desktop.PredictionSections sections, string className)
    {
        SetPredictionMessage(
            $"AI: updated {DateTimeOffset.Now:HH:mm:ss}",
            sections.Thinking,
            sections.Prediction,
            sections.Invalidation,
            sections.FinalRead,
            className);
    }

    private void AnimateStatusChange(string className)
    {
        StatusBarTransform.TranslateX = 0;
        StatusBarTransform.ScaleX = 1;
        StatusBarTransform.ScaleY = 1;
        ChartCanvasTransform.TranslateY = 0;
        ChartCanvasTransform.ScaleX = 1;
        ChartCanvasTransform.ScaleY = 1;
        StatusFlashOverlay.Opacity = 0;
        StatusFlashTransform.ScaleX = 1;
        StatusFlashTransform.ScaleY = 1;

        var storyboard = new Storyboard();
        var intensity = className is "buy" or "sell" ? 1.0 : className == "caution" ? 0.82 : 0.62;
        AddDoubleAnimation(storyboard, StatusFlashOverlay, "Opacity", 0.0, 0.24 * intensity, 260, autoReverse: true);
        AddDoubleAnimation(storyboard, StatusFlashTransform, "ScaleX", 1, 1.025, 300, autoReverse: true);
        AddDoubleAnimation(storyboard, StatusFlashTransform, "ScaleY", 1, 1.025, 300, autoReverse: true);
        AddDoubleAnimation(storyboard, StatusBarTransform, "TranslateX", 0, 34 * intensity, 190, autoReverse: true);
        AddDoubleAnimation(storyboard, StatusBarTransform, "ScaleX", 1, 1.05, 240, autoReverse: true);
        AddDoubleAnimation(storyboard, StatusBarTransform, "ScaleY", 1, 1.08, 240, autoReverse: true);
        AddDoubleAnimation(storyboard, ChartCanvasTransform, "TranslateY", 0, -16 * intensity, 240, autoReverse: true);
        AddDoubleAnimation(storyboard, ChartCanvasTransform, "ScaleX", 1, 1.012, 240, autoReverse: true);
        AddDoubleAnimation(storyboard, ChartCanvasTransform, "ScaleY", 1, 1.035, 240, autoReverse: true);
        storyboard.Completed += (_, _) =>
        {
            StatusBarTransform.TranslateX = 0;
            StatusBarTransform.ScaleX = 1;
            StatusBarTransform.ScaleY = 1;
            ChartCanvasTransform.TranslateY = 0;
            ChartCanvasTransform.ScaleX = 1;
            ChartCanvasTransform.ScaleY = 1;
            StatusFlashOverlay.Opacity = 0;
            StatusFlashTransform.ScaleX = 1;
            StatusFlashTransform.ScaleY = 1;
        };
        storyboard.Begin();
    }

    private void AnimatePredictionChange()
    {
        PredictionPanelTransform.TranslateX = 0;
        PredictionPanelTransform.ScaleX = 1;
        PredictionPanelTransform.ScaleY = 1;

        var storyboard = new Storyboard();
        AddDoubleAnimation(storyboard, PredictionPanelTransform, "TranslateX", 0, 14, 160, autoReverse: true);
        AddDoubleAnimation(storyboard, PredictionPanelTransform, "ScaleX", 1, 1.025, 180, autoReverse: true);
        AddDoubleAnimation(storyboard, PredictionPanelTransform, "ScaleY", 1, 1.045, 180, autoReverse: true);
        storyboard.Completed += (_, _) =>
        {
            PredictionPanelTransform.TranslateX = 0;
            PredictionPanelTransform.ScaleX = 1;
            PredictionPanelTransform.ScaleY = 1;
        };
        storyboard.Begin();
    }

    private static void AddDoubleAnimation(
        Storyboard storyboard,
        DependencyObject target,
        string targetProperty,
        double from,
        double to,
        int milliseconds,
        bool autoReverse)
    {
        var animation = new DoubleAnimation
        {
            From = from,
            To = to,
            Duration = new Duration(TimeSpan.FromMilliseconds(milliseconds)),
            AutoReverse = autoReverse,
            EnableDependentAnimation = true,
        };
        Storyboard.SetTarget(animation, target);
        Storyboard.SetTargetProperty(animation, targetProperty);
        storyboard.Children.Add(animation);
    }

    private void DrawChart()
    {
        ChartCanvas.Children.Clear();
        if (_visibleCandles.Count == 0)
        {
            return;
        }

        var width = Math.Max(ChartCanvas.ActualWidth, 720);
        var height = Math.Max(ChartCanvas.ActualHeight, 360);
        ChartCanvas.Clip = new RectangleGeometry { Rect = new Rect(0, 0, width, height) };
        const double padLeft = 44;
        const double padRight = 96;
        const double padTop = 38;
        const double padBottom = 42;
        var chartWidth = width - padLeft - padRight;
        var chartHeight = height - padTop - padBottom;
        var low = _visibleCandles.Min(candle => candle.Low);
        var high = _visibleCandles.Max(candle => candle.High);
        var padding = (high - low) * 0.1;
        var priceMin = low - (padding == 0 ? 1 : padding);
        var priceMax = high + (padding == 0 ? 1 : padding);
        var span = priceMax - priceMin;
        var slot = chartWidth / _visibleCandles.Count;
        var bodyWidth = Math.Clamp(slot * 0.58, 3, 12);

        double XFor(int index) => padLeft + slot * index + slot / 2;
        double YFor(double price) => padTop + (priceMax - price) / span * chartHeight;

        AddText($"{_currentMarket?.Name ?? "Market"} live 5-minute chart", padLeft, 12, 14, _chartTextBrush);

        for (var tick = 0; tick < 5; tick++)
        {
            var price = priceMin + span / 4 * tick;
            var y = YFor(price);
            ChartCanvas.Children.Add(new Line
            {
                X1 = padLeft,
                Y1 = y,
                X2 = width - padRight,
                Y2 = y,
                Stroke = Brush(0xFF22314A),
                StrokeThickness = 1,
            });
            AddText(FormatPrice(price), width - padRight + 8, y - 8, 12, _chartTextBrush);
        }

        if (_currentDecision is not null)
        {
            foreach (var zone in _currentDecision.Execution.Zones.Where(zone => zone.Top >= priceMin && zone.Bot <= priceMax && zone.Top <= priceMax && zone.Bot >= priceMin).Take(1))
            {
                var visibleTop = Math.Clamp(zone.Top, priceMin, priceMax);
                var visibleBot = Math.Clamp(zone.Bot, priceMin, priceMax);
                var yTop = YFor(visibleTop);
                var yBot = YFor(visibleBot);
                var zoneHeight = Math.Abs(yBot - yTop);
                if (zoneHeight < 2 || zoneHeight > chartHeight * 0.28)
                {
                    continue;
                }

                var rect = new Rectangle
                {
                    Width = chartWidth,
                    Height = Math.Max(2, zoneHeight),
                    Fill = Brush(zone.IsDemand ? 0xFF1F9D55u : 0xFFD64545u),
                    Opacity = 0.14,
                };
                Canvas.SetLeft(rect, padLeft);
                Canvas.SetTop(rect, Math.Min(yTop, yBot));
                ChartCanvas.Children.Add(rect);
            }
        }

        for (var index = 0; index < _visibleCandles.Count; index++)
        {
            var candle = _visibleCandles[index];
            var x = XFor(index);
            var isUp = candle.Close >= candle.Open;
            var candleBrush = Brush(isUp ? 0xFF29C46Bu : 0xFFFF5D5Du);
            var yHigh = YFor(candle.High);
            var yLow = YFor(candle.Low);
            var yOpen = YFor(candle.Open);
            var yClose = YFor(candle.Close);
            var bodyY = Math.Min(yOpen, yClose);
            var bodyHeight = Math.Max(2, Math.Abs(yClose - yOpen));

            ChartCanvas.Children.Add(new Line
            {
                X1 = x,
                Y1 = yHigh,
                X2 = x,
                Y2 = yLow,
                Stroke = candleBrush,
                StrokeThickness = 1.5,
            });

            var body = new Rectangle
            {
                Width = bodyWidth,
                Height = bodyHeight,
                Fill = candleBrush,
                RadiusX = 2,
                RadiusY = 2,
            };
            Canvas.SetLeft(body, x - bodyWidth / 2);
            Canvas.SetTop(body, bodyY);
            ChartCanvas.Children.Add(body);
        }

        var last = _visibleCandles[^1];
        var lastY = YFor(last.Close);
        ChartCanvas.Children.Add(new Line
        {
            X1 = padLeft,
            Y1 = lastY,
            X2 = width - padRight,
            Y2 = lastY,
            Stroke = Brush(0xFFFFFFFF),
            StrokeThickness = 1,
            StrokeDashArray = new DoubleCollection { 4, 4 },
            Opacity = 0.7,
        });
        AddText(FormatPrice(last.Close), width - padRight + 8, lastY - 24, 12, _chartTextBrush);
    }

    private void AddText(string text, double left, double top, double size, Brush brush)
    {
        var block = new TextBlock
        {
            Text = text,
            FontSize = size,
            Foreground = brush,
        };
        Canvas.SetLeft(block, left);
        Canvas.SetTop(block, top);
        ChartCanvas.Children.Add(block);
    }

    private void AddDefaultWebhook()
    {
        var endpoint = new WebhookEndpoint
        {
            Name = "Status alert",
            Method = "POST",
            Enabled = true,
        };
        _webhooks.Add(endpoint);
        WebhookList.SelectedItem = endpoint;
        LoadWebhookEditor(endpoint);
    }

    private void LoadWebhookEditor(WebhookEndpoint? endpoint)
    {
        if (endpoint is null)
        {
            return;
        }

        WebhookNameTextBox.Text = endpoint.Name;
        WebhookUrlTextBox.Text = endpoint.Url;
        WebhookMethodComboBox.SelectedItem = endpoint.Method;
        WebhookEnabledCheckBox.IsChecked = endpoint.Enabled;
        WebhookOnStatusChangeCheckBox.IsChecked = endpoint.SendOnStatusChange;
        HeadersList.ItemsSource = endpoint.Headers;
        ValuesList.ItemsSource = endpoint.Values;
    }

    private void SaveWebhookEditor(WebhookEndpoint endpoint)
    {
        endpoint.Name = string.IsNullOrWhiteSpace(WebhookNameTextBox.Text) ? "Webhook" : WebhookNameTextBox.Text.Trim();
        endpoint.Url = WebhookUrlTextBox.Text.Trim();
        endpoint.Method = WebhookMethodComboBox.SelectedItem?.ToString() == "GET" ? "GET" : "POST";
        endpoint.Enabled = WebhookEnabledCheckBox.IsChecked == true;
        endpoint.SendOnStatusChange = WebhookOnStatusChangeCheckBox.IsChecked == true;
        WebhookList.ItemsSource = null;
        WebhookList.ItemsSource = _webhooks;
        WebhookList.SelectedItem = endpoint;
    }

    private async Task SendStatusChangeWebhooksAsync()
    {
        foreach (var endpoint in _webhooks.Where(item => item.Enabled && item.SendOnStatusChange).ToList())
        {
            await SendEndpointAsync(endpoint);
        }
    }

    private void SendWindowsStatusNotification()
    {
        if (WindowsNotificationsCheckBox.IsChecked != true || _currentDecision is null || _currentMarket is null)
        {
            return;
        }

        try
        {
            _notificationService.ShowStatusNotification(_currentMarket, _currentDecision);
            AppendLog("Windows notification sent for status change.");
        }
        catch (Exception ex)
        {
            AppendLog($"Windows notification failed: {ex.Message}");
        }
    }

    private async Task SendEndpointAsync(WebhookEndpoint endpoint)
    {
        if (_currentDecision is null || _currentMarket is null)
        {
            AppendLog("Webhook skipped: live status is not ready yet.");
            return;
        }

        try
        {
            SaveWebhookEditor(endpoint);
            var result = await _webhookService.SendAsync(endpoint, _currentMarket, _currentDecision, CancellationToken.None);
            AppendLog(result);
        }
        catch (Exception ex)
        {
            AppendLog($"{endpoint.Name}: webhook failed: {ex.Message}");
        }
    }

    private async Task RunThinkingAsync()
    {
        if (_isThinking)
        {
            return;
        }

        if (_currentDecision is null || _currentMarket is null)
        {
            SetPredictionMessage("AI: waiting for live data", "OpenCode prediction needs live market data first.", "Load live candles before predicting.", "No invalidation can be read yet.", "STATUS: WAITING", "wait");
            return;
        }

        _isThinking = true;
        ThinkButton.IsEnabled = false;
        SetPredictionMessage("AI: thinking...", "OpenCode is reading the live market structure.", "Prediction is running automatically.", "Checking the zone failure rule.", _currentDecision.Label, _currentDecision.ClassName);

        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(75));
            var output = await _thinkingService.ThinkAsync(BuildThinkingPrompt(_currentMarket, _currentDecision), timeout.Token);
            SetPredictionSections(PredictionParser.Parse(output, _currentDecision.Label), _currentDecision.ClassName);
        }
        catch (OperationCanceledException)
        {
            SetPredictionMessage("AI: timed out", "OpenCode did not answer before the timeout.", "Keep the current bot status until the next prediction runs.", "No new invalidation was returned.", _currentDecision.Label, "caution");
        }
        catch (Exception ex)
        {
            SetPredictionMessage("AI: failed", "OpenCode prediction failed.", "Keep the current bot status until OpenCode works again.", ex.Message, _currentDecision.Label, "no-trade");
        }
        finally
        {
            ThinkButton.IsEnabled = true;
            _isThinking = false;
        }
    }

    private static string BuildThinkingPrompt(MarketConfig market, StrategyDecision decision)
    {
        var checklist = string.Join(Environment.NewLine, decision.Checklist.Select(item =>
            $"- {item.Label}: {(item.Ok ? "YES" : "WAIT")} - {item.Text}"));

        return $"""
You are the thinking and prediction layer for a trading-status bot.
Use only the live facts below. Do not invent prices, news, or certainty.
Predict the next likely market state from Chamilleia price action, ICC phases, and supply/demand market structure only.
Do not use EMA, indicators, outside news, or made-up candles.
Do not tell the user this is guaranteed, and do not place trades.
Use simple language a beginner can understand.
Output exactly these four sections and keep each section short:
THINKING:
PREDICTION:
INVALIDATION:
FINAL BOT READ: {decision.Label}

Market: {market.Name}
Symbol: {market.Symbol}
Status: {decision.Label}
Phase: {decision.Phase}
Confidence: {decision.Confidence}%
Higher-timeframe bias: {decision.Bias.Direction} from {decision.Bias.Source}
Reason: {decision.Bias.Reason}
Last close: {decision.Execution.Latest.Close}
Risk entry: {decision.Risk.Entry?.ToString() ?? "-"}
Risk stop: {decision.Risk.Stop?.ToString() ?? "-"}
Risk TP1: {decision.Risk.TargetOne?.ToString() ?? "-"}
Risk TP2: {decision.Risk.TargetTwo?.ToString() ?? "-"}
Risk structure target: {decision.Risk.StructureTarget?.ToString() ?? "-"}
Risk note: {decision.Risk.Text}
Entry mode: {decision.Risk.EntryMode}
Session: {decision.SessionText}
Daily: {decision.D1Bias.Direction} - {decision.D1Bias.Reason}
30M: {decision.M30Bias.Direction} - {decision.M30Bias.Reason}
15M: {decision.M15Bias.Direction} - {decision.M15Bias.Reason}

Strategy rules:
- 4H overrides 1H. HTF body-close breakout creates the indication level.
- 5M/15M waits for correction, newest supply/demand zone tap, then break-of-candle continuation.
- 5M BOS can be a wick or a full candle body; HTF indication still uses body close.
- Demand is the last red candle before an aggressive push up. Supply is the last green candle before an aggressive push down.
- Only the newest zone from the latest structure break is valid; older zones are ignored.
- If a candle body closes through the zone, the zone is invalid and the bot waits for minor structure reset.
- If market is ranging, use support/resistance only and keep targets strict.
- Stop goes outside the tapped zone. TP1 is 1:1, then scale 75-90% and let the runner target the next major historical swing before 1:2.
- Abort trend scanning during random consolidation or when price has no clear structural target near the available daily-history edge.
- Counter-trend ideas need a strong body-close break and strict 1:1 target.

Checklist:
{checklist}
""";
    }

    private void AppendLog(string message)
    {
        WebhookLogTextBox.Text = $"[{DateTimeOffset.Now:HH:mm:ss}] {message}{Environment.NewLine}{WebhookLogTextBox.Text}";
    }

    private async void RefreshButton_Click(object sender, RoutedEventArgs e)
    {
        await LoadLiveDataAsync();
    }

    private async void MarketComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (IsLoaded)
        {
            await LoadLiveDataAsync();
        }
    }

    private void ChartCanvas_SizeChanged(object sender, SizeChangedEventArgs e)
    {
        DrawChart();
    }

    private void WebhookList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        LoadWebhookEditor(WebhookList.SelectedItem as WebhookEndpoint);
    }

    private void AddWebhookButton_Click(object sender, RoutedEventArgs e)
    {
        var endpoint = new WebhookEndpoint { Name = $"Webhook {_webhooks.Count + 1}" };
        _webhooks.Add(endpoint);
        WebhookList.SelectedItem = endpoint;
        LoadWebhookEditor(endpoint);
    }

    private void SaveWebhookButton_Click(object sender, RoutedEventArgs e)
    {
        if (WebhookList.SelectedItem is WebhookEndpoint endpoint)
        {
            SaveWebhookEditor(endpoint);
            AppendLog($"{endpoint.Name}: saved.");
        }
    }

    private void RemoveWebhookButton_Click(object sender, RoutedEventArgs e)
    {
        if (WebhookList.SelectedItem is not WebhookEndpoint endpoint)
        {
            return;
        }

        _webhooks.Remove(endpoint);
        WebhookList.SelectedIndex = _webhooks.Count > 0 ? 0 : -1;
    }

    private async void SendWebhookButton_Click(object sender, RoutedEventArgs e)
    {
        if (WebhookList.SelectedItem is WebhookEndpoint endpoint)
        {
            await SendEndpointAsync(endpoint);
        }
    }

    private async void ThinkButton_Click(object sender, RoutedEventArgs e)
    {
        await RunThinkingAsync();
    }

    private void TestNotificationButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            _notificationService.ShowTestNotification();
            AppendLog("Windows test notification sent.");
        }
        catch (Exception ex)
        {
            AppendLog($"Windows test notification failed: {ex.Message}");
        }
    }

    private void AddHeaderButton_Click(object sender, RoutedEventArgs e)
    {
        if (WebhookList.SelectedItem is not WebhookEndpoint endpoint || string.IsNullOrWhiteSpace(HeaderKeyTextBox.Text))
        {
            return;
        }

        endpoint.Headers.Add(new WebhookKeyValue { Key = HeaderKeyTextBox.Text.Trim(), Value = HeaderValueTextBox.Text });
        HeaderKeyTextBox.Text = string.Empty;
        HeaderValueTextBox.Text = string.Empty;
    }

    private void AddValueButton_Click(object sender, RoutedEventArgs e)
    {
        if (WebhookList.SelectedItem is not WebhookEndpoint endpoint || string.IsNullOrWhiteSpace(ValueKeyTextBox.Text))
        {
            return;
        }

        endpoint.Values.Add(new WebhookKeyValue { Key = ValueKeyTextBox.Text.Trim(), Value = ValueValueTextBox.Text });
        ValueKeyTextBox.Text = string.Empty;
        ValueValueTextBox.Text = string.Empty;
    }

    private static string FormatNullablePrice(double? value) => value is null ? "-" : FormatPrice(value.Value);

    private static string FormatPrice(double value) => value >= 100
        ? value.ToString("N2")
        : value.ToString("N4");

    private static SolidColorBrush Brush(uint argb)
    {
        return new SolidColorBrush(ColorHelper.FromArgb(
            (byte)((argb & 0xFF000000) >> 24),
            (byte)((argb & 0x00FF0000) >> 16),
            (byte)((argb & 0x0000FF00) >> 8),
            (byte)(argb & 0x000000FF)));
    }

}
