import { getKeyManager } from "@/lib/key-manager";
import { Agent } from "http";
import { HttpsProxyAgent } from "https-proxy-agent";
import { NextRequest, NextResponse } from "next/server";
import {
  buildGeminiRequest,
  formatGoogleModelsToOpenAI,
} from "./google-adapter";
import { logService } from "@/lib/log-service";
import logger from "./logger";
import { getSettings } from "./settings";

const GOOGLE_API_HOST =
  process.env.GOOGLE_API_HOST || "https://generativelanguage.googleapis.com";

interface FetchOptions extends RequestInit {
  agent?: Agent;
  duplex?: "half";
}

/**
 * Extracts and prepares headers for forwarding, removing host-specific headers.
 */
export function getRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  return headers;
}

/**
 * Safely gets the request body as a ReadableStream or null.
 */
export async function getRequestBody(
  request: NextRequest
): Promise<ReadableStream<Uint8Array> | null> {
  if (request.body) {
    return request.body;
  }
  return null;
}

/**
 * Creates a new ReadableStream from an existing one to ensure it can be read.
 */
export function createReadableStream(
  body: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    cancel() {
      reader.cancel();
    },
  });
}

export async function proxyRequest(request: NextRequest, pathPrefix: string) {
  const startTime = Date.now();
  let apiKey = "unknown";
  let model = "unknown";
  let statusCode: number | null = null;
  let isSuccess = false;

  try {
    const keyManager = await getKeyManager();
    apiKey = await keyManager.getNextWorkingKey();

    // Reconstruct the original Gemini API URL
    const url = new URL(request.url);
    const modelPath = url.pathname.replace(pathPrefix, "");
    model = modelPath.split("/").pop()?.split(":")[0] ?? ""; // Assign to the outer model variable
    const geminiUrl = `${GOOGLE_API_HOST}${modelPath}${
      url.search ? url.search + "&" : "?"
    }key=${apiKey}`;

    const requestBody = await request.json();
    const geminiRequestBody = await buildGeminiRequest(model, requestBody);
    const settings = await getSettings();

    const fetchOptions: FetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(geminiRequestBody),
      duplex: "half",
    };

    if (settings.PROXY_URL) {
      fetchOptions.agent = new HttpsProxyAgent(settings.PROXY_URL);
    }

    const geminiResponse = await fetch(geminiUrl, fetchOptions);

    // If the response is streaming, we pipe it through.
    if (
      geminiResponse.headers.get("Content-Type")?.includes("text/event-stream")
    ) {
      // Record the log for streaming response before returning
       isSuccess = true;
       statusCode = geminiResponse.status;
       const latency = Date.now() - startTime;
       
       // Use fire-and-forget pattern for logging to avoid blocking the stream
       logService.logRequestAsync({
         apiKey,
         model,
         statusCode,
         isSuccess,
         latency,
       });

      return new NextResponse(geminiResponse.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        status: geminiResponse.status,
      });
    }

    // Otherwise, we return the JSON response directly.
    // Check if the response from Gemini is not OK
    if (!geminiResponse.ok) {
      statusCode = geminiResponse.status;
      keyManager.handleApiFailure(apiKey);
      const errorBody = await geminiResponse.json();
      const errorMessage = errorBody.error?.message || "Unknown error";

      logService.logErrorAsync({
        apiKey,
        errorType: "gemini_api_error",
        errorMessage: errorMessage,
        errorDetails: JSON.stringify(errorBody),
      });

      logger.error(
        {
          status: geminiResponse.status,
          statusText: geminiResponse.statusText,
          errorBody,
        },
        "Error response from Google Gemini API"
      );
      return NextResponse.json(errorBody, { status: geminiResponse.status });
    }

    // Success
    isSuccess = true;
    statusCode = geminiResponse.status;

    // Otherwise, we return the JSON response directly.
    const data = await geminiResponse.json();

    // If the request is for OpenAI models, format the response.
    if (url.pathname.startsWith("/openai/v1/models")) {
      const formattedData = formatGoogleModelsToOpenAI(data);
      return NextResponse.json(formattedData, {
        status: geminiResponse.status,
      });
    }

    return NextResponse.json(data, { status: geminiResponse.status });
  } catch (error) {
    statusCode = 500;
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (
      errorMessage.includes("No API keys available") ||
      errorMessage.includes("KeyManager must be initialized")
    ) {
      logger.warn(
        { error: errorMessage },
        "KeyManager initialization failed. No keys were loaded from DB or ENV."
      );
      return NextResponse.json(
        {
          error: {
            message: "Forbidden: No API tokens configured",
            code: 403,
            status: "Forbidden",
          },
        },
        { status: 403 }
      );
    }

    if (errorMessage.includes("All API keys are currently failing")) {
      logger.error(
        { error: errorMessage },
        "All available API keys are marked as failing."
      );
      return NextResponse.json(
        {
          error: {
            message: "Forbidden: All API keys are failing",
            code: 403,
            status: "Forbidden",
          },
        },
        { status: 403 }
      );
    }

    logger.error({ error }, "Error proxying to Gemini");
    return NextResponse.json(
      { error: "Failed to proxy request to Gemini" },
      { status: 500 }
    );
  } finally {
    // Only log if we haven't already logged for streaming responses
    if (statusCode && !isSuccess) { // Only log non-streaming responses or errors
      const latency = Date.now() - startTime;
      logService.logRequestAsync({
        apiKey,
        model,
        statusCode,
        isSuccess,
        latency,
      });
    }
  }
}
