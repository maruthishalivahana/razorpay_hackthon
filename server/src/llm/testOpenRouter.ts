import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

async function runTest() {
  const model = process.env.OPENROUTER_MODEL || "openrouter/free";
  const apiKey = process.env.OPENROUTER_API_KEY;

  console.log("=================================");
  console.log("OpenRouter API Test");
  console.log("=================================");
  console.log();
  console.log(`API key loaded: ${apiKey ? "true" : "false"}`);
  console.log();

  if (!apiKey) {
    console.log(`Model: ${model}`);
    console.log();
    console.log("FAIL: OpenRouter connection failed.");
    console.log("Error: OPENROUTER_API_KEY is missing.");
    return;
  }

  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: "https://openrouter.ai/api/v1",
  });

  try {
    const response = await client.chat.completions.create({
      model: model,
      messages: [
        {
          role: "user",
          content: "Reply with exactly: OpenRouter works",
        },
      ],
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      console.log(`Model: ${model}`);
      console.log();
      console.log("FAIL: OpenRouter connection failed.");
      console.log("Error: Empty response received from model.");
      return;
    }

    console.log(`Model: ${model}`);
    console.log();
    console.log("Response:");
    console.log(content.trim());
    console.log();
    console.log("PASS: OpenRouter connection is working.");
  } catch (error: any) {
    console.log(`Model: ${model}`);
    console.log();
    console.log("FAIL: OpenRouter connection failed.");

    let message = "An unknown error occurred.";

    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        message = "OpenRouter API key is invalid or unauthorized.";
      } else if (error.status === 429) {
        message = "OpenRouter request was rate-limited.";
      } else if (error.status === 400 || error.status === 404) {
        const errStr = typeof error.error === "object" ? JSON.stringify(error.error) : String(error.message);
        if (errStr.toLowerCase().includes("model") || error.status === 404) {
          message = "Configured OpenRouter model is unavailable.";
        } else {
          message = `HTTP ${error.status}: ${error.message}`;
        }
      } else if (error.status === 403) {
        message = `HTTP 403: Forbidden - ${error.message}`;
      } else {
        message = error.message || `HTTP ${error.status || "Error"}`;
      }
    } else if (error instanceof Error) {
      if (error.name === "AbortError" || error.message.toLowerCase().includes("timeout")) {
        message = "Network timeout occurred while reaching OpenRouter.";
      } else if (error.message.toLowerCase().includes("fetch failed") || error.message.toLowerCase().includes("econnrefused")) {
        message = "Network error: Unable to reach OpenRouter API.";
      } else {
        message = error.message;
      }
    }

    if (apiKey) {
      message = message.replace(new RegExp(apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g"), "[REDACTED]");
    }

    console.log(`Error: ${message}`);
  }
}

runTest();