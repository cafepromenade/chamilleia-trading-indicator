(function () {
  const statusOutput = document.querySelector("#status-output");
  const heroStatus = document.querySelector("#hero-status");
  const heroNote = document.querySelector("#hero-status-note");
  const form = document.querySelector(".signal-controls");
  const wickOnly = document.querySelector("#wickOnly");

  const states = [
    {
      label: "STATUS: WAIT",
      note: "No trade until the setup is complete.",
      className: "wait",
    },
    {
      label: "STATUS: BUY",
      note: "The chart is going up, touched the marked area, and moved up again.",
      className: "buy",
    },
    {
      label: "STATUS: SELL",
      note: "The chart is going down, touched the marked area, and moved down again.",
      className: "sell",
    },
  ];

  let heroIndex = 0;

  function setOutput(result) {
    statusOutput.className = `status-output ${result.className}`;
    statusOutput.querySelector(".status-title").textContent = result.label;
    statusOutput.querySelector(".status-reason").textContent = result.note;
  }

  function readValue(name) {
    const selected = document.querySelector(`input[name="${name}"]:checked`);
    return selected ? selected.value : "";
  }

  function calculateStatus() {
    const trend = readValue("trend");
    const tap = readValue("tap");
    const candleBreak = readValue("break");
    const clean = wickOnly.checked;

    if (trend === "up" && tap === "yes" && candleBreak === "up") {
      return {
        label: clean ? "STATUS: A+ BUY" : "STATUS: BUY",
        note: clean
          ? "Extra clean Buy idea. It still does not promise you will make money."
          : "Buy idea. Price moved up, came back, then moved up again.",
        className: "buy",
      };
    }

    if (trend === "down" && tap === "yes" && candleBreak === "down") {
      return {
        label: clean ? "STATUS: A+ SELL" : "STATUS: SELL",
        note: clean
          ? "Extra clean Sell idea. It still does not promise you will make money."
          : "Sell idea. Price moved down, came back, then moved down again.",
        className: "sell",
      };
    }

    if (trend === "flat") {
      return {
        label: "STATUS: NO TRADE",
        note: "Price is wiggling sideways. The helper says do nothing.",
        className: "no-trade",
      };
    }

    if (tap === "no") {
      return {
        label: trend === "up" ? "STATUS: WAIT FOR BUY" : "STATUS: WAIT FOR SELL",
        note: "Price is moving, but it has not come back to the marked area yet.",
        className: "wait",
      };
    }

    return {
      label: "STATUS: WAIT",
      note: "Some pieces match, but not enough. Waiting is the answer.",
      className: "wait",
    };
  }

  function rotateHeroStatus() {
    const state = states[heroIndex % states.length];
    heroStatus.textContent = state.label;
    heroNote.textContent = state.note;
    heroIndex += 1;
  }

  form.addEventListener("change", () => setOutput(calculateStatus()));
  setOutput(calculateStatus());
  rotateHeroStatus();
  setInterval(rotateHeroStatus, 3200);
})();
