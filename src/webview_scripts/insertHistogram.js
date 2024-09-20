oldChart = undefined;

async function insertHistogram() {
  var bucketedDataJson = localStorage.getItem("importance");
  var labelsJson = localStorage.getItem("labels");

  var bucketedData = JSON.parse(bucketedDataJson);
  var labels = JSON.parse(labelsJson);

  if (oldChart !== undefined) {
    oldChart.destroy();
  }

  if (bucketedData.length === 0 || labels.length === 0) {
    let errorMessageContainer = document.getElementById("errorMessage");
    errorMessageContainer.textContent = "No histogram data found";
    return;
  }

  oldChart = new Chart(document.getElementById("histogram"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "File Chunk Importance",
          data: bucketedData,
          backgroundColor: [
            "rgba(255, 99, 132, 0.2)",
            "rgba(255, 159, 64, 0.2)",
          ],
          borderColor: ["rgb(255, 99, 132)", "rgb(255, 159, 64)"],
          borderWidth: 1,
          barPercentage: 1.25,
        },
      ],
    },
    options: {
      indexAxis: "y",
      // Elements options apply to all of the options unless overridden in a dataset
      // In this case, we are setting the border of each horizontal bar to be 2px wide
      elements: {
        bar: {
          borderWidth: 2,
        },
      },
      responsive: true,
      plugins: {
        //   legend: {
        //     position: 'right',
        //   },
        title: {
          display: false,
          //text: 'Chart.js Horizontal Bar Chart'
        },
      },
    },
  });
}
