import { OpenAI } from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

interface ModelConfig {
    id: string;
    name: string;
    weight: number;
    provider: 'local' | 'huggingface';
    baseURL?: string;
}

// Hybrid swarm: Local LM Studio + HuggingFace cloud
const MODELS: ModelConfig[] = [
    // Local model (fast, no rate limits)
    { id: "local-model", name: "LOCAL", provider: 'local', weight: 1.2, baseURL: "http://localhost:1234/v1" },
    // Cloud models (diverse perspectives)
    { id: "Qwen/Qwen2.5-Coder-32B-Instruct", name: "QWEN-32B", provider: 'huggingface', weight: 1.5 },
    { id: "meta-llama/Meta-Llama-3-8B-Instruct", name: "LLAMA-8B", provider: 'huggingface', weight: 1.0 },
];

async function checkLMStudio(): Promise<string | null> {
    try {
        const client = new OpenAI({ baseURL: "http://localhost:1234/v1", apiKey: "lm-studio" });
        const models = await client.models.list();
        const modelId = models.data[0]?.id;
        return modelId || null;
    } catch {
        return null;
    }
}

async function testSwarm() {
    console.log('\n🐝 HYBRID SWARM TEST - Local + Cloud');
    console.log('═'.repeat(50));

    // Check LM Studio
    const localModel = await checkLMStudio();
    if (localModel) {
        console.log(`  🏠 LM Studio: ${localModel}`);
        MODELS[0].id = localModel;
    } else {
        console.log('  ⚠️  LM Studio not running - using cloud-only mode');
        MODELS.shift(); // Remove local model
    }

    const code = `function login(user, pass) {
  return db.query('SELECT * FROM users WHERE user="' + user + '"');
}`;

    console.log('\n📝 Testing SQL injection vulnerability...\n');

    const results: { model: string; vote: string; confidence: number; provider: string }[] = [];

    for (let i = 0; i < MODELS.length; i++) {
        const model = MODELS[i];
        const icon = model.provider === 'local' ? '🏠' : '☁️';
        process.stdout.write(`  ${icon} Agent #${i} [${model.name}]: `);

        try {
            const client = new OpenAI({
                baseURL: model.provider === 'local'
                    ? "http://localhost:1234/v1"
                    : "https://router.huggingface.co/v1",
                apiKey: model.provider === 'local' ? "lm-studio" : (process.env.HF_TOKEN || ""),
            });

            const resp = await client.chat.completions.create({
                model: model.id,
                messages: [{
                    role: 'user',
                    content: `Review this code for security. Vote APPROVE or REJECT with confidence 0-100.\n\nCode:\n${code}`
                }],
                max_tokens: 150,
                temperature: 0.3,
            });

            const content = resp.choices[0]?.message?.content || '';
            const vote = content.toUpperCase().includes('REJECT') ? 'REJECT' : 'APPROVE';
            const conf = parseInt(content.match(/(\d+)/)?.[1] || '50');
            const weighted = Math.min(Math.round(conf * model.weight), 100);

            results.push({ model: model.name, vote, confidence: weighted, provider: model.provider });
            console.log(`${vote} (${weighted}% weighted)`);
        } catch (e: any) {
            console.log(`ERROR - ${e.message?.slice(0, 50)}`);
            results.push({ model: model.name, vote: 'APPROVE', confidence: 30, provider: model.provider });
        }
    }

    // Consensus calculation
    const totalWeight = results.reduce((sum, r) => sum + r.confidence, 0);
    const rejectWeight = results.filter(r => r.vote === 'REJECT').reduce((sum, r) => sum + r.confidence, 0);
    const score = Math.round((rejectWeight / totalWeight) * 100);

    console.log('\n' + '─'.repeat(50));
    console.log(`VERDICT: ${score >= 50 ? '❌ REJECTED' : '✅ APPROVED'} (${score}% reject consensus)`);

    // Show breakdown
    const localVotes = results.filter(r => r.provider === 'local');
    const cloudVotes = results.filter(r => r.provider === 'huggingface');
    if (localVotes.length > 0) {
        console.log(`  🏠 Local: ${localVotes.map(v => v.vote).join(', ')}`);
    }
    console.log(`  ☁️  Cloud: ${cloudVotes.map(v => `${v.model}=${v.vote}`).join(', ')}`);
    console.log('─'.repeat(50) + '\n');
}

testSwarm().catch(console.error);
