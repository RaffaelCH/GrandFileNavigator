function insertHistogram() {
  var histogramNodesJson = localStorage.getItem("histogramNodes");
  var histogramNodes = JSON.parse(histogramNodesJson);

  let errorMessageContainer = document.getElementById("errorMessage");
  var histogramContainer = document.getElementById("histogram-container");

  if (histogramNodes.length === 0) {
    errorMessageContainer.textContent = "No histogram data found";
    return;
  } else {
    errorMessageContainer.textContent = "";
    histogramContainer.style.display = "initial";
    document.getElementById("hotspots-container").style.display = "none";
  }

  //var containerRect = histogramContainer.getBoundingClientRect();
  var metricValues = histogramNodes.map((node) => node.metricValue);

  // TODO: Don't hardcode dimensions.
  const metricMax = Math.max(...metricValues);
  const svgHeight = 800; // containerRect.height;
  const svgWidth = 260; // containerRect.width;
  const barHeight = (0.9 * svgHeight) / histogramNodes.length;

  // Generate colors ranging from green to red, based on metric value.
  const colors = metricValues.map(
    (metricValue) =>
      `rgb(${Math.floor((255 * metricValue) / metricMax)}, ${Math.floor(
        255 * (1 - metricValue / metricMax)
      )}, 0)`
  );

  let barsHtml = histogramNodes
    .map((histogramNode, index) => {
      const barWidth = (histogramNode.metricValue / metricMax) * svgWidth;
      const color = colors[index];

      // Determine whether to place the count inside or above the bar
      const yTextPosition = index * barHeight + barHeight / 2;

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

  histogramContainer.innerHTML = barsHtml;

  histogramContainer.addEventListener("click", function (event) {
    var index = event.target.attributes.index.value;
    var histogramNode = histogramNodes[index];
    vscodeApi.postMessage({
      command: "showRange",
      startLine: histogramNode.startLine,
      endLine: histogramNode.endLine,
    });
  });
}
