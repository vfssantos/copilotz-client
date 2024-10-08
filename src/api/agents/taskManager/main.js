// taskManager/main.js
import validate from "axion-modules/connectors/validator.ts";

const maxIter = 3;

const taskManager = async (
    { answer, threadLogs, instructions, input, audio, user, thread, options, iterations = 0, outputSchema, overrideBaseOutputSchema, agentType },
    res
) => {
    console.log(`[taskManager] Starting iteration ${iterations}`);

    agentType = agentType || 'taskManager';

    let currentStep;
    let workflow;
    let taskDoc;

    // Extract Dependencies
    const { models, modules, resources, utils } = taskManager;
    console.log('RESOURCES', { ...resources })
    const { createPrompt, getThreadHistory, jsonSchemaToShortSchema, mergeSchemas } = utils;
    const { agents } = modules;

    // Extract resources
    const { copilotz, config } = resources;
    const { job } = copilotz || {};
    const { workflows: jobWorkflows } = job || {};
    const { workflows: copilotWorkflows } = copilotz || {};
    const allWorkflows = [...(jobWorkflows || []), ...(copilotWorkflows || [])];

    const { extId: externalId } = thread;

    // 1.3 Override Base Schemas
    const baseOutputSchema = overrideBaseOutputSchema || _baseOutputSchema;

    // 1.4. Extract and Merge Schemas
    outputSchema = outputSchema ? mergeSchemas(baseOutputSchema, outputSchema) : baseOutputSchema;

    // 1. Get or Create Task
    console.log(`[taskManager] Searching for active task with extId: ${externalId}`);
    taskDoc = await models.tasks.findOne(
        { extId: externalId, status: 'active' },
        { sort: { updatedAt: -1 } }
    );
    console.log(`[taskManager] Task found: ${taskDoc ? 'Yes' : 'No'}`);

    const actionModules = {
        createTask: async (args) => {
            // Let the assistant decide which workflow to start based on user input
            const workflowName = args.workflowName;
            if (!workflowName) {
                throw new Error('Error creating task: `workflowName` arg is required, found:', +Object.keys(args).join(','));
            }
            const selectedWorkflow = allWorkflows.find(
                (wf) => wf.name.toLowerCase() === workflowName.toLowerCase()
            );

            if (!selectedWorkflow) {
                throw new Error(`Workflow "${workflowName}" not found`);
            }

            const taskData = {
                name: selectedWorkflow.name,
                description: selectedWorkflow.description,
                context: { user },
                extId: externalId,
                status: 'active',
                workflow: selectedWorkflow._id,
                currentStep: selectedWorkflow.firstStep,
            };
            const newTask = await models.tasks.create(taskData);
            taskDoc = newTask;
            workflow = selectedWorkflow;
            console.log(`[taskManager] New task created: ${newTask._id}`);
            return taskData
        },
        listSteps: () => workflow.steps.map((step) => ({ name: step.name, description: step.description })),
        getStep: ({ name }) => {
            const step = workflow.steps.find((step) => step.name === name);
            if (!step) {
                throw new Error(`Step "${name}" not found in workflow "${workflow.name}"`);
            }
            return step;
        },
        submit: (args) => args,
        changeStep: async ({ name }) => {
            const step = workflow.steps.find((step) => step.name === name);
            if (!step) {
                throw new Error(`Step "${name}" not found in workflow "${workflow.name}"`);
            }
            const updatedTask = await models.tasks.update({ _id: taskDoc._id }, { currentStep: step._id });
            return { name: step.name, description: step.description, id: step._id };
        },
    };

    const actionSpecs = {
        createTask: `(creates a new task): !workflowName<string>(name of the workflow to start)->(returns task object)`,
        changeStep: `(changes current step): !name<string>(name of the step to change to)->(returns string 'step changed')`,
        listSteps: `(lists all steps in the workflow): ->(returns array of step names)`,
        getStep: `(gets step details by name): !name<string>(name of the step)->(returns step details)`,
        submit: `(submits step completion): <any>(object with "any" type to be stored in context for future references)->(returns the current step's context)`,
    };

    Object.keys(actionModules).filter(Boolean).forEach((actionName) => {
        actionModules[actionName].spec = actionSpecs[actionName];
    });

    if (taskDoc) {
        console.log(`[taskManager] Fetching workflow and current step`);
        workflow = await models.workflows.findOne({ _id: taskDoc.workflow }, { populate: ['steps'] });
        currentStep = await models.steps.findOne({ _id: taskDoc.currentStep }, { populate: ['actions'] });

        if (currentStep?.job?._id && currentStep?.job?._id !== copilotz?.job?._id) {
            const job = await models.jobs.findOne({ _id: currentStep.job }, { populate: ['actions'] });
            copilotz.job = job;
        }

        console.log(`[taskManager] Current step: ${currentStep.name}`);

        // 2. Get current step details
        const {
            name: stepName,
            instructions: stepInstructions,
            submitWhen,
        } = currentStep;

        copilotz.actions = [
            ...(copilotz.actions || []),
            ...(copilotz?.job?.actions || []),
            ...(currentStep?.actions || []),
        ].filter(Boolean);

        // 3. Create Instructions
        const taskManagerPrompt = createPrompt(currentTaskPromptTemplate, {
            workflow: workflow.name,
            workflowDescription: workflow.description,
            steps: workflow.steps.map((step) => step.name).join(', '),
            stepInstructions,
            stepName,
            context: JSON.stringify(taskDoc.context),
            submitWhen,
        });

        instructions = taskManagerPrompt + instructions;
    } else {
        // No active task found
        // Assistant should decide whether to start a task based on user input
        // Provide the assistant with available workflows
        const availableWorkflowsPrompt = createPrompt(availableWorkflowsTemplate, {
            workflows: allWorkflows.filter(Boolean).map((wf) => `- ${wf.name}: ${wf.description}`).join('\n'),
        });

        instructions = availableWorkflowsPrompt + instructions;
    }

    console.log(`[taskManager] Fetching thread history`);
    if (!threadLogs || !threadLogs?.length) {
        const lastLog = await getThreadHistory(thread.extId, { functionName: 'taskManager', maxRetries: 10 })
        if (lastLog) {
            const { prompt, ...agentResponse } = lastLog;
            threadLogs = prompt || [];
            const validatedLastAgentResponse = validate(jsonSchemaToShortSchema(outputSchema), agentResponse);
            threadLogs.push({ role: 'assistant', content: JSON.stringify(validatedLastAgentResponse) });
        } else {
            threadLogs = [];
        }
    }

    const functionCallAgent = agents.functionCall;
    Object.assign(functionCallAgent, taskManager);

    console.log(`[taskManager] Calling functionCall agent`);
    const functionCallAgentResponse = await functionCallAgent(
        {
            actionModules,
            instructions,
            input,
            audio,
            user,
            thread,
            answer,
            options,
            threadLogs,
            agentType
        },
        res
    );
    console.log(`[taskManager] functionCall agent response received`);

    let taskManagerAgentResponse = {};

    try {
        console.log(`[taskManager] Validating and formatting output`);

        // Use the base output schema for validation
        taskManagerAgentResponse = validate(
            jsonSchemaToShortSchema(outputSchema),
            functionCallAgentResponse,
            {
                optional: false,
                path: '$',
                rejectExtraProperties: false,
            }
        );

        console.log(`[taskManager] Validation successful`);
    } catch (err) {
        console.error('[taskManager] Validation error:', err);
        taskManagerAgentResponse = {
            ...functionCallAgentResponse,
            error: { code: 'INVALID_RESPONSE', message: err.message || 'Invalid response format' },
        };
    }

    // Process functions returned by the assistant
    const updateTaskPayload = {};
    if (taskManagerAgentResponse.functions) {
        for (const func of taskManagerAgentResponse.functions) {
            if (!currentStep) {
                currentStep = workflow.steps.find((step) => step._id === taskDoc.currentStep)
            }
            const { name, args, results, status } = func;

            if (name === 'submit') {
                console.log(`[taskManager] Processing submit function: status ${status}`);
                if (status !== 'failed') {
                    if (!currentStep.next) {
                        updateTaskPayload.status = 'completed';
                    }
                    updateTaskPayload.currentStep = currentStep.next;
                } else {
                    updateTaskPayload.status = 'failed';
                    if (currentStep.failedNext) {
                        updateTaskPayload.currentStep = currentStep.failedNext;
                    }
                }
                // Update task context with submission details
                const stepIndex = workflow.steps.findIndex((step) => step._id === currentStep._id);
                updateTaskPayload[`context.steps.${stepIndex}.submitParams`] = args;
                updateTaskPayload[`context.steps.${stepIndex}.submitResponse`] = results;
                updateTaskPayload[`context.steps.${stepIndex}.updatedAt`] = new Date().toISOString();

                console.log('[taskManager] Updating task step...');
            } else if (name === 'createTask') {
                console.log(`[taskManager] Processing createTask function`);
                updateTaskPayload.context = { createdAt: new Date().toISOString() };
                updateTaskPayload.currentStep = results._id
                // Task is already created inside the createTask action
                // No additional processing needed here
            } else if (name === 'changeStep') {
                console.log(`[taskManager] Processing changeStep function`);
                updateTaskPayload.currentStep = results._id;
            } else {
                // Handle other functions if necessary
            }
        }
    }

    if (Object.keys(updateTaskPayload).length) {

        if (taskDoc) {
            try {
                console.log(updateTaskPayload)
                console.log(`[taskManager] Updating task: ${taskDoc._id}`);
                await models.tasks.update({ _id: taskDoc._id }, updateTaskPayload);
                console.log(`[taskManager] Task updated successfully`);
            } catch (error) {
                console.error(`[taskManager] Error updating task:`, error);
            }
        }

        // if any function.name is any of actionModules
        if (
            Object.keys(actionModules).some((key) => taskManagerAgentResponse.functions.some((func) => func.name === key)) &&
            iterations < maxIter
        ) {
            console.log(`[taskManager] Recursively calling taskManager for next step`);
            return await taskManager(
                {
                    input: '',
                    actionModules,
                    user,
                    thread,
                    threadLogs: [
                        ...threadLogs,
                        {
                            role: 'assistant',
                            content: JSON.stringify(validate(
                                jsonSchemaToShortSchema(outputSchema),
                                functionCallAgentResponse
                            ))
                        },
                    ],
                    options,
                    agentType,
                    iterations: iterations + 1,
                },
                res
            );
        }
    }

    // Prepare the final response in consistent format
    const response = {
        prompt: functionCallAgentResponse.prompt,
        ...taskManagerAgentResponse,
        consumption: {
            type: 'steps',
            value: iterations + 1,
        },
    };

    console.log(`[taskManager] Finished iteration ${iterations}`);
    return response;
};

