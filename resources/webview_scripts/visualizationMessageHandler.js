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
        insertHotspots();
      case "indicateHistogramRange":
        localStorage.setItem(
          "indicatedRange",
          JSON.stringify({
            startLine: message.startLine,
            endLine: message.endLine,
          })
        );
        insertHistogramVisibleRangeIndicator();
        break;
      case "indicateHotspotRange":
        localStorage.setItem(
          "indicatedRange",
          JSON.stringify({
            startLine: message.startLine,
            endLine: message.endLine,
          })
        );
        insertHotspotVisibleRangeIndicator();
        break;
      case "addHotspotsEvents":
        addEventHandlers();
        break;
      case "updateHoverData":
        updateHoverWindow();
        break;
      case "updateNavigationButtons":
        updateNavigationButtonsActivations(
          message.hasPrevious,
          message.hasNext
        );
        break;
      case "updatePreviousLocations":
        localStorage.setItem("previousRanges", message.previousRanges);
        insertHistogram();
    }
  });
})();

function updateNavigationButtonsActivations(hasPrevious, hasNext) {
  let forwardButton = document.getElementById("nav-button-forward");
  let backwardsButton = document.getElementById("nav-button-backward");

  if (backwardsButton) {
    if (hasPrevious) {
      backwardsButton.style.opacity = 1;
      backwardsButton.style.cursor = "initial";
    } else {
      backwardsButton.style.opacity = 0.5;
      backwardsButton.style.cursor = "not-allowed";
    }
  }

  if (forwardButton) {
    if (hasNext) {
      forwardButton.style.opacity = 1;
      forwardButton.style.cursor = "initial";
    } else {
      forwardButton.style.opacity = 0.5;
      forwardButton.style.cursor = "not-allowed";
    }
  }
}
