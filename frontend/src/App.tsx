import { useEffect, useState } from 'react';
import ChatInterface from './components/ChatInterface';
import PlanVisualizer from './components/PlanVisualizer';
import ApprovalModal from './components/ApprovalModal';
import './App.css';

// ============================================================
// Types (matching backend)
// ============================================================
interface PlanStep {
  id: number;
  action: string;
  target: string;
  description: string;
  assignedAgent: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
  inputs: number[];
  outputs: string[];
  output?: string;
  error?: string;
}

interface Risk {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  description: string;
  mitigation: string;
  affectedSteps: number[];
}

interface ConfidenceBreakdown {
  taskClarity: number;
  contextSufficiency: number;
  approachConfidence: number;
  executionFeasibility: number;
  overall: number;
}

interface PlanAnalysis {
  understanding: string;
  constraints: string[];
  approaches: {
    approach: string;
    pros: string[];
    cons: string[];
    rejected?: boolean;
    rejectionReason?: string;
  }[];
  chosenApproach: string;
  rationale: string;
}

interface PlanResponse {
  planId: string;
  analysis: PlanAnalysis;
  steps: PlanStep[];
  dependencies: string[];
  risks: Risk[];
  confidence: ConfidenceBreakdown;
  estimatedTokens: number;
  requiresApproval: boolean;
}

interface AppState {
  plan: PlanStep[];
  planResponse?: PlanResponse;
  logs: string[];
  currentStep: number;
  pendingApproval: boolean;
}

interface ApprovalRequest {
  planResponse: PlanResponse;
  reason: string;
  confidenceBreakdown: ConfidenceBreakdown;
  risks: Risk[];
}

// ============================================================
// App Component
// ============================================================
function App() {
  const [state, setState] = useState<AppState>({
    plan: [],
    logs: [],
    currentStep: 0,
    pendingApproval: false
  });
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest | null>(null);
  const [executionComplete, setExecutionComplete] = useState<any>(null);

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:8080');

    socket.onopen = () => {
      console.log('Connected to Orchestrator');
      setWs(socket);
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'STATE_UPDATE':
          setState(message.payload);
          break;

        case 'PLAN_APPROVAL_REQUIRED':
          setApprovalRequest(message.payload);
          break;

        case 'EXECUTION_COMPLETE':
          setExecutionComplete(message.payload);
          setApprovalRequest(null);
          break;

        case 'ERROR':
          console.error('Orchestrator error:', message.payload);
          setState(prev => ({
            ...prev,
            logs: [...prev.logs, `ERROR: ${message.payload.message}`]
          }));
          break;
      }
    };

    socket.onclose = () => {
      console.log('Disconnected from Orchestrator');
      setWs(null);
    };

    return () => socket.close();
  }, []);

  const sendRequest = (request: string) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      setExecutionComplete(null);
      ws.send(JSON.stringify({ type: 'REQUEST', payload: request }));
    }
  };

  const handleApprove = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'APPROVE_PLAN' }));
      setApprovalRequest(null);
    }
  };

  const handleReject = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'REJECT_PLAN' }));
      setApprovalRequest(null);
    }
  };

  return (
    <div className="app-container">
      <header>
        <h1>AI Collaboration Plugin</h1>
        <div className="connection-status">
          <span className={`status-dot ${ws ? 'connected' : 'disconnected'}`} />
          {ws ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      <main>
        <div className="panel left">
          <ChatInterface onSend={sendRequest} logs={state.logs} />
        </div>

        <div className="panel right">
          <PlanVisualizer
            plan={state.plan}
            planResponse={state.planResponse}
            currentStep={state.currentStep}
          />

          {executionComplete && (
            <div className={`execution-summary ${executionComplete.success ? 'success' : 'failure'}`}>
              <h3>{executionComplete.success ? 'Execution Complete' : 'Execution Failed'}</h3>
              <div className="summary-stats">
                <span>Completed: {executionComplete.summary?.completed || 0}</span>
                <span>Failed: {executionComplete.summary?.failed || 0}</span>
                <span>Skipped: {executionComplete.summary?.skipped || 0}</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {approvalRequest && (
        <ApprovalModal
          request={approvalRequest}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
    </div>
  );
}

export default App;
