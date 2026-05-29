using System.Diagnostics;
using System.Text;

namespace ChamSD_Desktop;

public sealed class OpenCodeThinkingService
{
    private const string FreePredictionModel = "opencode/deepseek-v4-flash-free";
    private const int MaxOutputLength = 5000;

    public async Task<string> ThinkAsync(string prompt, CancellationToken cancellationToken)
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
            startInfo.ArgumentList.Add(FreePredictionModel);
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
            startInfo.ArgumentList.Add(FreePredictionModel);
            startInfo.ArgumentList.Add(prompt);
        }

        using var process = Process.Start(startInfo) ?? throw new InvalidOperationException("Could not start opencode.");
        var outputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var errorTask = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);

        var output = await outputTask;
        var error = await errorTask;
        var text = new StringBuilder();
        if (!string.IsNullOrWhiteSpace(output))
        {
            text.AppendLine(output.Trim());
        }

        if (!string.IsNullOrWhiteSpace(error))
        {
            text.AppendLine(error.Trim());
        }

        if (process.ExitCode != 0)
        {
            text.Insert(0, $"opencode exited with code {process.ExitCode}.{Environment.NewLine}");
        }

        var result = StripAnsi(text.ToString()).Trim();
        if (result.Contains("Unauthorized", StringComparison.OrdinalIgnoreCase) ||
            result.Contains("Authentication Fails", StringComparison.OrdinalIgnoreCase))
        {
            return $"OpenCode is installed, but the free model {FreePredictionModel} is not authorized. Run opencode providers login, then press Predict again.";
        }

        return result.Length > MaxOutputLength ? result[..MaxOutputLength] + Environment.NewLine + "[truncated]" : result;
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
