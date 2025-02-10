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
    errorMessageContainer.textContent =
      "No hotspots found. This can happen for the following reasons: VS Code could not analyze the code file or you didn't look at any methods yet (no other hotspot types are shown here).";
    visualizationContainer.style.display = "none";
    return;
  } else {
    errorMessageContainer.textContent = "";
    visualizationContainer.style.display = "initial";
  }

    symbolNodes.sort((a, b) => b.metricValue - a.metricValue);

    const MAX_METHODS = 20;
    if (symbolNodes.length > MAX_METHODS) {
      symbolNodes = symbolNodes.slice(0, MAX_METHODS);
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
          x=20 y=${nodeYPosition}
          width=${barWidth + 1}
          height=${barHeight}
          fill="${color}" />
          <text x=0 y=${yTextPosition} fill="white" text-anchor="start" font-size="12">${
        symbolNode.displayName
      }</text>`;
    })
    .join("");

  visualizationContainer.innerHTML = symbolNodesHtml;

  let mouseHoverData = JSON.parse(localStorage.getItem("mouseHoverData"));
  if (mouseHoverData && mouseHoverData.timeEntered < Date.now() - 2000) {
    showHoverWindow(
      symbolNodes[mouseHoverData.symbolNodeIndex].additionalInformation
    );
  }

  updateHoverWindow(symbolNodes);
}

function addEventHandlers() {
  let symbolNodesJson = localStorage.getItem("hotspotNodes");
  let symbolNodes = JSON.parse(symbolNodesJson);

  if (symbolNodes.length === 0) {
    return;
  }

  addClickEventHandler(symbolNodes);
  addHoverEventHandlers(symbolNodes);
}

function addClickEventHandler(symbolNodes) {
  let visualizationContainer = document.getElementById(
    "visualization-container"
  );

  // TODO: Jump to location within node based on where exactly the click was.
  visualizationContainer.addEventListener("click", function (event) {
    var index = getRelevantNodeIndex(event);
    var symbolNode = symbolNodes[index];
    vscodeApi.postMessage({
      command: "showRange",
      startLine: symbolNode.startLine,
      endLine: symbolNode.endLine,
    });
  });
}

function addHoverEventHandlers(symbolNodes) {
  let visualizationContainer = document.getElementById(
    "visualization-container"
  );

  visualizationContainer.addEventListener("mousemove", function (event) {
    var mouseHoverData = JSON.parse(localStorage.getItem("mouseHoverData"));
    var symbolNodeIndex = getRelevantNodeIndex(event);

    // New node entered.
    if (!mouseHoverData || mouseHoverData.symbolNodeIndex !== symbolNodeIndex) {
      localStorage.setItem(
        "mouseHoverData",
        JSON.stringify({
          symbolNodeIndex: symbolNodeIndex,
          timeEntered: Date.now(),
          positionX: event.offsetX,
          positionY: event.offsetY,
          hoverText: symbolNodes[symbolNodeIndex].additionalInformation,
        })
      );
    }
    // Hover window not yet shown -> still update position.
    else if (mouseHoverData.timeEntered >= Date.now() - 2000) {
      let hoverData = JSON.parse(localStorage.getItem("mouseHoverData"));
      hoverData.positionX = event.offsetX;
      hoverData.positionY = event.offsetY;
      localStorage.setItem("mouseHoverData", JSON.stringify(hoverData));
    }
  });

  visualizationContainer.addEventListener("mouseleave", function (event) {
    localStorage.removeItem("mouseHoverData");
  });
}

function getRelevantNodeIndex(event) {
  let visualizationContainer = document.getElementById(
    "visualization-container"
  );

  var nodeBarElements = Array.from(visualizationContainer.children);
  var relevantBarElement = nodeBarElements.find(
    (el) =>
      el.nodeName === "rect" &&
      Number(el.attributes.y?.value) <= Number(event.offsetY) &&
      Number(event.offsetY) <=
        Number(el.attributes.y?.value) + Number(el.attributes.height?.value)
  );

  return relevantBarElement?.attributes?.index?.value;
}

function insertHotspotVisibleRangeIndicator() {
  var hotspotNodesJson = localStorage.getItem("hotspotNodes");
  var hotspotNodes = JSON.parse(hotspotNodesJson);

  var visibleRangeJson = localStorage.getItem("indicatedRange");
  var visibleRange = JSON.parse(visibleRangeJson);

  if (hotspotNodes.length === 0) {
    return;
  }

  // Remove old visible range indicator (if present).
  document.getElementById("visible-range-indicator")?.remove();

  var firstVisibleNodeIndex = hotspotNodes.findIndex(
    (node) => node.endLine >= visibleRange.startLine
  );
  var lastVisibleNodeIndex = hotspotNodes.findIndex(
    (node) => node.startLine > visibleRange.endLine
  );

  if (lastVisibleNodeIndex === -1) {
    lastVisibleNodeIndex = hotspotNodes.length - 1;
  } else {
    lastVisibleNodeIndex -= 1;
  }

  if (firstVisibleNodeIndex === -1) {
    firstVisibleNodeIndex = 0;
  }

  let visualizationContainer = document.getElementById(
    "visualization-container"
  );
  let nodeBarElements = Array.from(visualizationContainer.children);

  var firstNodeBarElement = nodeBarElements.find(
    (el) => el.attributes.index?.value === firstVisibleNodeIndex.toString()
  );
  var lastNodeBarElement = nodeBarElements.find(
    (el) => el.attributes.index?.value === lastVisibleNodeIndex.toString()
  );

  var firstVisibleNode = hotspotNodes[firstVisibleNodeIndex];
  var lastVisibleNode = hotspotNodes[lastVisibleNodeIndex];

  // Ignore space outside of nodes for now.
  var visibleRangeStartLine = Math.max(
    visibleRange.startLine,
    firstVisibleNode.startLine
  );
  var visibleRangeEndLine = Math.min(
    visibleRange.endLine,
    lastVisibleNode.endLine
  );

  if (firstVisibleNode.startLine === firstVisibleNode.endLine) {
    portionOfFirstNodeAboveVisible = 0;
  } else {
    var portionOfFirstNodeAboveVisible =
      (visibleRangeStartLine - firstVisibleNode.startLine) /
      (firstVisibleNode.endLine - firstVisibleNode.startLine);
  }

  var visibleRangeIndicatorY =
    Number(firstNodeBarElement.attributes.y.value) +
    portionOfFirstNodeAboveVisible *
      firstNodeBarElement.attributes.height.value;

  if (lastVisibleNode.endLine === lastVisibleNode.startLine) {
    portionOfLastNodeBelowVisible = 1;
  } else {
    var portionOfLastNodeBelowVisible =
      (lastVisibleNode.endLine - visibleRangeEndLine) /
      (lastVisibleNode.endLine - lastVisibleNode.startLine);
  }

  var visibleRangeIndicatorEndY =
    Number(lastNodeBarElement.attributes.y.value) +
    (1 - portionOfLastNodeBelowVisible) *
      lastNodeBarElement.attributes.height.value;

  var visibleRangeIndicatorHeight =
    visibleRangeIndicatorEndY - visibleRangeIndicatorY;

  var visibleRangeIndicatorHtml = `<rect id="visible-range-indicator"
          x=20 y=${visibleRangeIndicatorY}
          width=${svgWidth}
          height=${visibleRangeIndicatorHeight}
          fill="rgb(100, 100, 100, 0.5)">
        </rect>`;

  visualizationContainer.innerHTML += visibleRangeIndicatorHtml;
}

function updateHoverWindow() {
  let mouseHoverData = JSON.parse(localStorage.getItem("mouseHoverData"));
  if (mouseHoverData && mouseHoverData.timeEntered < Date.now() - 2000) {
    showHoverWindow(mouseHoverData.hoverText);
  } else {
    removeHoverWindow();
  }
}

function showHoverWindow(hoverText) {
  let visualizationContainer = document.getElementById(
    "visualization-container"
  );

  // Window already shown.
  if (visualizationContainer.getElementById("hoverDataWindow")) {
    return;
  }

  var mouseHoverData = JSON.parse(localStorage.getItem("mouseHoverData"));

  let positionX = mouseHoverData.positionX + 20;
  let positionY = mouseHoverData.positionY + 20;

  hoverText =
    "Hover text that is too long and should be split up into multiple lines.";
  let hoverHtml = `<text id="hoverDataWindow" x="${positionX}" y="${positionY}" dy="0" fill="white" font-size="14" paint-order="stroke" stroke="black" stroke-width="1px"><tspan x="${positionX}" dy="1.2em">${hoverText}</tspan></text>`;
  visualizationContainer.insertAdjacentHTML("beforeend", hoverHtml);

  //getComputedTextLength
  let hoverWindow = visualizationContainer.getElementById("hoverDataWindow");
  let textLength = hoverWindow.getComputedTextLength();
  let maxWidth = visualizationContainer.width.baseVal.value - 30;

  if (textLength > maxWidth) {
    let averageCharWidth = textLength / hoverText.length;
    let splits = hoverText.split(/\s+/);

    let textHtml = `<tspan x="${positionX}" dy="1.2em">`;
    let lineLength = 0;
    splits.forEach((split) => {
      let splitLength = (split.length + 1) * averageCharWidth;
      if (lineLength + splitLength < maxWidth) {
        textHtml += ` ${split}`;
        lineLength += splitLength;
      } else {
        textHtml += `</tspan><tspan x="${positionX}" dy="1.2em"> ${split}`;
        lineLength = splitLength;
      }
    });
    textHtml += "</tspan>";
    hoverWindow.innerHTML = textHtml;
  }

  if (positionX + textLength > maxWidth) {
    // TODO: Adjust starting position.
    console.log(hoverWindow.x);
    hoverWindow.x = maxWidth - textLength;
    console.log(hoverWindow.x);
  }
}

function removeHoverWindow() {
  document.getElementById("hoverDataWindow")?.remove();
}
