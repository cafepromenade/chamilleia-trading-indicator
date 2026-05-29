using System.Diagnostics;
using System.Text;

namespace ChamSD_Desktop;

public sealed class OpenCodeThinkingService
{
    public const string DisplayModelLabel = "free model auto";

    public static readonly IReadOnlyList<string> FreePredictionModels =
    [
        "opencode/deepseek-v4-flash-free",
        "opencode/mimo-v2.5-free",
        "opencode/nemotron-3-super-free",
    ];

    private const int MaxOutputLength = 5000;

    public async Task<string> ThinkAsync(string prompt, CancellationToken cancellationToken)
    {
        var failures = new List<string>();
        foreach (var model in FreePredictionModels)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                var result = await RunModelAsync(model, prompt, cancellationToken);
                if (IsUsableModelOutput(result))
                {
                    return $"MODEL: {ShortModelName(model)}{Environment.NewLine}{result}";
                }

                failures.Add($"{ShortModelName(model)} returned no usable prediction.");
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                failures.Add($"{ShortModelName(model)} failed: {ex.Message}");
            }
        }

        var failureText = string.Join(" ", failures);
        return $"""
THINKING: OpenCode tried the free model ladder, but none returned a clean answer. {failureText}
PREDICTION: Keep the current bot status until a free OpenCode model answers.
INVALIDATION: No extra AI invalidation was produced; use the built-in strategy engine invalidation rules.
FINAL BOT READ: STATUS: WAIT
""";
    }

    private static async Task<string> RunModelAsync(string model, string prompt, CancellationToken cancellationToken)
    {
        var opencodePath = FindOpenCodeScript();
        var startInfo = new ProcessStartInfo
        {
            FileName = opencodePath is null ? "opencode" : "powershell.exe",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            WorkingDirectory = AppContext.BaseDirectory,
        };

        if (opencodePath is null)
        {
            startInfo.ArgumentList.Add("run");
            startInfo.ArgumentList.Add("-m");
            startInfo.ArgumentList.Add(model);
            startInfo.ArgumentList.Add(prompt);
        }
        else
        {
            startInfo.ArgumentList.Add("-NoProfile");
            startInfo.ArgumentList.Add("-ExecutionPolicy");
            startInfo.ArgumentList.Add("Bypass");
            startInfo.ArgumentList.Add("-File");
            startInfo.ArgumentList.Add(opencodePath);
            startInfo.ArgumentList.Add("run");
            startInfo.ArgumentList.Add("-m");
            startInfo.ArgumentList.Add(model);
            startInfo.ArgumentList.Add(prompt);
        }

        using var process = Process.Start(startInfo) ?? throw new InvalidOperationException("Could not start opencode.");
        using var attemptTimeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        attemptTimeout.CancelAfter(TimeSpan.FromSeconds(24));

        try
        {
            var outputTask = process.StandardOutput.ReadToEndAsync(attemptTimeout.Token);
            var errorTask = process.StandardError.ReadToEndAsync(attemptTimeout.Token);
            await process.WaitForExitAsync(attemptTimeout.Token);
            var output = await outputTask;
            var error = await errorTask;
            return CleanProcessResult(process.ExitCode, output, error, model);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            TryKill(process);
            throw new TimeoutException("timed out after 24 seconds.");
        }
    }

    private static string CleanProcessResult(int exitCode, string output, string error, string model)
    {
        var text = new StringBuilder();
        if (!string.IsNullOrWhiteSpace(output))
        {
            text.AppendLine(output.Trim());
        }

        if (!string.IsNullOrWhiteSpace(error))
        {
            text.AppendLine(error.Trim());
        }

        if (exitCode != 0)
        {
            text.Insert(0, $"opencode exited with code {exitCode}.{Environment.NewLine}");
        }

        var result = StripAnsi(text.ToString()).Trim();
        if (result.Contains("Unauthorized", StringComparison.OrdinalIgnoreCase) ||
            result.Contains("Authentication Fails", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"{model} is not authorized. Run opencode providers login, then press Predict again.");
        }

        return result.Length > MaxOutputLength ? result[..MaxOutputLength] + Environment.NewLine + "[truncated]" : result;
    }

    private static bool IsUsableModelOutput(string text)
    {
        return !string.IsNullOrWhiteSpace(text) &&
            !text.Contains("opencode exited with code", StringComparison.OrdinalIgnoreCase) &&
            !text.Contains("Error:", StringComparison.OrdinalIgnoreCase) &&
            (text.Contains("THINKING", StringComparison.OrdinalIgnoreCase) ||
                text.Contains("PREDICTION", StringComparison.OrdinalIgnoreCase) ||
                text.Trim().Length > 20);
    }

    private static string ShortModelName(string model)
    {
        var slash = model.LastIndexOf('/');
        return slash >= 0 ? model[(slash + 1)..] : model;
    }

    private static void TryKill(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch
        {
        }
    }

    private static string? FindOpenCodeScript()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        var candidate = Path.Combine(appData, "npm", "opencode.ps1");
        return File.Exists(candidate) ? candidate : null;
    }

    private static string StripAnsi(string text)
    {
        var builder = new StringBuilder(text.Length);
        var inEscape = false;

        foreach (var character in text)
        {
            if (character == '\u001b')
            {
                inEscape = true;
                continue;
            }

            if (inEscape)
            {
                if (char.IsLetter(character))
                {
                    inEscape = false;
                }

                continue;
            }

            builder.Append(character);
        }

        return builder.ToString();
    }
}
