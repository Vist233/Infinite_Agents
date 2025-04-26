document.addEventListener("DOMContentLoaded", () => {
  // Configure marked
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  const messageForm = document.getElementById('messageForm');
  const userInput = document.getElementById('userInput');
  const agentSelect = document.getElementById('agentSelect');
  const messageArea = document.getElementById('messageArea');
  const sendButton = document.getElementById('sendButton'); // Keep send button reference

  // Scroll to bottom function
  function scrollToBottom() {
    messageArea.scrollTop = messageArea.scrollHeight;
  }

  // Initial scroll to bottom
  scrollToBottom();

  // --- Helper Functions ---

  // Appends a message bubble to the chat area
  // Returns the created bubble element for potential updates (like placeholders)
  function appendMessage(type, text) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', type);

    const bubbleDiv = document.createElement('div');
    bubbleDiv.classList.add('bubble');
    if (type === 'ai') {
      bubbleDiv.classList.add('markdown-content'); // Add class for markdown rendering
      bubbleDiv.innerHTML = marked.parse(text); // Render initial text (like "Thinking...")
    } else {
       bubbleDiv.textContent = text; // User messages as plain text
    }


    messageDiv.appendChild(bubbleDiv);
    messageArea.appendChild(messageDiv);
    return bubbleDiv; // Return the bubble element
  }

  // Updates the content of an existing AI message bubble
  function updateAiMessage(bubbleElement, newText, isError = false) {
     if (bubbleElement) {
        bubbleElement.innerHTML = marked.parse(newText); // Render new content as markdown
        if (isError) {
            bubbleElement.classList.add('error-message'); // Optional: Add error styling
        } else {
            bubbleElement.classList.remove('error-message');
        }
     }
  }

  // Renders markdown in all elements with the .markdown-content class (useful if loading history)
  function renderAllMarkdown() {
    const markdownElements = document.querySelectorAll('.markdown-content');
    markdownElements.forEach(element => {
       // Re-render existing markdown content if needed, using innerHTML as source
       const rawMarkdown = element.innerHTML; // Or store raw markdown in a data attribute if preferred
       element.innerHTML = marked.parse(rawMarkdown);
    });
  }

  // Initial setup calls
  // renderAllMarkdown(); // Render any initial messages if loaded from template
  scrollToBottom();
});