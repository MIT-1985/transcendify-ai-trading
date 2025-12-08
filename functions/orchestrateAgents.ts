import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const AGENT_PROMPTS = {
  data_analysis: `You are a Data Analysis Agent. Your role:
- Analyze market data, price movements, volume patterns
- Identify trends, patterns, and anomalies
- Provide statistical insights and correlations
- Answer queries from other agents with data-driven insights
Format your responses as structured JSON.`,

  strategy_optimization: `You are a Strategy Optimization Agent. Your role:
- Optimize trading strategies based on market conditions
- Backtest and validate strategy parameters
- Recommend risk-adjusted position sizing
- Collaborate with other agents to refine strategies
Provide actionable recommendations in JSON format.`,

  news_sentiment: `You are a News Sentiment Agent. Your role:
- Analyze news articles and social media sentiment
- Assess market impact of news events
- Provide sentiment scores and context
- Alert other agents to significant events
Return sentiment analysis in structured JSON.`,

  risk_assessment: `You are a Risk Assessment Agent. Your role:
- Evaluate portfolio risk exposure
- Calculate VaR, drawdown, and correlation metrics
- Monitor position sizes and leverage
- Warn other agents about high-risk situations
Provide risk metrics in JSON format.`,

  orchestrator: `You are the Orchestrator Agent. Your role:
- Coordinate between multiple specialized agents
- Break down complex tasks into subtasks
- Synthesize insights from different agents
- Make final trading recommendations
Provide coordinated decisions in JSON format.`
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, task, workflow } = await req.json();

    if (action === 'executeTask') {
      return await executeTask(base44, task);
    }

    if (action === 'runWorkflow') {
      return await runWorkflow(base44, workflow);
    }

    if (action === 'agentQuery') {
      return await handleAgentQuery(base44, task);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Orchestration error:', error);
    return Response.json({ 
      error: error.message,
      stack: Deno.env.get('NODE_ENV') === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
});

async function executeTask(base44, task) {
  const { agent_id, task_type, input_data, requested_by } = task;

  // Get agent
  const agents = await base44.entities.AIAgent.filter({ id: agent_id });
  const agent = agents[0];

  if (!agent || !agent.is_active) {
    throw new Error('Agent not found or inactive');
  }

  // Load relevant TROK constants for the agent's domain
  let relevantConstants = [];
  try {
    const domainMap = {
      'data_analysis': 'Signal Processing',
      'strategy_optimization': 'Artificial Intelligence',
      'news_sentiment': 'Information Theory',
      'risk_assessment': 'Economics',
      'execution': 'DimGPT Grid'
    };
    
    const domain = domainMap[agent.type];
    if (domain) {
      const constants = await base44.entities.GlobalIntelligenceLaw.filter({ domain });
      relevantConstants = constants
        .filter(c => (c.kpi_value || 0) >= 0.85 && c.use_cases_notes?.includes('AI optimization'))
        .slice(0, 5);
    }
  } catch (e) {
    console.log('Could not load constants:', e.message);
  }

  // Create task record
  const agentTask = await base44.entities.AgentTask.create({
    agent_id,
    task_type,
    input_data,
    requested_by,
    status: 'running',
    started_at: new Date().toISOString()
  });

  try {
    // Update agent status
    await base44.entities.AIAgent.update(agent_id, { 
      status: 'busy',
      last_active: new Date().toISOString()
    });

    // Execute task using AI with TROK constants context
    const constantsContext = relevantConstants.length > 0 ? `

TROK Constants (Theory of Relative Optimizing Constants):
${relevantConstants.map(c => `- ${c.law_principle}: ${c.formula_statement} (KPI: ${c.kpi_value?.toFixed(3)}, Use: ${c.use_cases_notes})`).join('\n')}

Use these constants to inform your analysis and optimize recommendations.` : '';

    const prompt = `${AGENT_PROMPTS[agent.type]}
${constantsContext}

Task: ${task_type}
Input: ${JSON.stringify(input_data, null, 2)}

Analyze using TROK constants and provide your response in JSON format.`;

    const response = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          result: { type: "object" },
          confidence: { type: "number" },
          reasoning: { type: "string" },
          recommendations: { type: "array", items: { type: "string" } }
        }
      }
    });

    // Update task with results
    await base44.entities.AgentTask.update(agentTask.id, {
      status: 'completed',
      output_data: response,
      completed_at: new Date().toISOString()
    });

    // Update agent
    await base44.entities.AIAgent.update(agent_id, {
      status: 'idle',
      tasks_completed: (agent.tasks_completed || 0) + 1,
      last_active: new Date().toISOString()
    });

    return Response.json({ 
      success: true, 
      task_id: agentTask.id, 
      result: response 
    });

  } catch (error) {
    await base44.entities.AgentTask.update(agentTask.id, {
      status: 'failed',
      error_message: error.message,
      completed_at: new Date().toISOString()
    });

    await base44.entities.AIAgent.update(agent_id, { status: 'error' });

    throw error;
  }
}

async function handleAgentQuery(base44, query) {
  const { from_agent, to_agent, message, context } = query;

  // Record conversation
  const conversation = await base44.entities.AgentConversation.create({
    from_agent,
    to_agent,
    message_type: 'query',
    message,
    context,
    status: 'sent'
  });

  // Get target agent
  const agents = await base44.entities.AIAgent.filter({ id: to_agent });
  const agent = agents[0];

  if (!agent) {
    throw new Error('Target agent not found');
  }

  // Execute query on target agent
  const prompt = `${AGENT_PROMPTS[agent.type]}

Query from another agent: ${JSON.stringify(message)}
Context: ${JSON.stringify(context)}

Provide your response in JSON format.`;

  const response = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: "object",
      properties: {
        answer: { type: "object" },
        confidence: { type: "number" },
        additional_info: { type: "object" }
      }
    }
  });

  // Record response
  await base44.entities.AgentConversation.create({
    from_agent: to_agent,
    to_agent: from_agent,
    message_type: 'response',
    message: response,
    context,
    status: 'sent'
  });

  await base44.entities.AgentConversation.update(conversation.id, { status: 'processed' });

  return Response.json({ success: true, response });
}

async function runWorkflow(base44, workflow) {
  const { steps, initial_data } = workflow;
  const results = [];
  let currentData = initial_data;

  for (const step of steps) {
    const { agent_id, task_type, transform } = step;

    // Execute task
    const taskResult = await executeTask(base44, {
      agent_id,
      task_type,
      input_data: currentData,
      requested_by: 'workflow_engine'
    });

    results.push({
      agent_id,
      task_type,
      result: taskResult
    });

    // Transform data for next step
    if (transform) {
      currentData = { ...currentData, ...taskResult.result };
    } else {
      currentData = taskResult.result;
    }
  }

  return Response.json({
    success: true,
    workflow_results: results,
    final_output: currentData
  });
}