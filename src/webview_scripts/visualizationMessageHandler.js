(function () {
  window.addEventListener("message", (event) => {
    const message = event.data; // The JSON data our extension sent

    switch (message.command) {
      case "reloadData":
        localStorage.setItem(
          "histogramNodes",
          JSON.stringify(message.histogramNodes)
        );
        break;
    }

    insertHistogram();
  });
})();
