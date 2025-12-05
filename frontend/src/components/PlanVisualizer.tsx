import React from 'react';
import './PlanVisualizer.css';

// ============================================================
// Types
// ============================================================
interface PlanStep {
  id: number;
  action?: string;
  target?: string;
  description: string;
  assignedAgent: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
  inputs?: number[];
  outputs?: string[];
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

interface PlanResponse {
  planId: string;
  analysis: {
    understanding: string;
    chosenApproach: string;
    rationale: string;
  };
  steps: PlanStep[];
  dependencies: string[];
  risks: Risk[];
  confidence: ConfidenceBreakdown;
  estimatedTokens: number;
  requiresApproval: boolean;
}

interface Props {
  plan: PlanStep[];
  planResponse?: PlanResponse;
  currentStep: number;
}

// ============================================================
// Helper Components
// ============================================================
const StatusIcon: React.FC<{ status: PlanStep['status'] }> = ({ status }) => {
  const icons: Record<PlanStep['status'], string> = {
    'pending': '○',
    'in-progress': '◐',
    'completed': '●',
    'failed': '✕',
    'skipped': '⊘'
  };
  return <span className={`status-icon ${status}`}>{icons[status]}</span>;
};

const ConfidenceGauge: React.FC<{ value: number }> = ({ value }) => {
  const percentage = Math.round(value * 100);
  const getColor = (val: number) => {
    if (val >= 0.7) return '#4caf50';
    if (val >= 0.5) return '#ff9800';
    return '#f44336';
  };

  return (
    <div className="confidence-gauge">
      <svg viewBox="0 0 36 36" className="gauge-svg">
        <path
          className="gauge-bg"
          d="M18 2.0845
            a 15.9155 15.9155 0 0 1 0 31.831
            a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <path
          className="gauge-fill"
          stroke={getColor(value)}
          strokeDasharray={`${percentage}, 100`}
          d="M18 2.0845
            a 15.9155 15.9155 0 0 1 0 31.831
            a 15.9155 15.9155 0 0 1 0 -31.831"
        />
      </svg>
      <div className="gauge-text">
        <span className="gauge-value">{percentage}%</span>
      </div>
    </div>
  );
};

// ============================================================
// PlanVisualizer Component
// ============================================================
const PlanVisualizer: React.FC<Props> = ({ plan, planResponse, currentStep }) => {
  const hasSteps = plan && plan.length > 0;

  return (
    <div className="plan-visualizer">
      <div className="visualizer-header">
        <h2>Execution Plan</h2>
        {planResponse && (
          <ConfidenceGauge value={planResponse.confidence.overall} />
        )}
      </div>

      {/* Plan Summary */}
      {planResponse && (
        <div className="plan-summary">
          <div className="summary-item">
            <span className="label">Approach:</span>
            <span className="value">{planResponse.analysis.chosenApproach}</span>
          </div>
          {planResponse.risks.length > 0 && (
            <div className="summary-item risks">
              <span className="label">Risks:</span>
              <span className="value">
                {planResponse.risks.filter(r => r.severity === 'high' || r.severity === 'critical').length} high,{' '}
                {planResponse.risks.filter(r => r.severity === 'medium').length} medium
              </span>
            </div>
          )}
        </div>
      )}

      {/* Steps */}
      <div className="steps">
        {!hasSteps && (
          <div className="no-steps">
            <p>No plan yet. Send a request to generate one.</p>
          </div>
        )}

        {hasSteps && plan.map((step) => (
          <div
            key={step.id}
            className={`step ${step.status} ${step.id === currentStep ? 'active' : ''}`}
          >
            <div className="step-header">
              <StatusIcon status={step.status} />
              <span className="step-id">#{step.id}</span>
              <span className="step-agent">[{step.assignedAgent}]</span>
              {step.action && <span className="step-action">{step.action}</span>}
            </div>

            <div className="step-body">
              <div className="step-desc">{step.description}</div>
              {step.target && (
                <div className="step-target">
                  <code>{step.target}</code>
                </div>
              )}
            </div>

            {step.output && (
              <div className="step-output">
                <span className="output-label">Output:</span>
                <span className="output-text">{step.output}</span>
              </div>
            )}

            {step.error && (
              <div className="step-error">
                <span className="error-label">Error:</span>
                <span className="error-text">{step.error}</span>
              </div>
            )}

            {step.inputs && step.inputs.length > 0 && (
              <div className="step-deps">
                Depends on: {step.inputs.map(id => `#${id}`).join(', ')}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Stats */}
      {hasSteps && (
        <div className="plan-stats">
          <span className="stat">
            <span className="stat-value">{plan.filter(s => s.status === 'completed').length}</span>
            <span className="stat-label">done</span>
          </span>
          <span className="stat">
            <span className="stat-value">{plan.filter(s => s.status === 'in-progress').length}</span>
            <span className="stat-label">running</span>
          </span>
          <span className="stat">
            <span className="stat-value">{plan.filter(s => s.status === 'pending').length}</span>
            <span className="stat-label">pending</span>
          </span>
          <span className="stat">
            <span className="stat-value">{plan.filter(s => s.status === 'failed').length}</span>
            <span className="stat-label">failed</span>
          </span>
        </div>
      )}
    </div>
  );
};

export default PlanVisualizer;
