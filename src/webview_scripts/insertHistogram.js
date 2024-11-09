// var containerRect = histogramContainer.getBoundingClientRect();
// const svgHeight = 700; // containerRect.height;
// const svgWidth = 260; // containerRect.width;

function insertHistogram() {
  let histogramNodesJson = localStorage.getItem("histogramNodes");
  let histogramNodes = JSON.parse(histogramNodesJson);

  let errorMessageContainer = document.getElementById("errorMessage");
  let visualizationContainer = document.getElementById(
    "visualization-container"
  );

  if (histogramNodes.length === 0) {
    errorMessageContainer.textContent = "No histogram data found";
    visualizationContainer.style.display = "none";
    return;
  } else {
    errorMessageContainer.textContent = "";
    visualizationContainer.style.display = "initial";
  }

  var bodyRect = document.body.getBoundingClientRect();

  svgWidth = bodyRect.width - 20; // leave some space
  svgHeight = bodyRect.height - 50; // leave some space

  Array.from(document.body.children).forEach((child) => {
    if (child.id !== "visualization-container") {
      svgHeight -= child.getBoundingClientRect().height;
    }
  });

  let metricValues = histogramNodes.map((node) => node.metricValue);
  const metricMax = Math.max(...metricValues);
  const barHeight = svgHeight / histogramNodes.length;

  // Generate colors ranging from green to red, based on metric value.
  const colors = metricValues.map(
    (metricValue) =>
      `rgb(${Math.floor((255 * metricValue) / metricMax)}, ${Math.floor(
        255 * (1 - metricValue / metricMax)
      )}, 0)`
  );

  let barsHtml = histogramNodes
    .map((histogramNode, index) => {
      const maxBarWidth = svgWidth * 0.9;
      const barWidth = (histogramNode.metricValue / metricMax) * maxBarWidth;
      const color = colors[index];

      // Place identifier in middle of bar.
      const yTextPosition = index * barHeight + barHeight / 2;

      // TODO: Add icon based on NodeType.
      return `
        <rect index=${index}
          x="20" y="${index * barHeight}"
          width="${barWidth + 1}"
          height="${barHeight}"
          fill="${color}">
        </rect>
        <text x="0" y="${yTextPosition}" fill="white" text-anchor="start" font-size="12">${
        histogramNode.displayName
      }</text>
      `;
    })
    .join("");

  visualizationContainer.innerHTML = barsHtml;

  visualizationContainer.addEventListener("click", function (event) {
    var index = Math.floor(event.offsetY / barHeight); // event.target.attributes.index.value;
    var histogramNode = histogramNodes[index];
    vscodeApi.postMessage({
      command: "showRange",
      startLine: histogramNode.startLine,
      endLine: histogramNode.endLine,
    });
  });

  insertHistogramVisibleRangeIndicator();
}

function insertHistogramVisibleRangeIndicator() {
  var histogramNodesJson = localStorage.getItem("histogramNodes");
  var histogramNodes = JSON.parse(histogramNodesJson);

  var visibleRangeJson = localStorage.getItem("indicatedRange");
  var visibleRange = JSON.parse(visibleRangeJson);

  if (histogramNodes.length === 0) {
    return;
  }

  // Remove old visible range indicator (if present).
  document.getElementById("visible-range-indicator")?.remove();

  var firstVisibleNodeIndex = histogramNodes.findIndex(
    (node) => node.endLine >= visibleRange.startLine
  );
  var lastVisibleNodeIndex = histogramNodes.findIndex(
    (node) => node.endLine >= visibleRange.endLine
  );

  if (lastVisibleNodeIndex === -1) {
    lastVisibleNodeIndex = histogramNodes.length - 1;
  }

  if (firstVisibleNodeIndex === -1) {
    console.log("Encountered visible range outside histogramnode range.");
    return;
  }

  const barHeight = svgHeight / histogramNodes.length;

  var firstVisibleNode = histogramNodes[firstVisibleNodeIndex];
  var lastVisibleNode = histogramNodes[lastVisibleNodeIndex];

  var portionOfFirstRangeVisible =
    (firstVisibleNode.endLine - visibleRange.startLine + 1) /
    (firstVisibleNode.endLine - firstVisibleNode.startLine + 1);
  var portionOfFirstRangeNotVisible = 1 - portionOfFirstRangeVisible;
  var visibleRangeIndicatorY =
    (firstVisibleNodeIndex + portionOfFirstRangeNotVisible) * barHeight;

  var portionOfLastRangeVisible =
    (visibleRange.endLine - lastVisibleNode.startLine + 1) /
    (lastVisibleNode.endLine - lastVisibleNode.startLine + 1);

  var visibleRangeIndicatorHeight = portionOfFirstRangeVisible * barHeight;
  if (firstVisibleNodeIndex < lastVisibleNodeIndex) {
    visibleRangeIndicatorHeight += portionOfLastRangeVisible * barHeight;
    visibleRangeIndicatorHeight +=
      (lastVisibleNodeIndex - firstVisibleNodeIndex - 1) * barHeight;
  }

  var visibleRangeIndicatorHtml = `<rect id="visible-range-indicator"
          x="20" y="${visibleRangeIndicatorY}"
          width="${svgWidth}"
          height="${visibleRangeIndicatorHeight}"
          fill="rgb(100, 100, 100, 0.5)">
        </rect>`;

  var visualizationContainer = document.getElementById(
    "visualization-container"
  );
  visualizationContainer.innerHTML += visibleRangeIndicatorHtml;
}
