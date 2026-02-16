const API = "https://nmk-system.onrender.com";

function logout() {
  localStorage.removeItem("token");
  window.location.href = "index.html";
}
// Auto run only if dashboard page loaded
if (window.location.pathname.includes("dashboard.html")) {
  loadDashboard();
}

async function loadDashboard() {
  const token = localStorage.getItem("token");

  if (!token) {
    window.location.href = "index.html";
    return;
  }

  const response = await fetch(API + "/dashboard", {
    headers: {
      "Authorization": "Bearer " + token
    }
  });

  const data = await response.json();

  if (response.ok) {
    document.getElementById("totalPatients").innerText = data.totalPatients;
    document.getElementById("totalCollection").innerText = data.totalCollection;
    document.getElementById("totalPending").innerText = data.totalPending;
  } else {
    alert("Session expired");
    logout();
  }
}