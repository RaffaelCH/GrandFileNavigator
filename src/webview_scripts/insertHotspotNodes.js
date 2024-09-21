function insertHotspotNodes() {
  var hotspotNodesJson = localStorage.getItem("hotspotNodes");
  var hotspotNodes = JSON.parse(hotspotNodesJson);

  if (hotspotNodes.length === 0) {
    let errorMessageContainer = document.getElementById("errorMessage");
    errorMessageContainer.textContent = "No hotspot data found";
    return;
  }

  var hotspotContainer = document.getElementById("hotspots-container");
  var containerRect = hotspotContainer.getBoundingClientRect();
}
