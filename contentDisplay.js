import { contentMap } from "./content.js";

// Content display functionality for menu items
export function initializeContentDisplay() {
  const containers = document.querySelectorAll(".hover-container");
  const dynamicContent = document.getElementById("dynamic-content");
  const contentDisplay = document.querySelector(".content-display");

  containers.forEach((container) => {
    const header = container.querySelector(".list-item-header");
    const containerClass = container.className
      .split(" ")
      .find((cls) => cls !== "hover-container");

    header.addEventListener("click", function () {
      // Remove active class from all headers
      document
        .querySelectorAll(".list-item-header")
        .forEach((h) => h.classList.remove("active"));

      // Add active class to clicked header
      header.classList.add("active");

      // Update content display
      const content = contentMap[containerClass];
      if (content) {
        dynamicContent.innerHTML = content;
        contentDisplay.classList.add("has-content");
      } else {
        // If no content, remove has-content class and clear content
        dynamicContent.innerHTML = "";
        contentDisplay.classList.remove("has-content");
      }
    });
  });
}
