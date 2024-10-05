function insertHotspotNodes() {
  var hotspotNodesJson = localStorage.getItem("hotspotNodes");
  var hotspotNodes = JSON.parse(hotspotNodesJson);

  // Example data with the following assumptions:
  // - For all nodes, their containing nodes are also included (method -> class, etc.)
  // - For all nodes, the total importance is the sum of the importances of the contained nodes.
  hotspotNodes = [
    { metricValue: 200, displayName: "Launcher", startLine: 30, endLine: 215 },
    { metricValue: 60, displayName: "getGame", startLine: 44, endLine: 46 },
    { metricValue: 140, displayName: "launch", startLine: 183, endLine: 189 },
    { metricValue: 80, displayName: "section1", startLine: 184, endLine: 185 },
    { metricValue: 60, displayName: "section2", startLine: 186, endLine: 188 },
  ];

  var hotspotContainer = document.getElementById("hotspots-container");
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
    hotspotContainer.style.display = "flex";
    document.getElementById("histogram-container").style.display = "none";
  }

  var nestedNodes = createNodeNesting(hotspotNodes);
  var metricMax = 80; // TODO: Compute based on children.
  hotspotContainer.innerHTML = createNestedHtml(nestedNodes, metricMax);
}

function createNodeNesting(hotspotNodes) {
  return {
    metricValue: 200,
    displayName: "Launcher",
    startLine: 30,
    endLine: 215,
    children: [
      { metricValue: 60, displayName: "getGame", startLine: 44, endLine: 46 },
      {
        metricValue: 140,
        displayName: "launch",
        startLine: 183,
        endLine: 189,
        children: [
          {
            metricValue: 80,
            displayName: "section1",
            startLine: 184,
            endLine: 185,
          },
          {
            metricValue: 60,
            displayName: "section2",
            startLine: 186,
            endLine: 188,
          },
        ],
      },
    ],
  };

  /* var nestedHotspots = [];
  for (var hotspotNode in hotspotNodes) {
    var nodeHierarchy = hotspotNodes.filter(
      (node) =>
        node.startLine <= hotspotNode.startLine &&
        hotspotNode.endLine <= node.endLine
    );

    var parentNode = undefined;
    while (!nodeHierarchy.isEmpty()) {
      var parentStartLine = Math.min(nodeHierarchy.map(node => node.startLine));
      var parentEndLine = Math.max(nodeHierarchy.map(node => node.endLine));
      parentNode = nodeHierarchy.first(node => node.startLine === parentStartLine && node.endLine === parentEndLine);
      nodeHierarchy.remove(parentNode);
      parentNode["child"] = childNode;
      parentNode = childNode;
    }

    nestedHotspots
  } */
}

function createNestedHtml(hotspotNode, metricMax) {
  var html = `<div style="width: 100%">\n`;

  if (hotspotNode.children) {
    html += `<div style="border-style: solid; border-width: 2px; border-color: red; padding: 2px;">${hotspotNode.displayName}\n`;
    html += hotspotNode.children
      .map((child) => createNestedHtml(child, metricMax))
      .join("");
    html += "</div>\n";
  } else {
    var color = `rgb(${Math.floor(
      (255 * hotspotNode.metricValue) / metricMax
    )}, ${Math.floor(255 * (1 - hotspotNode.metricValue / metricMax))}, 0)`;
    console.log(color);
    html += `<button style="width=90%; border: none; background-color: ${color}; margin: 4px; padding: 15px 32px; " onclick="vscodeApi.postMessage({command: 'showRange', startLine: ${hotspotNode.startLine}, endLine: ${hotspotNode.endLine}});">${hotspotNode.displayName}</button>\n`;
  }

  html += "</div>";
  return html;
}
