import React from 'react';
import './ApprovalModal.css';

// ============================================================
// Types
// ============================================================
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
  steps: any[];
  dependencies: string[];
  risks: Risk[];
  confidence: ConfidenceBreakdown;
  estimatedTokens: number;
  requiresApproval: boolean;
}

interface ApprovalRequest {
  planResponse: PlanResponse;
  reason: string;
  confidenceBreakdown: ConfidenceBreakdown;
  risks: Risk[];
}

interface Props {
  request: ApprovalRequest;
  onApprove: () => void;
  onReject: () => void;
}

// ============================================================
// Helper Components
// ============================================================
const ConfidenceBar: React.FC<{ label: string; value: number }> = ({ label, value }) => {
  const percentage = Math.round(value * 100);
  const getColor = (val: number) => {
    if (val >= 0.7) return '#4caf50';
    if (val >= 0.5) return '#ff9800';
    return '#f44336';
  };

  return (
    <div className="confidence-bar">
      <div className="confidence-label">
        <span>{label}</span>
        <span>{percentage}%</span>
      </div>
      <div className="confidence-track">
        <div
          className="confidence-fill"
          style={{
            width: `${percentage}%`,
            backgroundColor: getColor(value)
          }}
        />
      </div>
    </div>
  );
};

const RiskBadge: React.FC<{ risk: Risk }> = ({ risk }) => {
  const severityColors: Record<string, string> = {
    low: '#4caf50',
    medium: '#ff9800',
    high: '#f44336',
    critical: '#9c27b0'
  };

  return (
    <div className="risk-item" style={{ borderLeftColor: severityColors[risk.severity] }}>
      <div className="risk-header">
        <span className="risk-severity" style={{ color: severityColors[risk.severity] }}>
          {risk.severity.toUpperCase()}
        </span>
        <span className="risk-category">{risk.category}</span>
      </div>
      <div className="risk-description">{risk.description}</div>
      <div className="risk-mitigation">
        <strong>Mitigation:</strong> {risk.mitigation}
      </div>
    </div>
  );
};

// ============================================================
// ApprovalModal Component
// ============================================================
const ApprovalModal: React.FC<Props> = ({ request, onApprove, onReject }) => {
  const { planResponse, reason, confidenceBreakdown, risks } = request;
  const { analysis } = planResponse;

  return (
    <div className="modal-overlay">
      <div className="approval-modal">
        <div className="modal-header">
          <h2>Plan Approval Required</h2>
          <div className="overall-confidence">
            <span className="confidence-value">
              {Math.round(confidenceBreakdown.overall * 100)}%
            </span>
            <span className="confidence-label">confidence</span>
          </div>
        </div>

        <div className="modal-reason">
          <strong>Reason:</strong> {reason}
        </div>

        <div className="modal-body">
          {/* Understanding Section */}
          <section className="section">
            <h3>Understanding</h3>
            <p>{analysis.understanding}</p>
          </section>

          {/* Chosen Approach */}
          <section className="section">
            <h3>Chosen Approach</h3>
            <p><strong>{analysis.chosenApproach}</strong></p>
            <p className="rationale">{analysis.rationale}</p>
          </section>

          {/* Confidence Breakdown */}
          <section className="section">
            <h3>Confidence Breakdown</h3>
            <div className="confidence-breakdown">
              <ConfidenceBar label="Task Clarity" value={confidenceBreakdown.taskClarity} />
              <ConfidenceBar label="Context Sufficiency" value={confidenceBreakdown.contextSufficiency} />
              <ConfidenceBar label="Approach Confidence" value={confidenceBreakdown.approachConfidence} />
              <ConfidenceBar label="Execution Feasibility" value={confidenceBreakdown.executionFeasibility} />
            </div>
          </section>

          {/* Risks */}
          {risks.length > 0 && (
            <section className="section">
              <h3>Identified Risks ({risks.length})</h3>
              <div className="risks-list">
                {risks.map((risk, idx) => (
                  <RiskBadge key={idx} risk={risk} />
                ))}
              </div>
            </section>
          )}

          {/* Plan Steps Preview */}
          <section className="section">
            <h3>Plan ({planResponse.steps.length} steps)</h3>
            <div className="steps-preview">
              {planResponse.steps.slice(0, 5).map((step, idx) => (
                <div key={idx} className="step-preview">
                  <span className="step-num">#{step.id}</span>
                  <span className="step-agent">[{step.assignedAgent}]</span>
                  <span className="step-desc">{step.description}</span>
                </div>
              ))}
              {planResponse.steps.length > 5 && (
                <div className="more-steps">
                  +{planResponse.steps.length - 5} more steps...
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="modal-footer">
          <button className="btn btn-reject" onClick={onReject}>
            Reject Plan
          </button>
          <button className="btn btn-approve" onClick={onApprove}>
            Approve & Execute
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApprovalModal;
