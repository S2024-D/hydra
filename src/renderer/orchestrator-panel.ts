// Agent Orchestrator Panel UI

// Types matching main process
interface AgentRole {
  id: string;
  name: string;
  description: string;
  icon: string;
  systemPrompt: string;
}

interface WorkflowStep {
  agentId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: string;
  output?: string;
  startedAt?: number;
  completedAt?: number;
}

interface WorkflowConfig {
  id: string;
  name: string;
  task: string;
  includeDesignReview: boolean;
  status: 'idle' | 'running' | 'awaiting_approval' | 'completed';
  currentStep: number;
  steps: WorkflowStep[];
  iteration: number;
  userFeedback?: string;
  createdAt: number;
}

type ViewMode = 'list' | 'create' | 'detail' | 'approval';

class OrchestratorPanel {
  private element: HTMLElement;
  private isVisible = false;
  private workflows: WorkflowConfig[] = [];
  private agents: AgentRole[] = [];
  private currentView: ViewMode = 'list';
  private selectedWorkflowId: string | null = null;
  private expandedSteps: Set<string> = new Set();
  private isRunning = false;

  constructor() {
    this.element = this.createPanelElement();
    document.body.appendChild(this.element);
    this.setupEventListeners();
  }

  private createPanelElement(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'orchestrator-panel';
    panel.innerHTML = `
      <div class="orchestrator-backdrop"></div>
      <div class="orchestrator-container">
        <div class="orchestrator-header">
          <h2 class="orchestrator-title">에이전트 오케스트레이터</h2>
          <button class="orchestrator-close">&times;</button>
        </div>
        <div class="orchestrator-content">
          <!-- Content will be rendered dynamically -->
        </div>
      </div>
    `;
    return panel;
  }

