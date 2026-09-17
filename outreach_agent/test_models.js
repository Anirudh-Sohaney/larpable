const { generateText } = require('ai');
const { createOpencode } = require('ai-sdk-provider-opencode-sdk');
const opencode = createOpencode({ autoStartServer: true });
const model = opencode('openai/gpt-5.6-luna');

async function test() {
    try {
        const res = await generateText({
            model,
            prompt: "Say hello!"
        });
        console.log("gpt-5.6-luna worked:", res.text);
    } catch (e) {
        console.error("gpt-5.6-luna failed:", e.message);
    }
}
test();
