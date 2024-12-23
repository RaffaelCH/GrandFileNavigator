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
  svgHeight = bodyRect.height - 20; // leave some space

  Array.from(document.body.children).forEach((child) => {
    if (child.id !== "visualization-container") {
      svgHeight -= child.getBoundingClientRect().height;
    }
  });

  visualizationContainer.style.height = svgHeight;

  let metricValues = histogramNodes.map((node) => node.metricValue);
  const metricMax = Math.max(...metricValues);
  const barHeight = (svgHeight - 5) / histogramNodes.length; // -5 to make space for text

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
      const yTextPosition = (index + 1) * barHeight + 2;

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

  insertPositionHistoryIndicators();

  visualizationContainer.addEventListener("click", function (event) {
    var index = Math.floor(event.offsetY / barHeight); // event.target.attributes.index.value;
    var histogramNode = histogramNodes[index];
    vscodeApi.postMessage({
      command: "showRange",
      startLine: histogramNode.startLine,
      endLine: histogramNode.endLine,
    });
  });
}

function insertPositionHistoryIndicators() {
  let histogramNodesJson = localStorage.getItem("histogramNodes");
  let histogramNodes = JSON.parse(histogramNodesJson);

  let previousRangesJson = localStorage.getItem("previousRanges");
  let previousRanges = JSON.parse(previousRangesJson);

  var positionIndicatorsHtml = "";

  previousRanges.map((previousRange, index) => {
    let yPosition =
      (svgHeight - 5) *
      (previousRange[0].line /
        histogramNodes[histogramNodes.length - 1].endLine);
    let positionIndicatorHtml = `<circle class="previous-range-indicator" cx="${
      svgWidth * 0.95
    }" cy="${yPosition}" r="8" fill="lightblue"></circle>
    <text  class="previous-range-indicator" x="${svgWidth * 0.95 - 4}" y="${
      yPosition + 6
    }" fill="black" font-size="16">${index + 1}</text>`;
    positionIndicatorsHtml += positionIndicatorHtml;
  });

  var visualizationContainer = document.getElementById(
    "visualization-container"
  );

  const rangeIndicators = Array.from(
    document.getElementsByClassName("previous-range-indicator")
  );
  for (let i = 0; i < rangeIndicators.length; ++i) {
    rangeIndicators[i].remove();
  }
  visualizationContainer.innerHTML += positionIndicatorsHtml;
}

function insertHistogramVisibleRangeIndicator() {
  var histogramNodesJson = localStorage.getItem("histogramNodes");
  var histogramNodes = JSON.parse(histogramNodesJson);

  var visibleRangeJson = localStorage.getItem("indicatedRange");
  var visibleRange = JSON.parse(visibleRangeJson);

  var visualizationContainer = document.getElementById(
    "visualization-container"
  );

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

  var totalBarsHeight = visualizationContainer.height.baseVal.value - 5;
  const barHeight = totalBarsHeight / histogramNodes.length;

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

  visualizationContainer.innerHTML += visibleRangeIndicatorHtml;
}
