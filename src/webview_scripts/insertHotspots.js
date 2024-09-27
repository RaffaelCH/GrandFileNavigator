function insertHotspotNodes() {
  var hotspotNodesJson = localStorage.getItem("hotspotNodes");
  var hotspotNodes = JSON.parse(hotspotNodesJson);

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

  // var containerRect = hotspotContainer.getBoundingClientRect();
  var nodeWidth = 250; //containerRect.width;

  // TODO: Add icon based on NodeType.
  let barsHtml = hotspotNodes
    .map((hotspotNode, index) => {
      const color = "blue"; // TODO: Adjust based on type?
      return `<button width="${nodeWidth}" onclick="vscodeApi.postMessage({command: 'showRange', startLine: ${hotspotNode.startLine}, endLine: ${hotspotNode.endLine}});">${hotspotNode.displayName}</button>
      `;
    })
    .join("");

  hotspotContainer.innerHTML = barsHtml;
}