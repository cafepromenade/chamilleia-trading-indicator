using System.Text;
using System.Text.RegularExpressions;

namespace ChamSD_Desktop;

public sealed record PredictionSections(string Model, string Thinking, string Prediction, string Invalidation, string FinalRead);

public static class PredictionParser
{
    public static PredictionSections Parse(string output, string fallbackFinalRead)
    {
        var sections = new Dictionary<string, StringBuilder>(StringComparer.OrdinalIgnoreCase)
        {
            ["THINKING"] = new(),
            ["PREDICTION"] = new(),
            ["INVALIDATION"] = new(),
            ["FINAL BOT READ"] = new(),
        };
        var normalized = output.Replace("\r", string.Empty).Replace("**", string.Empty);
        var model = ExtractModel(normalized);
        var matches = Regex.Matches(normalized, "(THINKING|PREDICTION|INVALIDATION|FINAL\\s+BOT\\s+READ)\\s*:", RegexOptions.IgnoreCase);
        for (var index = 0; index < matches.Count; index++)
        {
            var match = matches[index];
            var key = Regex.Replace(match.Groups[1].Value, "\\s+", " ").ToUpperInvariant();
            var start = match.Index + match.Length;
            var end = index + 1 < matches.Count ? matches[index + 1].Index : normalized.Length;
            var value = normalized[start..end].Trim();
            if (!string.IsNullOrWhiteSpace(value) && sections.TryGetValue(key, out var section))
            {
                section.AppendLine(value.TrimStart('-', '*', ' '));
            }
        }

        string? currentSection = null;

        foreach (var rawLine in matches.Count == 0 ? normalized.Split('\n') : Array.Empty<string>())
        {
            var line = rawLine.Trim();
            var heading = line.TrimEnd(':');
            if (sections.ContainsKey(heading))
            {
                currentSection = heading;
                continue;
            }

            var inlineHeading = sections.Keys.FirstOrDefault(key => line.StartsWith($"{key}:", StringComparison.OrdinalIgnoreCase));
            if (inlineHeading is not null)
            {
                currentSection = inlineHeading;
                var inlineText = line[(inlineHeading.Length + 1)..].Trim();
                if (!string.IsNullOrWhiteSpace(inlineText))
                {
                    sections[currentSection].AppendLine(inlineText.TrimStart('-', '*', ' '));
                }

                continue;
            }

            if (currentSection is not null && !string.IsNullOrWhiteSpace(line))
            {
                sections[currentSection].AppendLine(line.TrimStart('-', '*', ' '));
            }
        }

        var thinking = Clean(sections["THINKING"].ToString());
        var prediction = Clean(sections["PREDICTION"].ToString());
        var invalidation = Clean(sections["INVALIDATION"].ToString());
        var finalRead = Clean(sections["FINAL BOT READ"].ToString());

        if (string.IsNullOrWhiteSpace(thinking) && string.IsNullOrWhiteSpace(prediction) && string.IsNullOrWhiteSpace(invalidation))
        {
            thinking = Clean(output);
            prediction = "OpenCode returned one block of text, so the app kept it in Thinking.";
            invalidation = "No separate invalidation section was returned.";
        }

        return new PredictionSections(
            string.IsNullOrWhiteSpace(model) ? OpenCodeThinkingService.DisplayModelLabel : model,
            string.IsNullOrWhiteSpace(thinking) ? "OpenCode did not return a thinking section." : thinking,
            string.IsNullOrWhiteSpace(prediction) ? "OpenCode did not return a prediction section." : prediction,
            string.IsNullOrWhiteSpace(invalidation) ? "OpenCode did not return an invalidation section." : invalidation,
            string.IsNullOrWhiteSpace(finalRead) ? fallbackFinalRead : finalRead);
    }

    private static string ExtractModel(string normalized)
    {
        var match = Regex.Match(normalized, "^\\s*MODEL\\s*:\\s*(.+?)\\s*$", RegexOptions.IgnoreCase | RegexOptions.Multiline);
        return match.Success ? Clean(match.Groups[1].Value) : string.Empty;
    }

    public static string Clean(string text)
    {
        var cleaned = string.Join(
            " ",
            text.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
                .Select(line => line.Trim())
                .Where(line => !line.StartsWith(">", StringComparison.Ordinal)));
        return cleaned.Length > 220 ? cleaned[..220] + "..." : cleaned;
    }
}
