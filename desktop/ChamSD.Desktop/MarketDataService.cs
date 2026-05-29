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
        var payload = await JsonSerializer.DeserializeAsync<BiQuotePayload>(stream, JsonOptions, cancellationToken);
        if (payload?.Bars is null || payload.Bars.Count == 0)
        {
            throw new InvalidOperationException("The live data server returned no candles.");
        }

        return payload.Bars
            .Select(ParseBar)
            .Where(candle => candle is not null)
            .Cast<MarketCandle>()
            .OrderBy(candle => candle.Time)
            .ToList();
    }

    private static MarketCandle? ParseBar(BiQuoteBar bar)
    {
        if (!DateTimeOffset.TryParse(bar.OpenTime, out var time))
        {
            return null;
        }

        return new MarketCandle(
            time,
            Number(bar.Open),
            Number(bar.High),
            Number(bar.Low),
            Number(bar.Close),
            Number(bar.TickVolume.ValueKind == JsonValueKind.Undefined ? bar.Volume : bar.TickVolume));
    }

    private static double Number(JsonElement value)
    {
        return value.ValueKind switch
        {
            JsonValueKind.Number => value.TryGetDouble(out var result) ? result : 0,
            JsonValueKind.String => double.TryParse(value.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var result) ? result : 0,
            _ => 0,
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
