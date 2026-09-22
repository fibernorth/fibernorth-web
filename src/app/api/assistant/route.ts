import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyApiAuth } from "@/lib/api-auth";
import {
  ASSISTANT_TOOLS,
  applyActions,
  isWriteTool,
  labelFor,
  runReadTool,
  todayLocal,
  type PlannedAction,
} from "@/lib/assistant-tools";
import { STAGE_LABELS, LEAD_STAGES } from "@/lib/leads";

// Voice / text assistant for the lead pipeline.
//   POST { mode: "plan", text }            -> { reply, actions[] }
//   POST { mode: "apply", actions[] }       -> { results[] }
// Plan never writes. Apply writes exactly the confirmed list.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("plan"), text: z.string().trim().min(1).max(4000) }),
  z.object({
    mode: z.literal("apply"),
    actions: z
      .array(
        z.object({
          tool: z.string().max(40),
          input: z.record(z.string(), z.unknown()),
          label: z.string().max(500),
        })
      )
      .max(30),
  }),
]);

async function getApiKey(): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const snap = await getFirestore(initializeAdminApp())
    .collection("integrationSecrets")
    .doc("anthropic")
    .get();
  return (snap.data()?.apiKey as string | undefined) || "";
}

function systemPrompt(): string {
  return [
    "You are the office assistant for FiberNorth Underground, a directional drilling contractor in Williamsburg, Michigan. Bill Gaylord (the owner) talks to you from his phone, often by voice, to keep the lead pipeline current.",
    `Today is ${todayLocal()} (America/Detroit). Resolve relative dates like "Friday", "tomorrow", "next week" to YYYY-MM-DD.`,
    `Pipeline stages: ${LEAD_STAGES.map((s) => `${s} = ${STAGE_LABELS[s]}`).join("; ")}.`,
    "How to work:",
    "- For anything about an existing lead, call find_leads first. Match by name, phone, or address.",
    "- If exactly one lead matches, act on it. If several plausible leads match, do not act; reply with a short question listing the candidates by name and address.",
    "- If no lead matches and Bill is clearly describing a new person, create_lead.",
    "- A spoken update usually means several things at once: log what happened, set the next action, and move the stage when it clearly changed (talked to them = contacted, set a walk = walk_scheduled, walked it = walk_done, sent a number = quoted, they said yes = won, they said no = lost, call back in months = nurture).",
    "- Write tools are queued for Bill to confirm on screen; they do not run yet. Queue everything the request implies.",
    "- Voice transcripts have errors. Read for intent. Names may be misspelled; trust the pipeline's spelling.",
    "- Logging a call, text, email, walk, or letter also updates the lead's last-contact date automatically. If Bill says how often to stay in touch (\"check in every month\", \"touch base quarterly\"), set contactEveryDays via update_lead (30, 90, etc).",
    "- Final reply: one or two plain sentences saying what you queued, or the question you need answered. No markdown, no lists.",
  ].join("\n");
}

export async function POST(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  if (parsed.data.mode === "apply") {
    const results = await applyActions(parsed.data.actions as PlannedAction[]);
    return NextResponse.json({ results });
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "The assistant needs an Anthropic API key. Add it under Admin -> Settings." },
      { status: 409 }
    );
  }
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: parsed.data.text }];
  const actions: PlannedAction[] = [];
  const leadNames = new Map<string, string>();
  let newCount = 0;
  let reply = "";

  for (let turn = 0; turn < 8; turn++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: "claude-opus-5",
        max_tokens: 4000,
        output_config: { effort: "low" },
        system: systemPrompt(),
        tools: ASSISTANT_TOOLS,
        messages,
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        return NextResponse.json({ error: "Anthropic API key was rejected. Check it in Settings." }, { status: 502 });
      }
      if (err instanceof Anthropic.RateLimitError) {
        return NextResponse.json({ error: "The assistant is rate limited right now. Try again in a minute." }, { status: 503 });
      }
      const msg = err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : "unknown";
      return NextResponse.json({ error: `Assistant call failed (${msg}).` }, { status: 502 });
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text) reply = text;

    if (response.stop_reason === "refusal") {
      reply = reply || "I could not help with that request.";
      break;
    }
    if (response.stop_reason === "max_tokens") {
      reply = reply || "That ran too long. Try a shorter request.";
      break;
    }

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const input = (tu.input ?? {}) as Record<string, unknown>;
      if (isWriteTool(tu.name)) {
        let placeholder = "";
        if (tu.name === "create_lead") {
          newCount += 1;
          placeholder = `new-${newCount}`;
          leadNames.set(placeholder, String(input.name || "new lead"));
          input.__placeholder = placeholder;
        }
        actions.push({ tool: tu.name, input, label: labelFor(tu.name, input, leadNames) });
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(placeholder ? { queued: true, leadId: placeholder } : { queued: true }),
        });
      } else {
        const out = await runReadTool(tu.name, input);
        try {
          for (const l of JSON.parse(out) as Array<{ id: string; name: string }>) {
            if (l?.id) leadNames.set(l.id, l.name || l.id);
          }
        } catch {
          // not a list; fine
        }
        results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
      }
    }
    messages.push({ role: "user", content: results });
  }

  // Re-label now that every lead name is known.
  for (const a of actions) a.label = labelFor(a.tool, a.input, leadNames);

  return NextResponse.json({ reply, actions });
}
