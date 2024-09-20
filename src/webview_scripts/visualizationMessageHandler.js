(function () {
  window.addEventListener("message", (event) => {
    const message = event.data; // The JSON data our extension sent

    console.log(message);

    switch (message.command) {
      case "updateData":
        localStorage.setItem("importance", JSON.stringify(message.importance));
        localStorage.setItem("labels", JSON.stringify(message.labels));
        break;
    }

    insertHistogram();
  });
})();