  private setupEventListeners(): void {
    this.element.querySelector('.orchestrator-backdrop')?.addEventListener('click', () => {
      this.hide();
    });

    this.element.querySelector('.orchestrator-close')?.addEventListener('click', () => {
      this.hide();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        e.preventDefault();
        if (this.currentView !== 'list') {
          this.showListView();
        } else {
          this.hide();
        }
      }
    });
  }

  private async loadData(): Promise<void> {
    try {
      this.workflows = await window.electronAPI.orchestratorGetWorkflows();
      this.agents = await window.electronAPI.orchestratorGetAgents();
    } catch (error) {
      console.error('Failed to load orchestrator data:', error);
      this.workflows = [];
      this.agents = [];
    }
  }

  private renderContent(): void {
    const content = this.element.querySelector('.orchestrator-content') as HTMLElement;
    if (!content) return;

    switch (this.currentView) {
      case 'list':
        this.renderListView(content);
        break;
      case 'create':
        this.renderCreateView(content);
        break;
      case 'detail':
        this.renderDetailView(content);
        break;
      case 'approval':
        this.renderApprovalView(content);
        break;
    }
  }

  private getAgentById(id: string): AgentRole | undefined {
    return this.agents.find(a => a.id === id);
  }

  private getStatusIcon(status: WorkflowStep['status']): string {
    switch (status) {
      case 'pending': return '○';
      case 'running': return '⏳';
      case 'completed': return '✓';
      case 'failed': return '✗';
      default: return '○';
    }
  }

  private getStatusClass(status: WorkflowStep['status']): string {
    return `step-status-${status}`;
  }

  private formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private renderListView(container: HTMLElement): void {
    const workflowListHtml = this.workflows.length === 0
      ? '<div class="orchestrator-empty">워크플로우가 없습니다. 새 워크플로우를 생성하세요.</div>'
      : this.workflows.map(workflow => {
          const completedSteps = workflow.steps.filter(s => s.status === 'completed').length;
          const totalSteps = workflow.steps.length;
          const progress = Math.round((completedSteps / totalSteps) * 100);

          let statusLabel = '';
          let statusClass = '';
          switch (workflow.status) {
            case 'idle':
              statusLabel = '대기';
              statusClass = 'status-idle';
              break;
            case 'running':
              statusLabel = '진행 중';
              statusClass = 'status-running';
              break;
            case 'awaiting_approval':
              statusLabel = '승인 대기';
              statusClass = 'status-awaiting';
              break;
            case 'completed':
              statusLabel = '완료';
              statusClass = 'status-completed';
              break;
          }

          return `
            <div class="workflow-item" data-id="${workflow.id}">
              <div class="workflow-item-header">
                <div class="workflow-item-info">
                  <span class="workflow-item-name">${this.escapeHtml(workflow.name)}</span>
                  <span class="workflow-item-meta">
                    ${this.formatDate(workflow.createdAt)} | 반복: ${workflow.iteration}
                  </span>
                </div>
                <span class="workflow-item-status ${statusClass}">${statusLabel}</span>
              </div>
              <div class="workflow-item-progress">
                <div class="workflow-progress-bar">
                  <div class="workflow-progress-fill" style="width: ${progress}%"></div>
                </div>
                <span class="workflow-progress-text">${completedSteps}/${totalSteps}</span>
              </div>
              <div class="workflow-item-actions">
                <button class="orchestrator-btn orchestrator-btn-view" data-id="${workflow.id}">
                  ${workflow.status === 'awaiting_approval' ? '결과 확인' : '상세보기'}
                </button>
                <button class="orchestrator-btn orchestrator-btn-delete" data-id="${workflow.id}">삭제</button>
              </div>
            </div>
          `;
        }).join('');

    container.innerHTML = `
      <div class="orchestrator-list-header">
        <span class="orchestrator-list-title">워크플로우 목록</span>
        <button class="orchestrator-btn orchestrator-btn-primary" id="orchestrator-create-btn">
          + 새 워크플로우
        </button>
      </div>
      <div class="workflow-list">
        ${workflowListHtml}
      </div>
    `;

    // Bind events
    container.querySelector('#orchestrator-create-btn')?.addEventListener('click', () => {
      this.showCreateView();
    });

    container.querySelectorAll('.orchestrator-btn-view').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.target as HTMLElement).dataset.id;
        if (id) {
          const workflow = this.workflows.find(w => w.id === id);
          if (workflow?.status === 'awaiting_approval') {
            this.showApprovalView(id);
          } else {
            this.showDetailView(id);
          }
        }
      });
    });

    container.querySelectorAll('.orchestrator-btn-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (e.target as HTMLElement).dataset.id;
        if (id) await this.deleteWorkflow(id);
      });
    });

    container.querySelectorAll('.workflow-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('orchestrator-btn')) return;
        const id = (item as HTMLElement).dataset.id;
        if (id) {
          const workflow = this.workflows.find(w => w.id === id);
          if (workflow?.status === 'awaiting_approval') {
            this.showApprovalView(id);
          } else {
            this.showDetailView(id);
          }
        }
      });
    });
  }

  private renderCreateView(container: HTMLElement): void {
    container.innerHTML = `
      <div class="orchestrator-form-header">
        <button class="orchestrator-btn orchestrator-btn-back" id="orchestrator-back-btn">&larr; 돌아가기</button>
        <span class="orchestrator-form-title">새 워크플로우</span>
      </div>
      <div class="orchestrator-form-body">
        <div class="orchestrator-form-field">
          <label class="orchestrator-form-label">작업 설명</label>
          <textarea
            class="orchestrator-form-textarea"
            id="orchestrator-task-input"
            rows="4"
            placeholder="구현하고자 하는 기능이나 작업을 상세히 설명해주세요..."
          ></textarea>
        </div>
        <div class="orchestrator-form-field orchestrator-form-checkbox-field">
          <label class="orchestrator-checkbox-label">
            <input type="checkbox" id="orchestrator-design-review-checkbox" checked>
            <span>설계 검토 포함</span>
          </label>
          <span class="orchestrator-form-hint">복잡한 작업의 경우 설계 검토 단계를 포함하는 것을 권장합니다.</span>
        </div>
        <div class="orchestrator-workflow-preview">
          <span class="orchestrator-preview-title">워크플로우 미리보기</span>
          <div class="orchestrator-preview-steps" id="orchestrator-preview-steps">
            <!-- Preview will be rendered here -->
          </div>
        </div>
      </div>
      <div class="orchestrator-form-footer">
        <button class="orchestrator-btn" id="orchestrator-cancel-btn">취소</button>
        <button class="orchestrator-btn orchestrator-btn-primary" id="orchestrator-start-btn">시작</button>
      </div>
    `;

    const updatePreview = () => {
      const includeReview = (container.querySelector('#orchestrator-design-review-checkbox') as HTMLInputElement)?.checked;
      const previewContainer = container.querySelector('#orchestrator-preview-steps');
      if (!previewContainer) return;

      const steps = [
        { icon: '📐', name: '설계자', desc: '아키텍처 및 구조 설계' },
      ];

      if (includeReview) {
        steps.push({ icon: '🔎', name: '설계 검토자', desc: '설계 품질, 확장성, 보안 검토' });
      }

      steps.push(
        { icon: '💻', name: '구현자', desc: '코드 작성' },
        { icon: '🔍', name: '코드 리뷰어', desc: '코드 품질 및 버그 검토' }
      );

      previewContainer.innerHTML = steps.map((step, index) => `
        <div class="orchestrator-preview-step">
          <span class="orchestrator-preview-step-number">${index + 1}</span>
          <span class="orchestrator-preview-step-icon">${step.icon}</span>
          <div class="orchestrator-preview-step-info">
            <span class="orchestrator-preview-step-name">${step.name}</span>
            <span class="orchestrator-preview-step-desc">${step.desc}</span>
          </div>
        </div>
      `).join('<div class="orchestrator-preview-arrow">&rarr;</div>');
    };

    // Initial preview
    updatePreview();

    // Update preview when checkbox changes
    container.querySelector('#orchestrator-design-review-checkbox')?.addEventListener('change', updatePreview);

    // Back button
    container.querySelector('#orchestrator-back-btn')?.addEventListener('click', () => {
      this.showListView();
    });

    // Cancel button
    container.querySelector('#orchestrator-cancel-btn')?.addEventListener('click', () => {
      this.showListView();
    });

    // Start button
    container.querySelector('#orchestrator-start-btn')?.addEventListener('click', async () => {
      const taskInput = container.querySelector('#orchestrator-task-input') as HTMLTextAreaElement;
      const reviewCheckbox = container.querySelector('#orchestrator-design-review-checkbox') as HTMLInputElement;

      const task = taskInput?.value.trim();
      if (!task) {
        alert('작업 설명을 입력해주세요.');
        return;
      }

      const includeReview = reviewCheckbox?.checked ?? true;

      try {
        const workflow = await window.electronAPI.orchestratorCreateWorkflow(task, includeReview);
        await this.loadData();
        this.showDetailView(workflow.id);

        // Auto-start the workflow
        this.runWorkflow(workflow.id);
      } catch (error) {
        console.error('Failed to create workflow:', error);
        alert('워크플로우 생성에 실패했습니다.');
      }
    });

    // Focus on textarea
    setTimeout(() => {
      (container.querySelector('#orchestrator-task-input') as HTMLTextAreaElement)?.focus();
    }, 100);
  }

  private renderDetailView(container: HTMLElement): void {
    const workflow = this.workflows.find(w => w.id === this.selectedWorkflowId);
    if (!workflow) {
      this.showListView();
      return;
    }

    const stepsHtml = workflow.steps.map((step, index) => {
      const agent = this.getAgentById(step.agentId);
      if (!agent) return '';

      const isExpanded = this.expandedSteps.has(`${workflow.id}-${index}`);
      const statusIcon = this.getStatusIcon(step.status);
      const statusClass = this.getStatusClass(step.status);

      let statusLabel = '';
      switch (step.status) {
        case 'pending': statusLabel = '대기'; break;
        case 'running': statusLabel = '진행 중'; break;
        case 'completed': statusLabel = '완료'; break;
        case 'failed': statusLabel = '실패'; break;
      }

      return `
        <div class="workflow-step ${statusClass}" data-index="${index}">
          <div class="workflow-step-header">
            <div class="workflow-step-info">
              <span class="workflow-step-icon">${agent.icon}</span>
              <div class="workflow-step-text">
                <span class="workflow-step-name">${agent.name}</span>
                <span class="workflow-step-desc">${agent.description}</span>
              </div>
            </div>
            <div class="workflow-step-status-area">
              <span class="workflow-step-status-label">${statusLabel}</span>
              <span class="workflow-step-status-icon ${statusClass}">${statusIcon}</span>
            </div>
          </div>
          ${step.output ? `
            <div class="workflow-step-content ${isExpanded ? 'expanded' : ''}">
              <button class="workflow-step-toggle" data-workflow="${workflow.id}" data-index="${index}">
                ${isExpanded ? '접기' : '자세히 보기'}
              </button>
              ${isExpanded ? `
                <div class="workflow-step-output">
                  <pre>${this.escapeHtml(step.output)}</pre>
                </div>
              ` : `
                <div class="workflow-step-preview">
                  ${this.escapeHtml(step.output.substring(0, 100))}${step.output.length > 100 ? '...' : ''}
                </div>
              `}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    let actionButtons = '';
    if (workflow.status === 'idle' || workflow.status === 'running') {
      const isRunning = workflow.status === 'running' || this.isRunning;
      actionButtons = `
        <button class="orchestrator-btn orchestrator-btn-primary" id="orchestrator-run-btn" ${isRunning ? 'disabled' : ''}>
          ${isRunning ? '실행 중...' : '실행'}
        </button>
      `;
    } else if (workflow.status === 'awaiting_approval') {
      actionButtons = `
        <button class="orchestrator-btn orchestrator-btn-primary" id="orchestrator-review-btn">
          결과 확인
        </button>
      `;
    }

    container.innerHTML = `
      <div class="orchestrator-form-header">
        <button class="orchestrator-btn orchestrator-btn-back" id="orchestrator-back-btn">&larr; 돌아가기</button>
        <span class="orchestrator-form-title">워크플로우 진행 상황</span>
        <span class="orchestrator-iteration-badge">반복: ${workflow.iteration}</span>
      </div>
      <div class="orchestrator-detail-body">
        <div class="workflow-task-display">
          <span class="workflow-task-label">작업:</span>
          <span class="workflow-task-text">${this.escapeHtml(workflow.task)}</span>
        </div>
        ${workflow.userFeedback ? `
          <div class="workflow-feedback-display">
            <span class="workflow-feedback-label">이전 피드백:</span>
            <span class="workflow-feedback-text">${this.escapeHtml(workflow.userFeedback)}</span>
          </div>
        ` : ''}
        <div class="workflow-steps">
          ${stepsHtml}
        </div>
      </div>
      <div class="orchestrator-form-footer">
        <button class="orchestrator-btn" id="orchestrator-reset-btn">초기화</button>
        ${actionButtons}
      </div>
    `;

    // Bind events
    container.querySelector('#orchestrator-back-btn')?.addEventListener('click', () => {
      this.showListView();
    });

    container.querySelector('#orchestrator-run-btn')?.addEventListener('click', () => {
      this.runWorkflow(workflow.id);
    });

    container.querySelector('#orchestrator-review-btn')?.addEventListener('click', () => {
      this.showApprovalView(workflow.id);
    });

    container.querySelector('#orchestrator-reset-btn')?.addEventListener('click', async () => {
      if (confirm('워크플로우를 초기화하시겠습니까? 모든 진행 상황이 삭제됩니다.')) {
        await window.electronAPI.orchestratorResetWorkflow(workflow.id);
        await this.loadData();
        this.renderContent();
      }
    });

    container.querySelectorAll('.workflow-step-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const workflowId = (e.target as HTMLElement).dataset.workflow;
        const index = (e.target as HTMLElement).dataset.index;
        if (workflowId && index !== undefined) {
          const key = `${workflowId}-${index}`;
          if (this.expandedSteps.has(key)) {
            this.expandedSteps.delete(key);
          } else {
            this.expandedSteps.add(key);
          }
          this.renderContent();
        }
      });
    });
  }

  private renderApprovalView(container: HTMLElement): void {
    const workflow = this.workflows.find(w => w.id === this.selectedWorkflowId);
    if (!workflow) {
      this.showListView();
      return;
    }

    const resultsHtml = workflow.steps.map((step, index) => {
      const agent = this.getAgentById(step.agentId);
      if (!agent) return '';

      const isExpanded = this.expandedSteps.has(`${workflow.id}-${index}`);

      return `
        <div class="approval-result" data-index="${index}">
          <div class="approval-result-header" data-workflow="${workflow.id}" data-index="${index}">
            <div class="approval-result-info">
              <span class="approval-result-icon">${agent.icon}</span>
              <span class="approval-result-name">${agent.name} 결과</span>
            </div>
            <button class="approval-result-toggle">${isExpanded ? '접기' : '펼치기'}</button>
          </div>
          ${isExpanded ? `
            <div class="approval-result-content">
              <pre>${this.escapeHtml(step.output || '출력 없음')}</pre>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="orchestrator-form-header">
        <button class="orchestrator-btn orchestrator-btn-back" id="orchestrator-back-btn">&larr; 돌아가기</button>
        <span class="orchestrator-form-title">결과 확인</span>
      </div>
      <div class="orchestrator-approval-body">
        <div class="approval-results">
          ${resultsHtml}
        </div>
        <div class="approval-feedback-section">
          <label class="orchestrator-form-label">피드백 (재작업 시 반영됨)</label>
          <textarea
            class="orchestrator-form-textarea"
            id="orchestrator-feedback-input"
            rows="3"
            placeholder="개선이 필요한 부분이나 추가 요구사항을 입력하세요..."
          ></textarea>
        </div>
      </div>
      <div class="orchestrator-form-footer">
        <button class="orchestrator-btn orchestrator-btn-warning" id="orchestrator-reject-btn">
          재작업
        </button>
        <button class="orchestrator-btn orchestrator-btn-success" id="orchestrator-approve-btn">
          승인 및 완료
        </button>
      </div>
    `;

    // Bind events
    container.querySelector('#orchestrator-back-btn')?.addEventListener('click', () => {
      this.showDetailView(workflow.id);
    });

    container.querySelectorAll('.approval-result-header').forEach(header => {
      header.addEventListener('click', (e) => {
        const workflowId = (header as HTMLElement).dataset.workflow;
        const index = (header as HTMLElement).dataset.index;
        if (workflowId && index !== undefined) {
          const key = `${workflowId}-${index}`;
          if (this.expandedSteps.has(key)) {
            this.expandedSteps.delete(key);
          } else {
            this.expandedSteps.add(key);
          }
          this.renderContent();
        }
      });
    });

    container.querySelector('#orchestrator-approve-btn')?.addEventListener('click', async () => {
      try {
        await window.electronAPI.orchestratorApproveWorkflow(workflow.id);
        await this.loadData();
        this.showListView();
      } catch (error) {
        console.error('Failed to approve workflow:', error);
        alert('워크플로우 승인에 실패했습니다.');
      }
    });

    container.querySelector('#orchestrator-reject-btn')?.addEventListener('click', async () => {
      const feedbackInput = container.querySelector('#orchestrator-feedback-input') as HTMLTextAreaElement;
      const feedback = feedbackInput?.value.trim() || '';

      try {
        await window.electronAPI.orchestratorRejectWorkflow(workflow.id, feedback);
        await this.loadData();
        this.showDetailView(workflow.id);

        // Auto-start rework
        this.runWorkflow(workflow.id);
      } catch (error) {
        console.error('Failed to reject workflow:', error);
        alert('재작업 요청에 실패했습니다.');
      }
    });
  }

  private async runWorkflow(workflowId: string): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.renderContent();

    try {
      // Run all steps
      await window.electronAPI.orchestratorRunAllSteps(workflowId);
      await this.loadData();

      // Check if approval is needed
      const workflow = this.workflows.find(w => w.id === workflowId);
      if (workflow?.status === 'awaiting_approval') {
        this.showApprovalView(workflowId);
      } else {
        this.renderContent();
      }
    } catch (error) {
      console.error('Failed to run workflow:', error);
      alert('워크플로우 실행 중 오류가 발생했습니다.');
      this.renderContent();
    } finally {
      this.isRunning = false;
    }
  }

  private async deleteWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.find(w => w.id === workflowId);
    if (!workflow) return;

    const confirmed = confirm(`"${workflow.name}" 워크플로우를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`);
    if (!confirmed) return;

    try {
      await window.electronAPI.orchestratorDeleteWorkflow(workflowId);
      await this.loadData();
      this.renderContent();
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      alert('워크플로우 삭제에 실패했습니다.');
    }
  }

  private showListView(): void {
    this.currentView = 'list';
    this.selectedWorkflowId = null;
    this.expandedSteps.clear();
    this.renderContent();
  }

  private showCreateView(): void {
    this.currentView = 'create';
    this.renderContent();
  }

  private showDetailView(workflowId: string): void {
    this.currentView = 'detail';
    this.selectedWorkflowId = workflowId;
    this.renderContent();
  }

  private showApprovalView(workflowId: string): void {
    this.currentView = 'approval';
    this.selectedWorkflowId = workflowId;
    // Expand all steps by default in approval view
    const workflow = this.workflows.find(w => w.id === workflowId);
    if (workflow) {
      workflow.steps.forEach((_, index) => {
        this.expandedSteps.add(`${workflowId}-${index}`);
      });
    }
    this.renderContent();
  }

  async show(): Promise<void> {
    this.isVisible = true;
    this.element.classList.add('visible');
    await this.loadData();
    this.showListView();
  }

  hide(): void {
    this.isVisible = false;
    this.element.classList.remove('visible');
  }

  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  get visible(): boolean {
    return this.isVisible;
  }
}

export const orchestratorPanel = new OrchestratorPanel();
