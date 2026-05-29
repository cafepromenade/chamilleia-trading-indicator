using System.Collections.ObjectModel;

namespace ChamSD_Desktop;

public sealed record MarketConfig(string Id, string Name, string Symbol)
{
    public override string ToString() => Name;
}

public sealed record MarketCandle(
    DateTimeOffset Time,
    double Open,
    double High,
    double Low,
    double Close,
    double Volume);

public sealed record Zone(double Top, double Bot, bool IsDemand, bool Invalidated, bool Tapped, int CreatedAt);

public sealed record Tap(double Top, double Bot, bool IsDemand, int Bar, bool WickOnlyNoBodyInZone);

public sealed class ChamilleiaLatest
{
    public string Label { get; init; } = "STATUS: WAIT";
    public string Note { get; init; } = string.Empty;
    public string ClassName { get; init; } = "wait";
    public int Bar { get; init; }
    public double Close { get; init; }
    public bool Bull { get; init; }
    public bool Bear { get; init; }
    public bool BuyTrigger { get; init; }
    public bool SellTrigger { get; init; }
    public bool APlusBuy { get; init; }
    public bool APlusSell { get; init; }
    public double? LastSwingHigh { get; init; }
    public double? LastSwingLow { get; init; }
    public Tap? LastTap { get; init; }
}

public sealed class ChamilleiaStatus
{
    public ChamilleiaLatest Latest { get; init; } = new();
    public IReadOnlyList<Zone> Zones { get; init; } = Array.Empty<Zone>();
    public IReadOnlyList<MarketCandle> Candles { get; init; } = Array.Empty<MarketCandle>();
}

public sealed class HtfBias
{
    public string Label { get; init; } = string.Empty;
    public string Direction { get; init; } = "neutral";
    public string Reason { get; init; } = string.Empty;
    public double Close { get; init; }
    public double? SwingHigh { get; init; }
    public double? SwingLow { get; init; }
    public double? IndicationLevel { get; init; }
}

public sealed class BiasChoice
{
    public string Direction { get; init; } = "neutral";
    public string Source { get; init; } = "1H";
    public string Reason { get; init; } = string.Empty;
}

public sealed class ChecklistItem
{
    public string Label { get; init; } = string.Empty;
    public bool Ok { get; init; }
    public string State => Ok ? "YES" : "WAIT";
    public string Text { get; init; } = string.Empty;
}

public sealed class RiskPlan
{
    public double? Entry { get; init; }
    public double? Stop { get; init; }
    public double? Risk { get; init; }
    public double? TargetOne { get; init; }
    public double? TargetTwo { get; init; }
    public double? StructureTarget { get; init; }
    public string Text { get; init; } = string.Empty;
    public string EntryMode { get; init; } = "-";
    public string ScaleOut { get; init; } = "75-90%";
    public bool StopWithinLimit { get; init; } = true;
}

public sealed class StrategyDecision
{
    public string Label { get; init; } = "STATUS: WAIT";
    public string Note { get; init; } = string.Empty;
    public string ClassName { get; init; } = "wait";
    public string Phase { get; init; } = "INDICATION";
    public int Confidence { get; init; }
    public BiasChoice Bias { get; init; } = new();
    public HtfBias D1Bias { get; init; } = new();
    public HtfBias M30Bias { get; init; } = new();
    public HtfBias M15Bias { get; init; } = new();
    public HtfBias H1Bias { get; init; } = new();
    public HtfBias H4Bias { get; init; } = new();
    public string SessionText { get; init; } = string.Empty;
    public bool SessionOk { get; init; }
    public ChamilleiaStatus Execution { get; init; } = new();
    public IReadOnlyList<ChecklistItem> Checklist { get; init; } = Array.Empty<ChecklistItem>();
    public RiskPlan Risk { get; init; } = new();
}

public sealed class WebhookKeyValue
{
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public string DisplayText => $"{Key}: {Value}";
}

public sealed class WebhookEndpoint
{
    public string Name { get; set; } = "New webhook";
    public string Url { get; set; } = string.Empty;
    public string Method { get; set; } = "POST";
    public bool Enabled { get; set; } = true;
    public bool SendOnStatusChange { get; set; }
    public ObservableCollection<WebhookKeyValue> Headers { get; } = new();
    public ObservableCollection<WebhookKeyValue> Values { get; } = new();
    public string DisplayName => $"{(Enabled ? "ON" : "OFF")} {Method} {Name}";
}
