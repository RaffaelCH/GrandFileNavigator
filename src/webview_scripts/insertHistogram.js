function insertHistogram() {
  var histogramNodesJson = localStorage.getItem("histogramNodes");
  var histogramNodes = JSON.parse(histogramNodesJson);

  if (histogramNodes.length === 0) {
    let errorMessageContainer = document.getElementById("errorMessage");
    errorMessageContainer.textContent = "No histogram data found";
    return;
  }

  var histogramContainer = document.getElementById("histogram-container");
  var containerRect = histogramContainer.getBoundingClientRect();

  var metricValues = histogramNodes.map((node) => node.metricValue);

  const metricMax = Math.max(...metricValues);
  const svgHeight = containerRect.height;
  const svgWidth = containerRect.width;
  const barHeight = (0.9 * svgHeight) / histogramNodes.length;

  // Generate random colors for each bar
  const colors = bucketedData.map(
    (data) =>
      `rgb(${Math.floor((255 * data) / metricMax)}, ${Math.floor(
        255 * (1 - data / metricMax)
      )}, 0)`
  );

  let barsHtml = histogramNodes
    .map((count, index) => {
      const barWidth = (count / metricMax) * svgWidth;
      const color = colors[index];

      // Determine whether to place the count inside or above the bar
      const yTextPosition = index * barHeight + barHeight / 2;

      return `
        <rect x="20" y="${index * barHeight}"
          width="${barWidth - 2}"
          height="${barHeight}"
          fill="${color}">
        </rect>
        <text x="0" y="${yTextPosition}" fill="white" text-anchor="start" font-size="12">${
        labels[index]
      }</text>
      `;
    })
    .join("");

  histogramContainer.innerHTML = barsHtml;
}