export default taskManager;

const currentTaskPromptTemplate = `

================
{{copilotPrompt}}
================

### Task Context
The current task context is:
<context>
{{context}}
</context>

## Your Assignment:
Complete the current task step, and submit it using the 'submit' function.

### Instructions for your current task step:
<currentStep>
{{stepName}}: {{stepInstructions}}
</currentStep>

Guidelines:
- Strictly follow the <currentStep></currentStep> instructions, prioritizing this section over others in this prompt.

### Submit Step Completion
Submit this step using the 'submit' function when:
<submitWhen>
{{submitWhen}}
</submitWhen>

### Example
Example message for submitting a step:
<exampleAssistantMessage>
message: "Updating the task status"
functions: [
    {
        "name": "submit",
        "args": {
            "data": {"foo":"bar"}
        },
        "results": {"foo":"bar"},
        "status": "completed"
    },
]
</exampleAssistantMessage>

Guidelines
- YOU MUST submit AS SOON AS the condition of \`submitWhen\` has been satisfied, NOT BEFORE NOR AFTER THAT.
- When you submit, just let the user know in your message that you are updating the status, AND NOTHING MORE.

An excellent response will focus solely on the current step, ensuring that the required information is collected before proceeding.

IMPORTANT: ASSURE TO SUBMIT YOUR TASK.

================
{{currentDatePrompt}}
================

`;

