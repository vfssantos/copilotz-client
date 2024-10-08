/**
 * Main function for the chat agent.
 * 
* @param {Object} params - Function parameters.
 * @param {string} params.instructions - Instructions for the agent.
 * @param {string|Array<Object>} params.input - User input, can be a string or an array of objects.
 * @param {string} params.input[].type - Type of the input, can be 'text' or 'image_url'.
 * @param {string} [params.input[].text] - Text input, required if type is 'text'.
 * @param {Object} [params.input[].image_url] - Image URL input, required if type is 'image_url'.
 * @param {string} params.input[].image_url.url - URL of the image, can be a regular URL or a base64 encoded image.
 * @param {string} params.input[].image_url.detail - Detail about the image.
 * @param {Object} params.user - User information.
 * @param {Object} params.thread - Thread information.
 * @param {Object} res - Response object.
 * @param {Object} config - Configuration object.
 * @param {Object} config.AI_CHAT_PROVIDER - AI chat provider configuration.
 * @param {string} config.AI_CHAT_PROVIDER.provider - Provider name, e.g., 'openai'.
 * @param {Object} config.AI_CHAT_PROVIDER.options - Additional options for the provider.
 * @param {Object} env - Environment variables.
 * @param {string} env.OPENAI_CREDENTIALS_apiKey - API key for OpenAI.
 * @param {string} env.OTHER_PROVIDER_CREDENTIALS_apiKey - API key for another provider.
 * @returns {Promise<void>} - Returns a Promise that resolves when the function is completed.
 */


const chatAgent = async ({
  instructions,
  input,
  audio,
  user,
  thread,
  threadLogs,
  answer,
  options
}, res) => {
  console.log(`[chatAgent] Starting chat agent`);

  // 1. Extract Modules, Resources, Utils, and Dependencies
  const { __tags__, __requestId__, __executionId__, modules, resources, utils, env } = chatAgent;

  // 1.1 Extract Utils
  const { createPrompt, getThreadHistory } = utils;

  // 1.2 Extract Dependencies
  const { ai, agents } = modules;

  // 1.3 Extract Resources
  const { copilotz, config } = resources;

  // 2. Extract params
  // 2.1 Get Thread and Turn Ids;
  if (__tags__ && !__tags__?.turnId) __tags__.turnId = __executionId__;
  const { extId: threadId } = thread;

  // 3. Get Thread Logs
  console.log(`[chatAgent] Fetching thread history for threadId: ${threadId}`);
  threadLogs = threadLogs || await getThreadHistory(threadId, { functionName: 'chatAgent', maxRetries: 10 });

  // 4. Add User Input to Chat Logs
  const message = input && {
    role: "user",
    content: input,
  }
  // 4.1. If User Input Exists, Add to Chat Logs
  if (message) {
    console.log(`[chatAgent] Adding user input to chat logs`);
    threadLogs.push(message);
  }

  // 4.2. If Audio Exists, Transcribe to Text and Add to Chat Logs
  if (audio) {
    console.log(`[chatAgent] Audio input detected, starting transcription`);
    const transcriber = agents.transcriber;
    Object.assign(transcriber, chatAgent);
    const { message: transcribedText } = await transcriber({
      audio,
      instructions,
    });
    const transcribedMessage = {
      role: "user",
      content: transcribedText,
    };
    console.log(`[chatAgent] Audio transcribed and added to chat logs`);
    threadLogs.push(transcribedMessage);
  }

  // 5. Create Prompt
  console.log(`[chatAgent] Creating prompt`);
  // 5.1 Create Prompt Variables
  const promptVariables = {
    copilotPrompt: createPrompt(
      copilotPromptTemplate,
      {
        name: copilotz.name,
        backstory: copilotz.backstory,
        jobRole: copilotz.job?.role,
        jobGoal: copilotz.job?.goal,
        jobDescription: copilotz.job?.description
      }
    ),
    instructions,
    currentDatePrompt: createPrompt(currentDatePromptTemplate, { currentDate: new Date() })
  }

  // 5.2 Create Prompt Instructions
  instructions = createPrompt(promptTemplate, promptVariables)

  // 6. Get AI Chat
  const { provider, ...providerOptions } = config?.AI_CHAT_PROVIDER || { provider: 'openai' }; // use openai as default provider
  const aiChat = ai.chat[provider];

  // 7. Execute AI Chat
  // 7.1. Assign configuration to AI Chat
  Object.assign(aiChat, {
    __requestId__,
    config: {
      ...providerOptions,
      apiKey: (
        config?.[`${provider}_CREDENTIALS`]?.apiKey || // check for custom credentials in config
        env?.[`${provider}_CREDENTIALS_apiKey`] //use default credentials from env
      )
    },
    env
  });

  // 7.2. Execute AI Chat
  console.log(`[chatAgent] Executing AI chat with provider: ${provider}`);
  const { prompt, tokens, answer: assistantAnswer } = await aiChat(
    { instructions, messages: threadLogs, answer },
    config.streamResponseBy === 'token' ? res.stream : (() => { })
  );

  answer = assistantAnswer;

  // 8. Return Response
  console.log(`[chatAgent] Returning response`);
  return {
    prompt,
    message: answer,
    consumption: {
      type: 'tokens',
      value: tokens
    },
  };
};

export default chatAgent;


const promptTemplate = `
{{copilotPrompt}}
================
{{instructions}}
{{currentDatePrompt}}
================
`;


const copilotPromptTemplate = `
## YOUR IDENTITY
Your name is {{name}}. Here's your backstory:
<backstory>
{{backstory}}
</backstory>

Here's your job details:
<job>
Your role is: {{jobRole}}
Your Job goal is: {{jobGoal}}
Here's your job description:
{{jobDescription}}
</job>
`;

const currentDatePromptTemplate = `
Current Date Time:
<currentDate>
{{currentDate}}
</currentDate>
`;

// TO DO: ADD HABILITY TO HANDLE COMMANDS

// 2. Ececute Commands
// const commandsList = {
//   '#limparconversa': async (payload) => {
//     await chatLogs.reject();
//     return
//   },
// };
// const commands = [];
// const matches = textMessage.match(/\#[^\s:]*(?:\:[^,\s]*(?:,\s*[^,\s]*)*)?/g)
// const executions = [];
// if (matches) {
//   matches.forEach(command => {
//     let [action, params] = command.split(':');
//     params = params ? params.split(',') : [];
//     commands.push({ action, params });
//   })
//   commands.forEach(({ action, params }) => {
//     const command = commandsList[action];
//     if (command) {
//       const execution = command({ params });
//       executions.push(execution);
//     }
//   })
//   if (executions.length > 0) {
//     await Promise.all(executions)
//     return callback({
//       user,
//       thread,
//       message: 'OK',
//       cost: 0,
//     })
//   }
// }

