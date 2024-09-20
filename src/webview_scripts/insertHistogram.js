function insertHistogram() {
  var bucketedDataJson = localStorage.getItem("importance");
  var labelsJson = localStorage.getItem("labels");

  var bucketedData = JSON.parse(bucketedDataJson);
  var labels = JSON.parse(labelsJson);

  if (bucketedData.length === 0 || labels.length === 0) {
    let errorMessageContainer = document.getElementById("errorMessage");
    errorMessageContainer.textContent = "No histogram data found";
    return;
  }

  var histogramContainer = document.getElementById("histogram-container");
  var containerRect = histogramContainer.getBoundingClientRect();

  const metricMax = Math.max(...bucketedData);
  const svgHeight = containerRect.height;
  const svgWidth = containerRect.width;
  const barHeight = (0.9 * svgHeight) / bucketedData.length;

  // Generate random colors for each bar
  const colors = bucketedData.map(
    () => `hsl(${Math.random() * 360}, 70%, 60%)`
  );

  let barsHtml = bucketedData
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