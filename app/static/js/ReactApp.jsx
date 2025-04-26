import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

function ChatApp() {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [agent, setAgent] = useState('chater');
  const [loading, setLoading] = useState(false);

  async function handleSend(e) {
    e.preventDefault();
    if (!userInput.trim()) return;
    // Add user message
    const userMsg = { role: 'user', content: userInput };
    setMessages([...messages, userMsg]);
    setUserInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput, agent })
      });
      const data = await response.json();
      // Add AI response
      const aiMsg = { role: 'ai', content: data.reply || 'No response' };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (error) {
      console.error('API error:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '15px', background: '#1e1e1e', minHeight: '100vh', color: 'white' }}>
      <div id="messageArea" style={{ marginBottom: '15px' }}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`message ${msg.role}`}
            style={{ marginBottom: '10px', textAlign: msg.role === 'user' ? 'right' : 'left' }}
          >
            <div
              className="bubble"
              style={{
                display: 'inline-block',
                maxWidth: '80%',
                padding: '10px 15px',
                borderRadius: '20px',
                background: msg.role === 'user' ? '#434343' : '#444'
              }}
              dangerouslySetInnerHTML={{ __html: msg.content }}
            />
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} style={{ display: 'flex' }}>
        <select
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          style={{ marginRight: '5px', padding: '5px' }}
        >
          <option value="paperai">Paper Chat</option>
          <option value="chater">Chater</option>
        </select>

        <input
          type="text"
          placeholder="Input something here..."
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          style={{ flex: 1, marginRight: '5px', padding: '10px' }}
        />

        <button
          type="submit"
          disabled={loading}
          style={{ padding: '10px 15px', cursor: 'pointer' }}
        >
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<ChatApp />);
