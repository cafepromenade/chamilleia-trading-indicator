using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ChamSD_Desktop;

public sealed class MarketDataService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _http = new()
    {
        Timeout = TimeSpan.FromSeconds(14),
    };

    public async Task<IReadOnlyList<MarketCandle>> GetCandlesAsync(string symbol, string interval, CancellationToken cancellationToken)
    {
        var url = $"https://biquote.io/api/{Uri.EscapeDataString(symbol)}/ohlc?interval={Uri.EscapeDataString(interval)}&_={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
        using var response = await _http.GetAsync(url, cancellationToken);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var candles = ParseBiquotePayload(document.RootElement.GetRawText());
        if (candles.Count == 0)
        {
            throw new InvalidOperationException("The live data server returned no valid candles.");
        }
        EnsureFreshCandles(candles, interval, DateTimeOffset.UtcNow);

        return candles;
    }

    public static IReadOnlyList<MarketCandle> ParseBiquotePayload(string json)
    {
        var payload = JsonSerializer.Deserialize<BiQuotePayload>(json, JsonOptions);
        if (payload?.Bars is null || payload.Bars.Count == 0)
        {
            throw new InvalidOperationException("The live data server returned no candles.");
        }

        var candles = payload.Bars
            .Select(ParseBar)
            .Where(candle => candle is not null)
            .Cast<MarketCandle>()
            .OrderBy(candle => candle.Time)
            .ToList();
        if (candles.Count == 0)
        {
            throw new InvalidOperationException("The live data server returned no valid candles.");
        }

        return candles;
    }

    public static void EnsureFreshCandles(IReadOnlyList<MarketCandle> candles, string interval, DateTimeOffset now)
    {
        if (candles.Count == 0)
        {
            throw new InvalidOperationException($"Live {FormatInterval(interval)} candles are unavailable.");
        }

        var newest = candles[^1].Time.ToUniversalTime();
        var age = now.ToUniversalTime() - newest;
        if (age > MaxAgeForInterval(interval))
        {
            throw new InvalidOperationException($"Live {FormatInterval(interval)} candles are stale. Newest candle is {newest.ToLocalTime():MMM d, HH:mm zzz}.");
        }
    }

    private static TimeSpan MaxAgeForInterval(string interval)
    {
        return interval.ToLowerInvariant() switch
        {
            "5m" => TimeSpan.FromMinutes(90),
            "15m" => TimeSpan.FromHours(3),
            "30m" => TimeSpan.FromHours(6),
            "1h" => TimeSpan.FromHours(12),
            "4h" => TimeSpan.FromHours(48),
            "1d" => TimeSpan.FromDays(10),
            _ => TimeSpan.FromMinutes(90),
        };
    }

    private static string FormatInterval(string interval)
    {
        return interval.ToUpperInvariant();
    }

    private static MarketCandle? ParseBar(BiQuoteBar bar)
    {
        if (!DateTimeOffset.TryParse(bar.OpenTime, out var time))
        {
            return null;
        }

        var open = Number(bar.Open);
        var high = Number(bar.High);
        var low = Number(bar.Low);
        var close = Number(bar.Close);
        var volume = Number(bar.TickVolume.ValueKind == JsonValueKind.Undefined ? bar.Volume : bar.TickVolume);
        if (open is null || high is null || low is null || close is null || volume is null || high < low)
        {
            return null;
        }

        return new MarketCandle(time, open.Value, high.Value, low.Value, close.Value, volume.Value);
    }

    private static double? Number(JsonElement value)
    {
        return value.ValueKind switch
        {
            JsonValueKind.Number => value.TryGetDouble(out var result) && double.IsFinite(result) ? result : null,
            JsonValueKind.String => double.TryParse(value.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var result) && double.IsFinite(result) ? result : null,
            _ => null,
        };
    }

    private sealed class BiQuotePayload
    {
        [JsonPropertyName("bars")]
        public List<BiQuoteBar> Bars { get; set; } = new();
    }

    private sealed class BiQuoteBar
    {
        [JsonPropertyName("openTime")]
        public string? OpenTime { get; set; }

        [JsonPropertyName("open")]
        public JsonElement Open { get; set; }

        [JsonPropertyName("high")]
        public JsonElement High { get; set; }

        [JsonPropertyName("low")]
        public JsonElement Low { get; set; }

        [JsonPropertyName("close")]
        public JsonElement Close { get; set; }

        [JsonPropertyName("tickVolume")]
        public JsonElement TickVolume { get; set; }

        [JsonPropertyName("volume")]
        public JsonElement Volume { get; set; }
    }
}
