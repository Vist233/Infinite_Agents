import uuid
from flask import Flask, render_template, request, session
from flask_socketio import SocketIO, emit
import os
from agents import paperai_agent, chater_agent
from agno.agent import Agent
from config import API_KEY
import threading

app = Flask(__name__)
convId = str(uuid.uuid4())
app.secret_key = convId
socketio = SocketIO(app, async_mode='eventlet')
API = os.environ.get('DEEPSEEK_API_KEY') or API_KEY

active_tasks = {}
active_tasks_lock = threading.Lock()

class DialogueManager:
    def __init__(self, assistant, socketio_instance):
        self.assistant = assistant
        self.socketio = socketio_instance

    def process_user_input(self, user_input, sid, ai_message_id):
        with active_tasks_lock:
            active_tasks[ai_message_id] = False
        should_stop = False
        try:
            full_response = ""
            response_stream = None

            if isinstance(self.assistant, Agent):
                try:
                    response_stream = self.assistant.run(user_input, stream=True)
                except Exception as agent_run_error:
                    raise agent_run_error
            else:
                raise TypeError(f"Cannot process input for assistant type: {type(self.assistant)}")

            if hasattr(response_stream, '__iter__') and not isinstance(response_stream, str):
                for chunk in response_stream:
                    with active_tasks_lock:
                        if active_tasks.get(ai_message_id, False):
                            print(f"Stopping generation for {ai_message_id}")
                            should_stop = True
                            break

                    content_chunk = None
                    is_tool_call_related = hasattr(chunk, 'tool_call_id') and hasattr(chunk, 'name')
                    is_tool_output = hasattr(chunk, 'tool_call_id') and hasattr(chunk, 'output') and not hasattr(chunk, 'name')

                    if is_tool_call_related:
                        tool_name = getattr(chunk, 'name', 'Unknown Tool')
                        self.socketio.emit('tool_call', {'id': ai_message_id, 'tool_name': tool_name}, room=sid)
                        content_chunk = None
                    elif is_tool_output:
                        content_chunk = None
                    else:
                        content_chunk = str(getattr(chunk, 'content', chunk))

                    if content_chunk:
                        full_response += content_chunk
                        self.socketio.emit('ai_message_chunk', {'id': ai_message_id, 'chunk': content_chunk}, room=sid)
                        self.socketio.sleep(0.01)

            elif response_stream is not None:
                with active_tasks_lock:
                    if not active_tasks.get(ai_message_id, False):
                        content = str(response_stream)
                        full_response = content
                        self.socketio.emit('ai_message_chunk', {'id': ai_message_id, 'chunk': content}, room=sid)
                    else:
                        should_stop = True
            else:
                with active_tasks_lock:
                    if not active_tasks.get(ai_message_id, False):
                        full_response = "Assistant did not generate a response."
                        self.socketio.emit('ai_message_chunk', {'id': ai_message_id, 'chunk': full_response}, room=sid)
                    else:
                        should_stop = True

            final_text = full_response
            if should_stop:
                final_text += "\n\n*Generation stopped by user.*"
            self.socketio.emit('ai_message_end', {'id': ai_message_id, 'full_text': final_text}, room=sid)

        except Exception as e:
            error_msg = f"An error occurred: {e}"
            self.socketio.emit('ai_message_chunk', {'id': ai_message_id, 'chunk': f"\n\n**Error:** {error_msg}"}, room=sid)
            self.socketio.emit('ai_message_end', {'id': ai_message_id, 'full_text': full_response + f"\n\n**Error:** {error_msg}"}, room=sid)
            print(f"Error during processing for {ai_message_id}: {e}")
        finally:
            with active_tasks_lock:
                if ai_message_id in active_tasks:
                    del active_tasks[ai_message_id]

paperai_manager = DialogueManager(paperai_agent, socketio)
chater_manager = DialogueManager(chater_agent, socketio)

@app.route("/")
def index():
    if "messages" not in session:
        session["messages"] = []
    return render_template("main.html", messages=session.get("messages", []))

@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    print(f'Client disconnected: {request.sid}')

@socketio.on('send_message')
def handle_send_message(data):
    user_input = data.get("userInput")
    agent_type = data.get("agent")
    sid = request.sid

    if not user_input or not agent_type:
        emit('error_message', {'error': 'Missing input or agent type.'}, room=sid)
        return

    ai_message_id = f"ai-msg-{uuid.uuid4()}"
    socketio.emit('ai_message_start', {'id': ai_message_id}, room=sid)

    manager = None
    if agent_type == "paperai":
        manager = paperai_manager
    elif agent_type == "chater":
        manager = chater_manager
    else:
        emit('error_message', {'error': 'Invalid agent selected.'}, room=sid)
        socketio.emit('ai_message_end', {'id': ai_message_id, 'full_text': '*Invalid agent selected.*'}, room=sid)
        return

    socketio.start_background_task(manager.process_user_input, user_input, sid, ai_message_id)

@socketio.on('stop_generation')
def handle_stop_generation(data):
    ai_message_id = data.get('id')
    sid = request.sid
    if ai_message_id:
        with active_tasks_lock:
            if ai_message_id in active_tasks:
                print(f"Received stop request for {ai_message_id} from {sid}")
                active_tasks[ai_message_id] = True
            else:
                print(f"Received stop request for inactive/unknown task: {ai_message_id}")
    else:
        print(f"Received stop request without message ID from {sid}")

if __name__ == "__main__":
    host = '0.0.0.0'
    port = 8080
    print(f"Starting SocketIO server on http://{host}:{port}")
    socketio.run(app, host=host, port=port, debug=False, use_reloader=False)
