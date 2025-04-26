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

  // Handle form submission
  messageForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Prevent traditional form submission
    const messageText = userInput.value.trim();
    const agent = agentSelect.value;

    if (!messageText) {
      return; // Don't send empty messages
    }

    // 1. Add user message bubble immediately
    appendMessage('user', messageText);
    scrollToBottom(); // Scroll after adding user message
    userInput.value = ''; // Clear input field
    sendButton.disabled = true; // Disable button during request

    // 2. Create a placeholder for the AI response
    const aiPlaceholder = appendMessage('ai', 'Thinking...'); // Show thinking indicator
    scrollToBottom();

    try {
      // 3. Send the message to the Go backend API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userInput: messageText, agent: agent }),
      });

      if (!response.ok) {
        // Handle HTTP errors (e.g., 400, 500)
        const errorData = await response.json().catch(() => ({ reply: `Error: ${response.statusText}` })); // Try to parse JSON error, fallback
        console.error('API Error:', response.status, errorData);
        updateAiMessage(aiPlaceholder, `Error: ${errorData.reply || response.statusText}`, true); // Update placeholder with error
        return; // Stop processing
      }

      // 4. Get the JSON response
      const data = await response.json();

      // 5. Update the AI placeholder bubble with the actual reply
      updateAiMessage(aiPlaceholder, data.reply);

    } catch (error) {
      // Handle network errors or JSON parsing errors
      console.error('Fetch Error:', error);
      updateAiMessage(aiPlaceholder, 'Error: Could not reach the server.', true); // Update placeholder with error
    } finally {
      sendButton.disabled = false; // Re-enable button
      scrollToBottom(); // Scroll after adding AI message or error
    }
  });


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