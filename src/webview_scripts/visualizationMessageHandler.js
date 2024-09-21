(function () {
  window.addEventListener("message", (event) => {
    const message = event.data; // The JSON data our extension sent

    switch (message.command) {
      case "reloadHistogramData":
        localStorage.setItem(
          "histogramNodes",
          JSON.stringify(message.histogramNodes)
        );
        break;
      case "reloadHotspotsData":
        localStorage.setItem(
          "hotspotNodes",
          JSON.stringify(message.hotspotNodes)
        );
        break;
    }

    insertHistogram();
  });
})();
