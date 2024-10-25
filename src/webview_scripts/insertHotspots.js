// var containerRect = histogramContainer.getBoundingClientRect();
// const svgHeight = 700; // containerRect.height;
// const svgWidth = 260; // containerRect.width;

function insertHotspotNodes() {
  var hotspotNodesJson = localStorage.getItem("hotspotNodes");
  var hotspotNodes = JSON.parse(hotspotNodesJson);

  var hotspotsContainer = document.getElementById("hotspots-container");
  var visualizationContainer = document.getElementById(
    "visualization-container"
  );
  let errorMessageContainer = document.getElementById("errorMessage");

  if (hotspotNodes.length === 0) {
    errorMessageContainer.textContent = "No hotspot data found";
    visualizationContainer.style.display = "none";
    return;
  } else {
    errorMessageContainer.textContent = "";
    visualizationContainer.style.display = "initial";
    hotspotsContainer.style.display = "flex";
    document.getElementById("histogram-container").style.display = "none";
  }

  addHotspotsHtmlToContainer(hotspotNodes, hotspotsContainer);
}

function addHotspotsHtmlToContainer(hotspots, viewContainer) {
  // TODO: Add visible range indicator.

  if (hotspots.length === 0) {
    return;
  }

  const metricMax = Math.max(...hotspots.map((hotspot) => hotspot.importance));
  const totalLineCount = hotspots.reduce((accumulator, hotspot) => {
    return accumulator + hotspot.importance;
  }, 0);
  const hotspotsSeparatorCount = hotspots.length;
  var pixelPerLine = (svgHeight - hotspotsSeparatorCount) / totalLineCount;

  // Generate colors ranging from green to red, based on importance.
  const colors = hotspots.map(
    (hotspot) =>
      `rgb(${Math.floor((255 * hotspot.importance) / metricMax)}, ${Math.floor(
        255 * (1 - hotspot.importance / metricMax)
      )}, 0)`
  );

  let barsHtml = "";
  const maxBarWidth = svgWidth * 0.9;

  let yPosition = 0;
  for (let i = 0; i < hotspots.length; ++i) {
    let hotspot = hotspots[i];

    const barWidth = (hotspot.importance / metricMax) * maxBarWidth;
    const hotspotLinesCount = hotspot.symbolEndLine - hotspot.symbolLine; // TODO: Adjust on a per-line basis.
    const barHeight = Math.max(pixelPerLine * hotspotLinesCount, 1);
    const color = colors[i];

    barsHtml += `
        <rect index=${i}
          x="20" y="${yPosition}"
          width="${barWidth + 1}"
          height="${barHeight}"
          fill="${color}">
        </rect>
      `;

    yPosition += barHeight;
    yPosition += 1; // Space for node separator.
  }

  viewContainer.innerHtml = barsHtml;

  viewContainer.addEventListener("click", function (event) {
    var index = event.target.attributes.index.value;
    var hotspot = hotspots[index];
    vscodeApi.postMessage({
      command: "showRange",
      startLine: hotspot.symbolLine,
      endLine: hotspot.symbolEndLine,
    });
  });
}
