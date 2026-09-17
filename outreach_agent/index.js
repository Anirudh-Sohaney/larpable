const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
// The OpenCode SDK launches the `opencode` command. Include the copy installed
// by the root npm workspace so deployments do not need a global CLI install.
process.env.PATH = [path.join(__dirname, '..', 'node_modules', '.bin'), process.env.PATH]
    .filter(Boolean)
    .join(path.delimiter);
const fs = require('fs');
const { runAgent } = require('./agent_core');

const OPP_PATH = path.join(process.env.DATA_DIR || '/var/www/larpable_data', 'opportunities.json');
const OUTREACH_PATH = path.join(__dirname, 'data', 'outreached.json');

const store = require('../backend/store');

async function loadContext() {
    let existingOpps = [];
    try {
        const opps = await store.getAllOpportunities();
        existingOpps = opps
            .filter(o => o.type === 'nonprofit' || o.type === 'company')
            .map(o => {
                const fields = o.encrypted_fields || {};
                return fields.title || fields.issuer_name || o.issuer_name || o.title;
            }).filter(Boolean);
    } catch (e) {
        console.error("Error reading opportunities:", e.message);
    }

    let outreached = [];
    if (fs.existsSync(OUTREACH_PATH)) {
        try {
            outreached = JSON.parse(fs.readFileSync(OUTREACH_PATH, 'utf8')).map(o => o.name);
        } catch (e) {
            console.error("Error reading outreached data:", e.message);
        }
    }

    return { existingOpps, outreached };
}

function saveOutreached(newRecords) {
    let data = [];
    if (fs.existsSync(OUTREACH_PATH)) {
        try {
            data = JSON.parse(fs.readFileSync(OUTREACH_PATH, 'utf8'));
        } catch (e) {}
    }
    data = data.concat(newRecords);
    fs.writeFileSync(OUTREACH_PATH, JSON.stringify(data, null, 2));
}

async function main() {
    console.log("Loading context...");
    const { existingOpps, outreached } = await loadContext();
    const avoidList = [...new Set([...existingOpps, ...outreached])];

    console.log(`Avoid list size: ${avoidList.length}`);

    // --- 1. DISCOVERY AGENT ---
    console.log("\n=== Running Discovery Agent ===");
    const discoverySystemPrompt = `You are an expert researcher designed to find new student-led nonprofits and companies that might need help, interns, chapter founders, or team members.
Use search_internet to find posts on Reddit, Discord, Indeed, LinkedIn, or general web searches. Focus on High School or College student-led organizations.
DO NOT return any of these organizations (they are already known):
${avoidList.join("\n")}

You MUST find between 2 and 4 valid, distinct, student-led organizations. Conduct multiple searches until you are confident. Return your findings clearly in text.`;

    const discoveryPrompt = "Find 2 to 4 student-led nonprofits or businesses looking for help/team members. Provide their name and a 4-8 word description of what they do.";

    const discoverySchema = {
        type: "array",
        items: {
            type: "object",
            properties: {
                name: { type: "string" },
                description: { type: "string", description: "A 4-8 word description." }
            },
            required: ["name", "description"]
        }
    };

    const discoveredOrgs = await runAgent(discoverySystemPrompt, discoveryPrompt, discoverySchema);
    console.log("Discovered Orgs:", JSON.stringify(discoveredOrgs, null, 2));

    const finalResults = [];

    // --- 2 & 3. LEADERSHIP & CONTACT AGENTS ---
    for (const org of discoveredOrgs) {
        console.log(`\n=== Processing Org: ${org.name} ===`);
        
        // Leadership Agent
        const leadershipSystemPrompt = `You are a specialized researcher. Your job is to find the founders, CEOs, or directors of a specific organization.
Organization Name: ${org.name}
Description: ${org.description}

Use the search tools to confidently identify the leadership team (names and their titles). If you cannot find any, say so.`;
        
        const leadershipPrompt = `Find the founders or CEOs of ${org.name}. Return their names and titles.`;
        const leadershipSchema = {
            type: "array",
            items: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    title: { type: "string" }
                },
                required: ["name", "title"]
            }
        };

        const leaders = await runAgent(leadershipSystemPrompt, leadershipPrompt, leadershipSchema);
        console.log(`Leaders found for ${org.name}:`, leaders);

        // Contact Agent
        const contactSystemPrompt = `You are a specialized contact info researcher. Find email addresses for the organization and its leadership.
Organization: ${org.name}
Leaders: ${leaders.map(l => `${l.name} (${l.title})`).join(", ")}

Use your search tools to find personal, business, or general inquiry emails (e.g. contact@, hello@) for this organization. Find 2-3 emails if possible.`;

        const contactPrompt = `Find 2-3 emails for ${org.name} or its founders: ${leaders.map(l => l.name).join(", ")}. If you can only find 1, that is okay.`;
        const contactSchema = {
            type: "array",
            items: { type: "string" }
        };

        const emails = await runAgent(contactSystemPrompt, contactPrompt, contactSchema);
        console.log(`Emails found for ${org.name}:`, emails);

        finalResults.push({
            name: org.name,
            description: org.description,
            leadership: leaders,
            emails: emails
        });
    }

    console.log("\n=== FINAL OUTPUT ===");
    console.log(JSON.stringify(finalResults, null, 2));
    
    // Save to datastore
    saveOutreached(finalResults);
    console.log(`\nSaved ${finalResults.length} new organizations to outreach_agent/data/outreached.json`);
}

main().catch(console.error);
