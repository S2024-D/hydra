import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// Agent Role Definition
export interface AgentRole {
  id: string;
  name: string;
  description: string;
  icon: string;
  systemPrompt: string;
}

// Workflow Step
export interface WorkflowStep {
  agentId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: string;
  output?: string;
  startedAt?: number;
  completedAt?: number;
}

// Workflow Configuration
export interface WorkflowConfig {
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

// Orchestrator State
export interface OrchestratorState {
  workflows: WorkflowConfig[];
  agents: AgentRole[];
}

// Default Agent Definitions
export const DEFAULT_AGENTS: AgentRole[] = [
  {
    id: 'designer',
    name: '설계자',
    description: '아키텍처 및 구조 설계',
    icon: '📐',
    systemPrompt: 'You are a software architect. Your role is to design system architecture, define data structures, plan API endpoints, and create technical specifications. Focus on scalability, maintainability, and best practices.',
  },
  {
    id: 'design_reviewer',
    name: '설계 검토자',
    description: '설계 품질, 확장성, 보안 검토',
    icon: '🔎',
    systemPrompt: 'You are a design reviewer. Your role is to review software designs for quality, scalability, security vulnerabilities, and adherence to best practices. Provide constructive feedback and identify potential issues.',
  },
  {
    id: 'implementer',
    name: '구현자',
    description: '코드 작성',
    icon: '💻',
    systemPrompt: 'You are a software developer. Your role is to implement features based on provided designs and specifications. Write clean, efficient, and well-documented code following best practices.',
  },
  {
    id: 'code_reviewer',
    name: '코드 리뷰어',
    description: '코드 품질 및 버그 검토',
    icon: '🔍',
    systemPrompt: 'You are a code reviewer. Your role is to review code for quality, potential bugs, performance issues, and adherence to coding standards. Provide specific feedback and suggestions for improvement.',
  },
];

class OrchestratorManager {
  private configPath: string;
  private state: OrchestratorState;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.configPath = path.join(userDataPath, 'orchestrator.json');
    this.state = {
      workflows: [],
      agents: [...DEFAULT_AGENTS],
    };
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const saved = JSON.parse(data);
        this.state = {
          workflows: saved.workflows || [],
          agents: saved.agents?.length > 0 ? saved.agents : [...DEFAULT_AGENTS],
        };
      }
    } catch (error) {
      console.error('Failed to load orchestrator config:', error);
      this.state = {
        workflows: [],
        agents: [...DEFAULT_AGENTS],
      };
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.state, null, 2));
    } catch (error) {
      console.error('Failed to save orchestrator config:', error);
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // Get all agents
  getAgents(): AgentRole[] {
    return [...this.state.agents];
  }

  // Get agent by ID
  getAgent(id: string): AgentRole | null {
    return this.state.agents.find(a => a.id === id) || null;
  }

  // Get all workflows
  getWorkflows(): WorkflowConfig[] {
    return [...this.state.workflows];
  }

  // Get workflow by ID
  getWorkflow(id: string): WorkflowConfig | null {
    return this.state.workflows.find(w => w.id === id) || null;
  }

  // Create a new workflow
  createWorkflow(task: string, includeDesignReview: boolean): WorkflowConfig {
    // Build steps based on whether design review is included
    const steps: WorkflowStep[] = [
      {
        agentId: 'designer',
        status: 'pending',
      },
    ];

    if (includeDesignReview) {
      steps.push({
        agentId: 'design_reviewer',
        status: 'pending',
      });
    }

    steps.push(
      {
        agentId: 'implementer',
        status: 'pending',
      },
      {
        agentId: 'code_reviewer',
        status: 'pending',
      }
    );

    const workflow: WorkflowConfig = {
      id: this.generateId(),
      name: task.substring(0, 50) + (task.length > 50 ? '...' : ''),
      task,
      includeDesignReview,
      status: 'idle',
      currentStep: 0,
      steps,
      iteration: 1,
      createdAt: Date.now(),
    };

    this.state.workflows.unshift(workflow);
    this.save();
    return workflow;
  }

  // Mock agent execution - returns placeholder response
  private async runAgentStep(agent: AgentRole, input: string, previousOutputs: string[]): Promise<string> {
    // Mock implementation - simulate delay
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

    // Return mock response based on agent type
    switch (agent.id) {
      case 'designer':
        return `## 설계 문서

### 개요
"${input}"에 대한 시스템 설계입니다.

### 아키텍처
- 레이어드 아키텍처 적용
- 프레젠테이션 레이어 / 비즈니스 로직 레이어 / 데이터 액세스 레이어

### API 구조
- GET /api/v1/resource - 리소스 목록 조회
- POST /api/v1/resource - 리소스 생성
- PUT /api/v1/resource/:id - 리소스 수정
- DELETE /api/v1/resource/:id - 리소스 삭제

### 데이터 모델
\`\`\`typescript
interface Resource {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
\`\`\`

### 보안 고려사항
- JWT 기반 인증
- Rate limiting 적용
- Input validation`;

      case 'design_reviewer':
        return `## 설계 검토 결과

### 검토 요약
설계 문서를 검토한 결과, 전반적으로 양호한 구조입니다.

### 체크리스트
- [x] 아키텍처 패턴 적절
- [x] API 설계 RESTful 원칙 준수
- [x] 데이터 모델 명확함
- [x] 보안 고려사항 포함

### 권장사항
1. 에러 핸들링 전략 추가 권장
2. 캐싱 전략 고려 필요
3. 로깅 및 모니터링 방안 추가 권장

### 결론
설계 승인됨. 구현 단계로 진행 가능합니다.`;

      case 'implementer':
        const designOutput = previousOutputs[0] || '';
        return `## 구현 결과

### 구현된 파일
다음 파일들이 구현되었습니다:

#### src/controllers/resource.controller.ts
\`\`\`typescript
import { Request, Response } from 'express';
import { ResourceService } from '../services/resource.service';

export class ResourceController {
  private service: ResourceService;

  constructor() {
    this.service = new ResourceService();
  }

  async getAll(req: Request, res: Response) {
    try {
      const resources = await this.service.findAll();
      res.json({ success: true, data: resources });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const resource = await this.service.create(req.body);
      res.status(201).json({ success: true, data: resource });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
\`\`\`

#### src/services/resource.service.ts
\`\`\`typescript
import { Resource } from '../models/resource.model';

export class ResourceService {
  async findAll(): Promise<Resource[]> {
    // Implementation
    return [];
  }

  async create(data: Partial<Resource>): Promise<Resource> {
    // Implementation
    return { id: '1', name: data.name || '', createdAt: new Date(), updatedAt: new Date() };
  }
}
\`\`\`

### 테스트
기본 단위 테스트가 작성되었습니다.`;

      case 'code_reviewer':
        return `## 코드 리뷰 결과

### 리뷰 요약
구현된 코드를 검토한 결과입니다.

### 체크리스트
- [x] 코드 스타일 일관성
- [x] 타입 안정성
- [x] 에러 핸들링
- [ ] 테스트 커버리지 (개선 필요)

### 발견된 이슈
1. **낮은 심각도**: 일부 매직 넘버 상수화 권장
2. **중간 심각도**: 입력 검증 로직 추가 필요

### 개선 제안
1. DTO 클래스 추가하여 입력 검증 강화
2. 에러 타입별 커스텀 예외 클래스 생성 권장
3. 통합 테스트 추가 권장

### 결론
전반적으로 양호한 코드 품질입니다. 제안된 개선사항 적용 시 더 견고한 코드가 될 것입니다.

승인 권장: 마이너 수정 후 머지 가능`;

      default:
        return `${agent.name}의 작업이 완료되었습니다.`;
    }
  }

  // Run the next step in the workflow
  async runStep(workflowId: string): Promise<WorkflowConfig | null> {
    const workflow = this.state.workflows.find(w => w.id === workflowId);
    if (!workflow) return null;

    if (workflow.currentStep >= workflow.steps.length) {
      workflow.status = 'awaiting_approval';
      this.save();
      return workflow;
    }

    const step = workflow.steps[workflow.currentStep];
    const agent = this.getAgent(step.agentId);
    if (!agent) return null;

    // Update status to running
    workflow.status = 'running';
    step.status = 'running';
    step.startedAt = Date.now();
    this.save();

    try {
      // Collect previous outputs for context
      const previousOutputs = workflow.steps
        .slice(0, workflow.currentStep)
        .map(s => s.output || '');

      // Build input: task + user feedback (if any, for rework iterations)
      let input = workflow.task;
      if (workflow.userFeedback && workflow.iteration > 1) {
        input = `${workflow.task}\n\n--- 사용자 피드백 (반복 ${workflow.iteration}) ---\n${workflow.userFeedback}`;
      }

      // Run the agent step
      const output = await this.runAgentStep(agent, input, previousOutputs);

      // Update step with result
      step.status = 'completed';
      step.output = output;
      step.completedAt = Date.now();

      // Move to next step
      workflow.currentStep++;

      // Check if workflow is complete
      if (workflow.currentStep >= workflow.steps.length) {
        workflow.status = 'awaiting_approval';
      }

      this.save();
      return workflow;
    } catch (error) {
      step.status = 'failed';
      step.output = error instanceof Error ? error.message : 'Unknown error occurred';
      step.completedAt = Date.now();
      workflow.status = 'idle';
      this.save();
      return workflow;
    }
  }

  // Run all remaining steps
  async runAllSteps(workflowId: string): Promise<WorkflowConfig | null> {
    let workflow = this.getWorkflow(workflowId);
    if (!workflow) return null;

    while (workflow && workflow.currentStep < workflow.steps.length && workflow.status !== 'awaiting_approval') {
      workflow = await this.runStep(workflowId);
      if (!workflow) break;
    }

    return workflow;
  }

  // Approve workflow
  approveWorkflow(workflowId: string): WorkflowConfig | null {
    const workflow = this.state.workflows.find(w => w.id === workflowId);
    if (!workflow) return null;

    workflow.status = 'completed';
    this.save();
    return workflow;
  }

  // Reject workflow and request rework
  rejectWorkflow(workflowId: string, feedback: string): WorkflowConfig | null {
    const workflow = this.state.workflows.find(w => w.id === workflowId);
    if (!workflow) return null;

    // Increment iteration
    workflow.iteration++;
    workflow.userFeedback = feedback;
    workflow.status = 'idle';
    workflow.currentStep = 0;

    // Reset all steps
    workflow.steps.forEach(step => {
      step.status = 'pending';
      step.input = undefined;
      step.output = undefined;
      step.startedAt = undefined;
      step.completedAt = undefined;
    });

    this.save();
    return workflow;
  }

  // Delete workflow
  deleteWorkflow(workflowId: string): boolean {
    const index = this.state.workflows.findIndex(w => w.id === workflowId);
    if (index === -1) return false;

    this.state.workflows.splice(index, 1);
    this.save();
    return true;
  }

  // Reset workflow to start
  resetWorkflow(workflowId: string): WorkflowConfig | null {
    const workflow = this.state.workflows.find(w => w.id === workflowId);
    if (!workflow) return null;

    workflow.status = 'idle';
    workflow.currentStep = 0;
    workflow.userFeedback = undefined;

    // Reset all steps
    workflow.steps.forEach(step => {
      step.status = 'pending';
      step.input = undefined;
      step.output = undefined;
      step.startedAt = undefined;
      step.completedAt = undefined;
    });

    this.save();
    return workflow;
  }
}

export const orchestratorManager = new OrchestratorManager();
