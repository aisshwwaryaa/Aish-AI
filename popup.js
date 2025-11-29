document.addEventListener("DOMContentLoaded", () => {
  
  const askBtn = document.getElementById("askBtn");
  const inputText = document.getElementById("inputText");
  const output = document.getElementById("output");

  // ---- Assignment Requirement: Create Example Button Dynamically ----
  const exampleBtn = document.createElement("button");
  exampleBtn.id = "exampleBtn";
  exampleBtn.textContent = "Example Prompt";

  // Insert AFTER Ask Button (Error-safe)
  askBtn.insertAdjacentElement("afterend", exampleBtn);

  // When Example button is clicked
  exampleBtn.addEventListener("click", () => {
    inputText.value = "Explain artificial intelligence in simple words.";
  });

  // Ask Button Functionality
  askBtn.addEventListener("click", () => {
    const text = inputText.value.trim();

    if (!text) {
      output.textContent = "Please enter something!";
      return;
    }

    output.textContent = "Thinking...";
   
    setTimeout(() => {
      output.textContent = "AI Response: " + text.toUpperCase();
    }, 800);
  });

});
