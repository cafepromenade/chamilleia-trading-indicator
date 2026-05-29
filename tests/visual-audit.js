const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");

const viewports = [
  { name: "desktop", width: 1366, height: 768 },
  { name: "wide", width: 1920, height: 1080 },
  { name: "mobile", width: 390, height: 844 },
];

const selectors = [
  "#live-status-bar",
  "#engine-output",
  ".market-controls",
  ".live-chart",
  "#live-candlestick-chart",
  ".status-panel",
  ".engine-card",
  ".risk-box",
  "#prediction-panel",
  ".prediction-grid",
  ".install-actions",
];

const docsRoot = path.resolve(__dirname, "..", "docs");
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

function createStaticServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const relativePath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const filePath = path.resolve(docsRoot, relativePath);
    if (!filePath.startsWith(docsRoot)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, { "Content-Type": contentTypes.get(path.extname(filePath)) || "application/octet-stream" });
      response.end(data);
    });
  });
}

(async () => {
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const failures = [];

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      await page.goto(`${baseUrl}/?visualaudit=${Date.now()}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(8000);
      await page.screenshot({ path: `artifacts/visual-${viewport.name}.png`, fullPage: true });
      const data = await page.evaluate((selectorList) => {
        const measurements = selectorList.map((selector) => {
          const element = document.querySelector(selector);
          if (!element) {
            return { selector, missing: true };
          }

          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            selector,
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            scrollWidth: element.scrollWidth,
            scrollHeight: element.scrollHeight,
            clientWidth: element.clientWidth,
            clientHeight: element.clientHeight,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            text: element.innerText?.slice(0, 110),
          };
        });

        return {
          status: document.querySelector("#engine-output")?.innerText,
          chartStatus: document.querySelector("#chart-status")?.innerText,
          bodyWidth: document.body.scrollWidth,
          bodyHeight: document.body.scrollHeight,
          innerWidth,
          innerHeight,
          clipped: measurements.filter((item) => {
            if (item.missing) {
              return false;
            }

            const horizontalClip = item.scrollWidth > item.clientWidth + 2 && item.overflowX === "hidden";
            const verticalClip = item.scrollHeight > item.clientHeight + 2 && item.overflowY === "hidden";
            return horizontalClip || verticalClip;
          }),
          measurements,
        };
      }, selectors);
      if (data.bodyWidth > viewport.width + 2) {
        failures.push(`${viewport.name}: body is wider than viewport (${data.bodyWidth} > ${viewport.width})`);
      }

      for (const item of data.clipped) {
        failures.push(`${viewport.name}: ${item.selector} clips content with hidden overflow`);
      }

      results.push({ viewport, data });
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(JSON.stringify(results, null, 2));
  if (failures.length > 0) {
    throw new Error(`Visual audit failed:\n${failures.join("\n")}`);
  }
})();
