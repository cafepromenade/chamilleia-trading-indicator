using System.Security;
using Windows.Data.Xml.Dom;
using Windows.UI.Notifications;

namespace ChamSD_Desktop;

public sealed class WindowsNotificationService
{
    public void ShowStatusNotification(MarketConfig market, StrategyDecision decision)
    {
        var xml = $"""
<toast scenario="reminder">
  <visual>
    <binding template="ToastGeneric">
      <text>{Escape(decision.Label)}</text>
      <text>{Escape($"{market.Name} | {decision.Phase} | {decision.Confidence}%")}</text>
      <text>{Escape(decision.Note)}</text>
    </binding>
  </visual>
</toast>
""";

        Show(xml, decision.Label);
    }

    public void ShowTestNotification()
    {
        const string xml = """
<toast scenario="reminder">
  <visual>
    <binding template="ToastGeneric">
      <text>ChamSD Windows alerts are on</text>
      <text>The desktop app can notify you when the live status changes.</text>
    </binding>
  </visual>
</toast>
""";

        Show(xml, "ChamSD Windows alerts");
    }

    private static void Show(string xml, string tag)
    {
        var document = new XmlDocument();
        document.LoadXml(xml);
        var notification = new ToastNotification(document)
        {
            Tag = SanitizeTag(tag),
            Group = "ChamSDStatus",
            ExpirationTime = DateTimeOffset.Now.AddMinutes(5),
        };

        ToastNotificationManager.CreateToastNotifier().Show(notification);
    }

    private static string Escape(string value)
    {
        return SecurityElement.Escape(value) ?? string.Empty;
    }

    private static string SanitizeTag(string value)
    {
        var safe = new string(value.Where(char.IsLetterOrDigit).Take(16).ToArray());
        return string.IsNullOrWhiteSpace(safe) ? "ChamSD" : safe;
    }
}
