using System.Text.Json;
using System.Text.Json.Serialization;

namespace ChamSD_Desktop;

public sealed class WebhookSettingsService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
    };

    private readonly string _settingsPath;

    public WebhookSettingsService()
        : this(null)
    {
    }

    public WebhookSettingsService(string? settingsPath)
    {
        _settingsPath = settingsPath ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ChamSD.Desktop",
            "webhooks.json");
    }

    public async Task<IReadOnlyList<WebhookEndpoint>> LoadAsync(CancellationToken cancellationToken = default)
    {
        if (!File.Exists(_settingsPath))
        {
            return Array.Empty<WebhookEndpoint>();
        }

        await using var stream = File.OpenRead(_settingsPath);
        var saved = await JsonSerializer.DeserializeAsync<List<SavedWebhookEndpoint>>(stream, JsonOptions, cancellationToken);
        var endpoints = saved?.Select(ToEndpoint).ToList();
        if (endpoints is null)
        {
            return Array.Empty<WebhookEndpoint>();
        }

        return endpoints;
    }

    public async Task SaveAsync(IEnumerable<WebhookEndpoint> endpoints, CancellationToken cancellationToken = default)
    {
        var directory = Path.GetDirectoryName(_settingsPath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var saved = endpoints.Select(SavedWebhookEndpoint.FromEndpoint).ToList();
        await using var stream = File.Create(_settingsPath);
        await JsonSerializer.SerializeAsync(stream, saved, JsonOptions, cancellationToken);
    }

    private static WebhookEndpoint ToEndpoint(SavedWebhookEndpoint saved)
    {
        var endpoint = new WebhookEndpoint
        {
            Name = string.IsNullOrWhiteSpace(saved.Name) ? "Webhook" : saved.Name,
            Url = saved.Url ?? string.Empty,
            Method = string.Equals(saved.Method, "GET", StringComparison.OrdinalIgnoreCase) ? "GET" : "POST",
            Enabled = saved.Enabled,
            SendOnStatusChange = saved.SendOnStatusChange,
        };

        foreach (var header in saved.Headers ?? [])
        {
            endpoint.Headers.Add(new WebhookKeyValue { Key = header.Key ?? string.Empty, Value = header.Value ?? string.Empty });
        }

        foreach (var value in saved.Values ?? [])
        {
            endpoint.Values.Add(new WebhookKeyValue { Key = value.Key ?? string.Empty, Value = value.Value ?? string.Empty });
        }

        return endpoint;
    }

    private sealed class SavedWebhookEndpoint
    {
        public string? Name { get; set; }
        public string? Url { get; set; }
        public string? Method { get; set; }
        public bool Enabled { get; set; } = true;
        public bool SendOnStatusChange { get; set; }
        public List<SavedWebhookKeyValue>? Headers { get; set; }
        public List<SavedWebhookKeyValue>? Values { get; set; }

        public static SavedWebhookEndpoint FromEndpoint(WebhookEndpoint endpoint)
        {
            return new SavedWebhookEndpoint
            {
                Name = endpoint.Name,
                Url = endpoint.Url,
                Method = endpoint.Method,
                Enabled = endpoint.Enabled,
                SendOnStatusChange = endpoint.SendOnStatusChange,
                Headers = endpoint.Headers.Select(SavedWebhookKeyValue.FromKeyValue).ToList(),
                Values = endpoint.Values.Select(SavedWebhookKeyValue.FromKeyValue).ToList(),
            };
        }
    }

    private sealed class SavedWebhookKeyValue
    {
        [JsonPropertyName("key")]
        public string? Key { get; set; }

        [JsonPropertyName("value")]
        public string? Value { get; set; }

        public static SavedWebhookKeyValue FromKeyValue(WebhookKeyValue item)
        {
            return new SavedWebhookKeyValue
            {
                Key = item.Key,
                Value = item.Value,
            };
        }
    }
}
