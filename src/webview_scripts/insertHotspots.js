// var containerRect = histogramContainer.getBoundingClientRect();
// const svgHeight = 700; // containerRect.height;
// const svgWidth = 260; // containerRect.width;

function insertHotspots() {
  let hotspotNodesJson = localStorage.getItem("hotspotNodes");
  let hotspots = JSON.parse(hotspotNodesJson);

  let errorMessageContainer = document.getElementById("errorMessage");
  let visualizationContainer = document.getElementById(
    "visualization-container"
  );

  if (hotspots.length === 0) {
    errorMessageContainer.textContent = "No hotspot data found";
    visualizationContainer.style.display = "none";
    return;
  } else {
    errorMessageContainer.textContent = "";
    visualizationContainer.style.display = "initial";
  }

  const metricMax = Math.max(...hotspots.map((hotspot) => hotspot.importance));
  const totalLineCount = hotspots.reduce((accumulator, hotspot) => {
    return accumulator + (hotspot.symbolEndLine - hotspot.symbolLine);
  }, 0);
  const hotspotsSeparatorCount = hotspots.length;
  var pixelPerLine = (svgHeight - hotspotsSeparatorCount) / totalLineCount;

  // TODO: Order hotspots by position in file.

  // Generate colors ranging from green to red, based on importance.
  const colors = hotspots.map(
    (hotspot) =>
      `rgb(${Math.floor((255 * hotspot.importance) / metricMax)}, ${Math.floor(
        255 * (1 - hotspot.importance / metricMax)
      )}, 0)`
  );

  const maxBarWidth = svgWidth * 0.9;
  let yPosition = 0;

  let hotspotsHtml = hotspots
    .map((hotspot, index) => {
      const barWidth = (hotspot.importance / metricMax) * maxBarWidth;
      const hotspotLinesCount = hotspot.symbolEndLine - hotspot.symbolLine; // TODO: Adjust on a per-line basis.
      const barHeight = Math.max(pixelPerLine * hotspotLinesCount, 2);
      const color = colors[index];

      let nodeYPosition = yPosition;
      yPosition += barHeight;
      yPosition += 1; // Space for node separator.
      // TODO: Add scaled-down spacing for separation (i.e., if large distance in file, add more space in visualization)? At least to a certain degree?

      const yTextPosition = nodeYPosition + barHeight / 2;

      // TODO: Ensure name is not too long (e.g., hide parameters or replace with ... in method signatures if too long).

      return `<rect
          index=${index}
          x="20" y="${nodeYPosition}"
          width="${barWidth + 1}"
          height="${barHeight}"
          fill="${color}" />
          <text x="0" y="${yTextPosition}" fill="white" text-anchor="start" font-size="12">${
        hotspot.symbolName
      }</text>`;
    })
    .join("");

  visualizationContainer.innerHTML = hotspotsHtml;

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
