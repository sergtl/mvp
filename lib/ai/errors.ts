import OpenAI from "openai";

// A user-safe message for a failed OpenAI request. Logs metadata only, never
// provider messages, which can contain CV or posting text.
export function aiFailure(error: unknown, action: string) {
  let message = `${action} failed. Please try again.`;

  if (error instanceof OpenAI.APIError) {
    if (
      [
        "credit_balance_exhausted",
        "insufficient_quota",
        "billing_hard_limit_reached",
      ].includes(error.code ?? "")
    )
      message =
        "OpenAI has no available credits. Check API billing before retrying.";
    else if (error.status === 429)
      message = "The AI service is busy. Please try again shortly.";
    else if (error.status === 401 || error.status === 403)
      message =
        "The AI service configuration needs attention. Check the API key and model access.";

    console.error(`${action} failed`, {
      status: error.status,
      code: error.code,
      requestId: error.requestID,
    });
  }

  return message;
}
