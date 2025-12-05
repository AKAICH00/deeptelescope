import { OpenAI } from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const SWARM_MODELS = [
    "Qwen/Qwen2.5-Coder-32B-Instruct",
    "meta-llama/Meta-Llama-3-8B-Instruct",
    "deepseek-ai/deepseek-coder-6.7b-instruct",
];

async function testSwarm() {
    const token = process.env.HF_TOKEN;
    console.log('HF_TOKEN:', token ? '✓ Found' : '✗ Missing');

    if (!token) {
        console.log('\nSet HF_TOKEN in .env file or environment');
        return;
    }

    const client = new OpenAI({
        baseURL: "https://router.huggingface.co/v1",
        apiKey: token,
    });

    console.log('\n🐝 Testing HuggingFace Swarm...\n');

    for (const model of SWARM_MODELS) {
        try {
            const shortName = model.split('/').pop();
            console.log('Testing:', shortName + '...');
            const start = Date.now();

            const completion = await client.chat.completions.create({
                model: model,
                messages: [{ role: "user", content: "Say 'Hello from the swarm!' in exactly 5 words." }],
                max_tokens: 30,
            });

            const elapsed = Date.now() - start;
            const content = completion.choices[0]?.message?.content || "(empty)";
            const tokens = completion.usage?.total_tokens || 0;

            console.log('  ✓', shortName);
            console.log('    Response:', content.trim());
            console.log('    Tokens:', tokens, '| Time:', elapsed + 'ms\n');
        } catch (e: any) {
            const shortName = model.split('/').pop();
            console.log('  ✗', shortName + ':', e.message, '\n');
        }
    }
}

testSwarm();
