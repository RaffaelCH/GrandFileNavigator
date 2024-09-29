(function () {
  window.addEventListener("message", (event) => {
    const message = event.data; // The JSON data our extension sent

    switch (message.command) {
      case "reloadHistogramData":
        localStorage.setItem(
          "histogramNodes",
          JSON.stringify(message.histogramNodes)
        );
        insertHistogram();
        break;
      case "reloadHotspotsData":
        localStorage.setItem(
          "hotspotNodes",
          JSON.stringify(message.hotspotNodes)
        );
        insertHotspotNodes();
      case "indicateRange":
        localStorage.setItem(
          "indicatedRange",
          JSON.stringify({
            startLine: message.startLine,
            endLine: message.endLine,
          })
        );
        insertVisibleRangeIndicator();
        break;
    }
  });
})();
