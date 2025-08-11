import { proxyRequest } from "@/lib/gemini-proxy";
import { NextRequest, NextResponse } from "next/server";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
  });
}

export async function GET(request: NextRequest) {
  // This route is now just a simple pass-through to the proxy.
  // The proxy will handle fetching, and the adapter will handle formatting.
  // We pass a special prefix to be replaced, specific to this OpenAI-compatible route.
  return proxyRequest(request, "/openai");
}
