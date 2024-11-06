// var containerRect = histogramContainer.getBoundingClientRect();
// const svgHeight = 700; // containerRect.height;
// const svgWidth = 260; // containerRect.width;

function insertHotspots() {
  let symbolNodesJson = localStorage.getItem("hotspotNodes");
  let symbolNodes = JSON.parse(symbolNodesJson);

  let errorMessageContainer = document.getElementById("errorMessage");
  let visualizationContainer = document.getElementById(
    "visualization-container"
  );

  if (symbolNodes.length === 0) {
    errorMessageContainer.textContent = "No hotspot data found";
    visualizationContainer.style.display = "none";
    return;
  } else {
    errorMessageContainer.textContent = "";
    visualizationContainer.style.display = "initial";
  }

  var containerRect = visualizationContainer.getBoundingClientRect();
  svgHeight = containerRect.height * 0.9; // leave some space
  svgWidth = containerRect.width * 0.9; // leave some space

  // Order hotspots by (starting) position in file.
  symbolNodes = symbolNodes.sort((a, b) => a.startLine - b.startLine);

  const metricMax = Math.max(
    ...symbolNodes.map((symbolNode) => symbolNode.metricValue)
  );
  const totalLineCount = symbolNodes.reduce((accumulator, symbolNode) => {
    return accumulator + (symbolNode.endLine - symbolNode.startLine);
  }, 0);
  const separatorCount = symbolNodes.length; // TODO: Maybe do additional filtering, based on number of elements/sidebar size.
  var pixelPerLine = (svgHeight - separatorCount) / totalLineCount;

  // Generate colors ranging from green to red, based on importance.
  const colors = symbolNodes.map(
    (symbolNode) =>
      `rgb(${Math.floor(
        (255 * symbolNode.metricValue) / metricMax
      )}, ${Math.floor(255 * (1 - symbolNode.metricValue / metricMax))}, 0)`
  );

  const maxBarWidth = svgWidth * 0.9;
  let yPosition = 0;

  let symbolNodesHtml = symbolNodes
    .map((symbolNode, index) => {
      const barWidth = (symbolNode.metricValue / metricMax) * maxBarWidth;
      const hotspotLinesCount = symbolNode.endLine - symbolNode.startLine; // TODO: Adjust on a per-line basis.
      const barHeight = Math.max(pixelPerLine * hotspotLinesCount, 2);
      const color = colors[index];

      let nodeYPosition = yPosition;
      yPosition += barHeight;
      yPosition += 1; // Space for node separator.
      // TODO: Add scaled-down spacing for separation (i.e., if large distance in file, add more space in visualization)? At least to a certain degree?

      const yTextPosition = nodeYPosition + barHeight / 2 + 2;

      // TODO: Ensure name is not too long (e.g., hide parameters or replace with ... in method signatures if too long).

      return `<rect
          index=${index}
          x="20" y="${nodeYPosition}"
          width="${barWidth + 1}"
          height="${barHeight}"
          fill="${color}" />
          <text x="0" y="${yTextPosition}" fill="white" text-anchor="start" font-size="12">${
        symbolNode.symbolName
      }</text>`;
    })
    .join("");

  visualizationContainer.innerHTML = symbolNodesHtml;

  // viewContainer.addEventListener("click", function (event) {
  //   var index = event.target.attributes.index.value;
  //   var hotspot = hotspots[index];
  //   vscodeApi.postMessage({
  //     command: "showRange",
  //     startLine: hotspot.symbolLine,
  //     endLine: hotspot.symbolEndLine,
  //   });
  // });
}
