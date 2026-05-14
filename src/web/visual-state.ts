import type {
  DiscussionMessage,
  DiscussionSession,
  ExecutionAction,
  ExecutionResult
} from "../types.js";
import type { LiveSessionEvent } from "./live-types.js";
import type {
  AgentVisualState,
  RunnerVisualState,
  VisualWorkbenchState,
  WebSessionReplay
} from "./types.js";

export interface CreateLiveVisualStateInput {
  sessionId: string;
  topic: string;
  agents: DiscussionSession["agents"];
  createdAt?: string;
}

export function createLiveVisualState(input: CreateLiveVisualStateInput): VisualWorkbenchState {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return {
    sessionId: input.sessionId,
    topic: input.topic,
    runner: {
      status: "queued",
      currentActivity: "Session queued",
      updatedAt: createdAt
    },
    agents: input.agents.map((agent) => ({
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      status: "idle",
      currentActivity: "Waiting for runner",
      updatedAt: createdAt
    }))
  };
}

export function projectReplayVisualState(replay: WebSessionReplay): VisualWorkbenchState {
  let state = createLiveVisualState({
    sessionId: replay.session.sessionId,
    topic: replay.session.topic,
    agents: replay.session.agents,
    createdAt: replay.session.createdAt
  });

  state = {
    ...state,
    runner: runnerFromSession(replay.session)
  };

  for (const message of replay.messages) {
    state = applyMessage(state, message, message.createdAt);
  }

  for (const action of replay.actions) {
    state = applyAction(state, action, action.createdAt);
  }

  for (const result of replay.executionResults) {
    state = applyExecutionResult(state, result, result.completedAt);
  }

  if (replay.session.status === "completed") {
    return completeState(state, replay.session.updatedAt);
  }

  if (replay.session.status === "failed") {
    return failState(state, "Session failed", replay.session.updatedAt);
  }

  return state;
}

export function applyLiveVisualEvent(
  state: VisualWorkbenchState,
  event: LiveSessionEvent
): VisualWorkbenchState {
  switch (event.type) {
    case "session.queued":
      return {
        ...state,
        runner: {
          status: "queued",
          currentActivity: "Session queued",
          updatedAt: event.createdAt
        }
      };
    case "session.started":
      return {
        ...state,
        runner: {
          status: "running",
          currentActivity: "Coordinating session",
          updatedAt: event.createdAt
        },
        agents: state.agents.map((agent) =>
          terminalAgent(agent) ? agent : {
            ...agent,
            status: "idle",
            currentActivity: "Waiting for turn",
            updatedAt: event.createdAt
          }
        )
      };
    case "speaker.active":
      return {
        ...state,
        runner: {
          status: "running",
          currentActivity: `${event.data.agentName ?? event.data.agentId} is active`,
          updatedAt: event.createdAt
        },
        agents: state.agents.map((agent) => {
          if (agent.agentId === event.data.agentId) {
            return {
              ...agent,
              name: event.data.agentName ?? agent.name,
              role: event.data.role ?? agent.role,
              status: "thinking",
              currentActivity: `Round ${event.data.round}: preparing response`,
              updatedAt: event.createdAt
            };
          }
          return terminalAgent(agent) ? agent : {
            ...agent,
            status: "idle",
            currentActivity: "Waiting for turn",
            updatedAt: event.createdAt
          };
        })
      };
    case "message.appended":
      return applyMessage(state, event.data.message, event.createdAt);
    case "action.created":
      return applyAction(state, event.data.action, event.createdAt);
    case "execution.result":
      return applyExecutionResult(state, event.data.result, event.createdAt);
    case "session.completed":
      return completeState(state, event.createdAt);
    case "session.failed":
      return failState(state, event.data.error ?? "Session failed", event.createdAt);
  }
}