const availableWorkflowsTemplate = `
## Your Assignment:
 Start a task from on of the following available workflows.

<workflows>
{{workflows}}
</workflows>
Guidelines:
- Workflows above are formatted in the form \`- [name]: [description]\`
- Start tasks as soon as you identify the user intent. This is important so you can get more instructions for how to complete the task.
- When starting a task, use the 'createTask' function with the appropriate workflowName and wait for further instructions from the system.
================
`;

const _baseOutputSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
        message: {
            type: 'string',
            description: 'Message for the user',
        },
        functions: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Function name',
                    },
                    args: {
                        type: 'object',
                        description: '{...args, [arg_name]: arg_value}',
                    },
                    results: {
                        type: 'any',
                        description: 'To be filled with function result',
                    },
                    status: {
                        type: 'string',
                        description: 'Function status',
                    },
                },
                required: ['name'],
            },
            description: 'List of functions',
        },
    },
    required: ['message', 'functions'],
};

// Helper function to import action modules
async function importActionModule(action) {
    let actionModule;
    if (action.moduleUrl?.startsWith('http')) {
        actionModule = await import(action.moduleUrl).then((module) => module.default);
    } else if (action.moduleUrl?.startsWith('native:')) {
        actionModule = await import(
            new URL(`../../modules/${action.moduleUrl.slice(7)}`, import.meta.url)
        ).then((module) => module.default);
    } else {
        throw new Error(
            `Invalid Module URL: namespace for ${action.moduleUrl} not found. Should either start with 'http:', 'https:', or 'native:'.`
        );
    }
    Object.assign(actionModule, taskManager);
    return actionModule;
}
