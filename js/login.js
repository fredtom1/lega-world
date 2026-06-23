(function () {
  "use strict";
  var map = {
    visitor: "index.html",
    coach: "coach.html",
    player: "player.html",
    scout: "index.html#stats",
    referee: "index.html"
  };
  document.getElementById("continue").addEventListener("click", function () {
    var role = document.getElementById("role").value || "visitor";
    location.href = map[role] || "index.html";
  });
})();
