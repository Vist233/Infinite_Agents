document.addEventListener("DOMContentLoaded", () => {
  // Configure marked
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  // Render initial markdown content loaded from session
  renderAllMarkdown();

  // --- SocketIO Setup ---
  const socket = io(); // Connect to the server

  const messageForm = document.getElementById('messageForm');
  const userInput = document.getElementById('userInput');
  const agentSelect = document.getElementById('agentSelect');
  const messageArea = document.getElementById('messageArea');
  const sendButton = document.getElementById('sendButton');
  const stopButton = document.getElementById('stopButton'); // Get stop button

  const statusArea = document.getElementById('statusArea');
  const fileInput = document.getElementById('fileInput');
  const selectFileButton = document.getElementById('selectFileButton');
  const uploadButton = document.getElementById('uploadButton');
  const clearRagButton = document.getElementById('clearRagButton');
  let selectedFile = null;

  let currentAiMessageId = null; // Variable to store the ID of the message being generated

  // Scroll to bottom function
  function scrollToBottom() {
    messageArea.scrollTop = messageArea.scrollHeight;
  }

  // Initial scroll to bottom
  scrollToBottom();

  // Function to display status messages
  function showStatus(message, type = 'info') {
    statusArea.textContent = message;
    statusArea.className = `status-area status-${type}`; // Add class for styling
  }

  // Handle form submission
  messageForm.addEventListener('submit', (e) => {
    e.preventDefault(); // Prevent traditional form submission
    const messageText = userInput.value.trim();
    const agent = agentSelect.value;

    if (messageText && sendButton.style.display !== 'none') { // Only send if send button is visible
      // Add user message bubble immediately
      appendMessage('user', messageText);
      scrollToBottom(); // Scroll after adding user message

      // Emit the message to the server
      socket.emit('send_message', { userInput: messageText, agent: agent });

      // Clear input field
      userInput.value = '';
    }
  });

  // Add event listener for the stop button
  stopButton.addEventListener('click', () => {
    if (currentAiMessageId) {
      console.log(`Requesting stop for message ID: ${currentAiMessageId}`);
      socket.emit('stop_generation', { id: currentAiMessageId });
      // UI changes (hiding stop, showing send) will happen in ai_message_end handler
    }
  });

  // Trigger hidden file input
  selectFileButton.addEventListener('click', () => {
    fileInput.click();
  });

  // Handle file selection
  fileInput.addEventListener('change', (event) => {
    selectedFile = event.target.files[0];
    if (selectedFile) {
      uploadButton.disabled = false;
      showStatus(`Selected: ${selectedFile.name}`, 'info');
    } else {
      uploadButton.disabled = true;
      showStatus(''); // Clear status if no file selected
    }
  });

  // Handle file upload
  uploadButton.addEventListener('click', async () => {
    if (!selectedFile) {
      showStatus('No file selected!', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    showStatus(`Uploading ${selectedFile.name}...`, 'info');
    uploadButton.disabled = true; // Disable during upload

    try {
      const response = await fetch('/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok && result.success) {
        showStatus(`✅ ${selectedFile.name} processed. RAG active for Chater.`, 'success');
        // Optionally clear file input for next upload
        fileInput.value = '';
        selectedFile = null;
      } else {
        showStatus(`❌ Error: ${result.error || 'Upload failed'}`, 'error');
      }
    } catch (error) {
      console.error('Upload error:', error);
      showStatus(`❌ Network or server error during upload.`, 'error');
    } finally {
      // Re-enable upload button conditionally if needed, or keep disabled until new file selected
      uploadButton.disabled = true; // Keep disabled after attempt
    }
  });

  // Handle Clear RAG Context
  clearRagButton.addEventListener('click', async () => {
    showStatus('Clearing RAG context...', 'info');
    try {
      const response = await fetch('/clear_rag', { method: 'POST' });
      const result = await response.json();
      if (response.ok && result.success) {
        showStatus('RAG context cleared.', 'success');
      } else {
        showStatus('Failed to clear RAG context.', 'error');
      }
    } catch (error) {
      console.error('Clear RAG error:', error);
      showStatus('Error clearing RAG context.', 'error');
    }
  });

  // --- SocketIO Event Listeners ---

  socket.on('connect', () => {
    console.log('Connected to server via WebSocket');
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
    // Optionally display a message to the user
  });

  socket.on('error_message', (data) => {
    console.error('Server Error:', data.error);
    // Display error to the user (e.g., in a temporary div or alert)
    appendMessage('error', `Error: ${data.error}`);
  });

  // Handle start of AI message stream
  socket.on('ai_message_start', (data) => {
    console.log('AI message start:', data.id);
    currentAiMessageId = data.id; // Store the current message ID
    // Show stop button, hide send button
    stopButton.style.display = 'inline-block';
    sendButton.style.display = 'none';
    // Create a placeholder for the AI message
    appendMessage('ai', '', data.id); // Pass ID to identify the bubble
    const aiBubble = document.getElementById(data.id);
    if (aiBubble) {
      aiBubble.dataset.rawMarkdown = ''; // Initialize empty raw markdown
    }
    scrollToBottom();
  });

  // Handle incoming AI message chunks
  socket.on('ai_message_chunk', (data) => {
    const aiBubble = document.getElementById(data.id);
    if (aiBubble) {
      // Append to raw markdown and render
      aiBubble.dataset.rawMarkdown += data.chunk;
      renderMarkdownInElement(aiBubble);
      scrollToBottom(); // Keep scrolled to bottom as content grows
    } else {
      console.warn(`Could not find AI message bubble with ID: ${data.id}`);
    }
  });

  // Handle end of AI message stream
  socket.on('ai_message_end', (data) => {
    console.log('AI message end:', data.id);
    const aiBubble = document.getElementById(data.id);
    if (aiBubble) {
      // Final render using the accumulated raw markdown
      renderMarkdownInElement(aiBubble);
      // Optionally add a class or attribute to indicate completion
      aiBubble.classList.add('message-complete');
    }
    // Hide stop button, show send button
    stopButton.style.display = 'none';
    sendButton.style.display = 'inline-block';
    currentAiMessageId = null; // Clear the current message ID
    scrollToBottom();
  });

  // --- Helper Functions ---

  // Appends a message bubble to the chat area
  function appendMessage(type, text, id = null) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', type);

    const bubbleDiv = document.createElement('div');
    bubbleDiv.classList.add('bubble');
    if (type === 'ai') {
      bubbleDiv.classList.add('markdown-content');
      if (id) {
        bubbleDiv.id = id; // Assign the unique ID
      }
    }
    bubbleDiv.textContent = text; // Set initial text (will be replaced by markdown rendering if needed)

    messageDiv.appendChild(bubbleDiv);
    messageArea.appendChild(messageDiv);

    // Render markdown immediately if it's an AI message (or user if needed)
    if (type === 'ai') {
      renderMarkdownInElement(bubbleDiv);
    }
  }

  // Renders markdown within a specific element
  function renderMarkdownInElement(element) {
    const rawMarkdown = element.dataset.rawMarkdown || element.textContent || ''; // Fallback to textContent if dataset is missing
    // Only render if it hasn't been marked as fully rendered by the streaming end event
    // OR if it's the final render call
    if (!element.classList.contains('message-complete') || event.type === 'ai_message_end') {
      element.innerHTML = marked.parse(rawMarkdown);
    }
  }

  // Renders markdown in all elements with the .markdown-content class
  function renderAllMarkdown() {
    const markdownElements = document.querySelectorAll('.markdown-content');
    markdownElements.forEach(element => {
      renderMarkdownInElement(element);
    });
  }

  // Initial setup calls
  renderAllMarkdown();
  scrollToBottom();
});