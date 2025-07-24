import { prisma } from "@/lib/db";
import { getKeyManager } from "@/lib/key-manager";
import { getSettings } from "@/lib/settings";
import { logService } from "@/lib/log-service";
import {
  EnhancedGenerateContentResponse,
  GenerateContentRequest,
  GoogleGenerativeAI,
} from "@google/generative-ai";
import { NextResponse } from "next/server";

export interface GeminiClientRequest {
  model: string;
  request: GenerateContentRequest;
}

/**
 * Transforms a stream from the @google/generative-ai SDK into a web-standard ReadableStream.
 */
function sdkStreamToReadableStream(
  sdkStream: AsyncGenerator<EnhancedGenerateContentResponse>
): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for await (const chunk of sdkStream) {
        // The SDK provides response chunks directly. We adapt them to SSE format.
        const jsonChunk = JSON.stringify(chunk);
        controller.enqueue(encoder.encode(`data: ${jsonChunk}\n\n`));
      }
      controller.close();
    },
  });
}

/**
 * Checks if the given error is an object with an httpStatus property.
 */
function isApiError(error: unknown): error is { httpStatus?: number } {
  return typeof error === "object" && error !== null && "httpStatus" in error;
}

/**
 * Calls the Gemini API using the official SDK without retry logic.
 * If the API call fails, it returns an error immediately.
 *
 * @returns A Response object with the Gemini API's stream or an error.
 */
export async function callGeminiApi({
  model,
  request,
}: GeminiClientRequest): Promise<Response> {
  const keyManager = await getKeyManager();
  const apiKey = keyManager.getNextWorkingKey();
  const startTime = Date.now();

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const generativeModel = genAI.getGenerativeModel({ model });

    const result = await generativeModel.generateContentStream(request);
    const stream = sdkStreamToReadableStream(result.stream);

    const latency = Date.now() - startTime;
    
    // Use async logging for streaming responses to avoid blocking
    logService.logRequestAsync({
      apiKey,
      model,
      statusCode: 200,
      isSuccess: true,
      latency,
    });
    
    keyManager.resetKeyFailureCount(apiKey);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const latency = Date.now() - startTime;
    let statusCode = 500;
    let errorMessage = "An unknown error occurred";

    if (error instanceof Error) {
      errorMessage = error.message;
    }

    // Check for Google API specific error properties
    if (isApiError(error) && error.httpStatus) {
      statusCode = error.httpStatus;
    }

    // Log request and error using the log service
    logService.logRequestAsync({
      apiKey,
      model,
      statusCode,
      isSuccess: false,
      latency,
    });
    
    logService.logErrorAsync({
      apiKey,
      errorType: "SDK Error",
      errorMessage,
      errorDetails: JSON.stringify(error),
    });

    if (statusCode >= 400 && statusCode < 500) {
      keyManager.handleApiFailure(apiKey);
      // Also increment the failCount in the database
      await prisma.apiKey.update({
        where: { key: apiKey },
        data: { failCount: { increment: 1 } },
      });
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: JSON.stringify(error),
      },
      { status: statusCode }
    );
  }
}
