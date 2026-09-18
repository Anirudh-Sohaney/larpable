const { streamText } = require('ai');
const { createOpencode } = require('ai-sdk-provider-opencode-sdk');
const { search_internet, read_webpage } = require("./tools");

const opencode = createOpencode({ autoStartServer: true });
const model = opencode('openai/gpt-5.6-luna');

const functionHandlers = {
    search_internet: async ({ query }) => {
        console.log(`\n[Agent] Executing search_internet: "${query}"`);
        return await search_internet(query);
    },
    read_webpage: async ({ url }) => {
        console.log(`\n[Agent] Executing read_webpage: "${url}"`);
        return await read_webpage(url);
    }
};

async function runAgent(systemInstruction, prompt, expectedOutputSchema) {
    let history = `${systemInstruction}\n\nYou have access to two tools:
1. {"action": "search_internet", "query": "<search query>"}
2. {"action": "read_webpage", "url": "<url>"}

To use a tool, you MUST reply ONLY with the JSON object for the tool you want to use. Do not include markdown formatting or extra text.
When you have collected enough information to fulfill the user's request, reply with the final data matching the requested schema. If you are returning the final data, use: {"action": "finish", "data": <your json array here>}

User Request: ${prompt}\n`;

    if (expectedOutputSchema) {
        history += `\nExpected Final JSON Schema for data:\n${JSON.stringify(expectedOutputSchema, null, 2)}\n`;
    }

    let iterations = 0;
    while (iterations < 10) {
        process.stdout.write(`\n[Agent] Thinking... `);
        
        let text = "";
        try {
            const { textStream } = await streamText({
                model,
                prompt: history
            });
            for await (const chunk of textStream) {
                process.stdout.write(chunk);
                text += chunk;
            }
        } catch (e) {
            console.error("\nOpencode API Error:", e.message);
            break;
        }

        console.log(); // Newline after stream finishes
        text = text.trim();
        history += `\nAssistant: ${text}\n`;
        
        let parsed;
        try {
            parsed = JSON.parse(text.replace(/^\`\`\`(json)?/, '').replace(/\`\`\`$/, '').trim());
        } catch (e) {
            history += `\nSystem: Failed to parse your response as JSON. Please reply ONLY with a valid JSON tool call or finish action.\n`;
            iterations++;
            continue;
        }

        if (parsed.action === 'finish') {
            return parsed.data;
        } else if (functionHandlers[parsed.action]) {
            let result;
            try {
                result = await functionHandlers[parsed.action](parsed);
            } catch(e) {
                result = "Error: " + e.message;
            }
            history += `\nSystem: Tool Result (First 4000 chars):\n${String(result).substring(0, 4000)}\n`;
        } else {
            history += `\nSystem: Unknown action '${parsed.action}'. Use search_internet, read_webpage, or finish.\n`;
        }
        
        iterations++;
    }

    console.error("[Agent] Reached max iterations without finishing.");
    return [];
}

module.exports = { runAgent };
module.exports.dispose = () => opencode.dispose();
