using System.Net.Http.Json;

namespace ChamSD_Desktop;

public sealed class WebhookService
{
    private readonly HttpClient _http;

    public WebhookService()
        : this(new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(20),
        })
    {
    }

    public WebhookService(HttpClient http)
    {
        _http = http;
    }

    public async Task<string> SendAsync(
        WebhookEndpoint endpoint,
        MarketConfig market,
        StrategyDecision decision,
        CancellationToken cancellationToken)
    {
        if (!endpoint.Enabled)
        {
            return $"{endpoint.Name}: skipped because it is disabled.";
        }

        if (string.IsNullOrWhiteSpace(endpoint.Url))
        {
            return $"{endpoint.Name}: skipped because the URL is empty.";
        }

        var method = string.Equals(endpoint.Method, "GET", StringComparison.OrdinalIgnoreCase)
            ? HttpMethod.Get
            : HttpMethod.Post;
        var values = endpoint.Values
            .Where(item => !string.IsNullOrWhiteSpace(item.Key))
            .ToDictionary(item => item.Key, item => item.Value);

        var url = method == HttpMethod.Get
            ? AddQuery(endpoint.Url, BuildStatusValues(market, decision, values))
            : endpoint.Url;

        using var request = new HttpRequestMessage(method, url);
        foreach (var header in endpoint.Headers.Where(item => !string.IsNullOrWhiteSpace(item.Key)))
        {
            request.Headers.TryAddWithoutValidation(header.Key, header.Value);
        }

        if (method == HttpMethod.Post)
        {
            request.Content = JsonContent.Create(new
            {
                market = market.Name,
                symbol = market.Symbol,
                status = decision.Label,
                phase = decision.Phase,
                confidence = decision.Confidence,
                bias = decision.Bias.Direction,
                biasSource = decision.Bias.Source,
                note = decision.Note,
                lastClose = decision.Execution.Latest.Close,
                risk = new
                {
                    entry = decision.Risk.Entry,
                    stop = decision.Risk.Stop,
                    targetOne = decision.Risk.TargetOne,
                    targetTwo = decision.Risk.TargetTwo,
                    structureTarget = decision.Risk.StructureTarget,
                },
                values,
                sentAt = DateTimeOffset.UtcNow,
            });
        }

        using var response = await _http.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        var trimmed = body.Length > 240 ? body[..240] + "..." : body;
        return $"{endpoint.Name}: {(int)response.StatusCode} {response.ReasonPhrase} {trimmed}".Trim();
    }

    private static Dictionary<string, string> BuildStatusValues(MarketConfig market, StrategyDecision decision, Dictionary<string, string> customValues)
    {
        var values = new Dictionary<string, string>(customValues)
        {
            ["market"] = market.Name,
            ["symbol"] = market.Symbol,
            ["status"] = decision.Label,
            ["phase"] = decision.Phase,
            ["confidence"] = decision.Confidence.ToString(System.Globalization.CultureInfo.InvariantCulture),
            ["bias"] = decision.Bias.Direction,
            ["biasSource"] = decision.Bias.Source,
            ["lastClose"] = decision.Execution.Latest.Close.ToString(System.Globalization.CultureInfo.InvariantCulture),
        };
        return values;
    }

    private static string AddQuery(string url, IReadOnlyDictionary<string, string> values)
    {
        if (values.Count == 0)
        {
            return url;
        }

        var separator = url.Contains('?') ? "&" : "?";
        var query = string.Join("&", values.Select(item =>
            $"{Uri.EscapeDataString(item.Key)}={Uri.EscapeDataString(item.Value ?? string.Empty)}"));
        return $"{url}{separator}{query}";
    }
}
