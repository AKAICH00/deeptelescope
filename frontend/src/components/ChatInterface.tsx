import React, { useState } from 'react';

interface Props {
    onSend: (msg: string) => void;
    logs: string[];
}

const ChatInterface: React.FC<Props> = ({ onSend, logs }) => {
    const [input, setInput] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim()) {
            onSend(input);
            setInput('');
        }
    };

    return (
        <div className="chat-interface">
            <h2>Orchestrator Chat</h2>
            <div className="logs">
                {logs.map((log, i) => (
                    <div key={i} className="log-entry">{log}</div>
                ))}
            </div>
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask the swarm..."
                />
                <button type="submit">Send</button>
            </form>
        </div>
    );
};

export default ChatInterface;
