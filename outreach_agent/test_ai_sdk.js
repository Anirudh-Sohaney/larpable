const { generateText, tool } = require('ai');
const { createOpencode } = require('ai-sdk-provider-opencode-sdk');
const opencode = createOpencode({ autoStartServer: true });
const model = opencode('opencode/mimo-v2.5-free');

async function main() {
    console.log("Generating...");
    try {
        const result = await generateText({
            model,
            prompt: "What is 2+2?"
        });
        console.log("Result:", result.text);
    } catch (e) {
        console.log("Error:", e);
    }
}
main();
