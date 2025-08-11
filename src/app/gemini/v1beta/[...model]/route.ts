import { isAuthenticated } from "@/lib/auth";
import { proxyRequest } from "@/lib/gemini-proxy";
import { NextRequest, NextResponse } from "next/server";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-key, x-goog-api-client'
    },
  });
}

export async function POST(request: NextRequest) {
  const authError = await isAuthenticated(request);
  if (authError) {
    return authError;
  }
  return proxyRequest(request, "/gemini");
}