function runnerFromSession(session: DiscussionSession): RunnerVisualState {
  switch (session.status) {
    case "completed":
      return {
        status: "completed",
        currentActivity: "Session completed",
        updatedAt: session.updatedAt
      };
    case "failed":
      return {
        status: "failed",
        currentActivity: "Session failed",
        updatedAt: session.updatedAt
      };
    case "created":
      return {
        status: "queued",
        currentActivity: "Session queued",
        updatedAt: session.updatedAt
      };
    case "running":
      return {
        status: "running",
        currentActivity: "Session in progress",
        updatedAt: session.updatedAt
      };
  }
}

function applyMessage(
  state: VisualWorkbenchState,
  message: DiscussionMessage,
  updatedAt: string
): VisualWorkbenchState {
  return {
    ...state,
    runner: {
      status: state.runner.status === "queued" ? "running" : state.runner.status,
      currentActivity: `${message.senderName} responded`,
      updatedAt
    },
    agents: state.agents.map((agent) =>
      agent.agentId === message.senderId
        ? {
            ...agent,
            name: message.senderName,
            role: message.senderRole ?? agent.role,
            status: "speaking",
            currentActivity: `Round ${message.round}: shared response`,
            lastMessagePreview: preview(message.content),
            updatedAt
          }
        : agent
    )
  };
}

function applyAction(
  state: VisualWorkbenchState,
  action: ExecutionAction,
  updatedAt: string
): VisualWorkbenchState {
  return {
    ...state,
    runner: {
      status: state.runner.status === "queued" ? "running" : state.runner.status,
      currentActivity: `${action.agentId} created action`,
      updatedAt
    },
    agents: state.agents.map((agent) =>
      agent.agentId === action.agentId
        ? {
            ...agent,
            status: "executing",
            currentActivity: "Executing workspace action",
            lastActionSummary: summarizeAction(action),
            updatedAt
          }
        : agent
    )
  };
}

function applyExecutionResult(
  state: VisualWorkbenchState,
  result: ExecutionResult,
  updatedAt: string
): VisualWorkbenchState {
  const status = result.status === "failed" ? "failed" : "reviewing";
  return {
    ...state,
    runner: {
      status: state.runner.status === "queued" ? "running" : state.runner.status,
      currentActivity: `${result.agentId} execution ${result.status}`,
      updatedAt
    },
    agents: state.agents.map((agent) =>
      agent.agentId === result.agentId
        ? {
            ...agent,
            status,
            currentActivity: result.status === "failed" ? "Execution failed" : "Reviewing execution result",
            lastExecutionSummary: `${result.status}: ${result.summary}`,
            updatedAt
          }
        : agent
    )
  };
}

function completeState(state: VisualWorkbenchState, updatedAt: string): VisualWorkbenchState {
  return {
    ...state,
    runner: {
      status: "completed",
      currentActivity: "Session completed",
      updatedAt
    },
    agents: state.agents.map((agent) =>
      agent.status === "failed"
        ? agent
        : {
            ...agent,
            status: "completed",
            currentActivity: "Session completed",
            updatedAt
          }
    )
  };
}

function failState(
  state: VisualWorkbenchState,
  reason: string,
  updatedAt: string
): VisualWorkbenchState {
  return {
    ...state,
    runner: {
      status: "failed",
      currentActivity: reason,
      updatedAt
    },
    agents: state.agents.map((agent) =>
      agent.status === "completed"
        ? agent
        : {
            ...agent,
            status: "failed",
            currentActivity: reason,
            updatedAt
          }
    )
  };
}

function terminalAgent(agent: AgentVisualState): boolean {
  return agent.status === "completed" || agent.status === "failed";
}

function summarizeAction(action: ExecutionAction): string {
  switch (action.type) {
    case "run_command":
      return [action.type, action.command, ...(action.args ?? [])].filter(Boolean).join(" ");
    case "read_file":
    case "write_file":
    case "mkdir":
      return [action.type, action.path].filter(Boolean).join(" ");
    case "git_commit":
      return [action.type, action.message].filter(Boolean).join(" ");
    case "git_status":
    case "git_diff":
      return action.type;
  }
}

function preview(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 180) {
    return normalized;
  }
  return `${normalized.slice(0, 180).trimEnd()}...`;
}
