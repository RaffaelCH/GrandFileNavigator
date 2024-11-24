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
  insertHoverWindow();
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

  visualizationContainer.addEventListener("mouseover", function (event) {
    // console.log("entering..." + Date.now());

    var symbolNodeIndex = getRelevantNodeIndex(event);
    var symbolNode = symbolNodes[symbolNodeIndex];

    const timeUntilHoverWindow = 2000;
    let leaveData = JSON.parse(localStorage.getItem("mouseLeaveData"));

    //console.log("Leave data: " + JSON.stringify(leaveData));

    if (leaveData && Date.now() - leaveData.time < timeUntilHoverWindow) {
      return; // show no hover data
    }
    // showImmediately = data.index === symbolNodeIndex;

    // if (showImmediately) {
    //   // show
    //   console.log("Show index: " + symbolNodeIndex);
    //   localStorage.setItem(
    //     "mouseOverData",
    //     JSON.stringify({ index: symbolNodeIndex, time: Date.now() })
    //   );
    //   return;
    // }

    setTimeout(timeUntilHoverWindow, () => {
      let leaveDataJson = localStorage.getItem("mouseLeaveData");
      let leaveData = JSON.parse(leaveDataJson);
      if (leaveData && Date.now() - leaveData.time < timeUntilHoverWindow) {
        return;
      }

      // show
      console.log("Show index: " + symbolNodeIndex);
      localStorage.setItem(
        "mouseOverData",
        JSON.stringify({ index: symbolNodeIndex, time: Date.now() })
      );
    });
  });

  for (const visualizationElement of visualizationContainer.children) {
    visualizationElement.addEventListener("mouseleave", function (event) {
      var symbolNodeIndexValue = event.target.attributes?.index?.value;

      if (!symbolNodeIndexValue) {
        return;
      }

      var symbolNodeIndex = Number(symbolNodeIndexValue);
      console.log("Leaving Index: " + symbolNodeIndex);

      localStorage.setItem(
        "mouseLeaveData",
        JSON.stringify({
          index: symbolNodeIndex,
          time: Date.now(),
        })
      );
    });
  }
}

function getRelevantNodeIndex(event) {
  let visualizationContainer = document.getElementById(
    "visualization-container"
  );

  var nodeBarElements = Array.from(visualizationContainer.children);
  var relevantBarElement = nodeBarElements.find(
    (el) =>
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

  var portionOfFirstNodeAboveVisible =
    (visibleRangeStartLine - firstVisibleNode.startLine) /
    (firstVisibleNode.endLine - firstVisibleNode.startLine);
  var visibleRangeIndicatorY =
    Number(firstNodeBarElement.attributes.y.value) +
    portionOfFirstNodeAboveVisible *
      firstNodeBarElement.attributes.height.value;

  var portionOfLastNodeBelowVisible =
    (lastVisibleNode.endLine - visibleRangeEndLine) /
    (lastVisibleNode.endLine - lastVisibleNode.startLine);
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

function insertHoverWindow() {
  let overDataJson = localStorage.getItem("mouseOverData");
  let overData = JSON.parse(overDataJson);

  if (!overData) {
    return;
  }

  let leaveDataJson = localStorage.getItem("mouseLeaveData");
  let leaveData = JSON.parse(leaveDataJson);

  if (leaveData && leaveData.time > overData.time) {
    return;
  }

  if (Date.now() - overData.time < 2000) {
    return;
  }

  // show
  console.log("insert hover");
}
