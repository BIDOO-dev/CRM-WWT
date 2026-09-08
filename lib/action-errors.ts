export type ActionErrorKind =
  | "validation_error"
  | "permission_denied"
  | "constraint_error"
  | "network_error"
  | "not_found"
  | "unexpected_server_error";

export type ActionResult =
  | { ok: true; message: string; id?: string; slug?: string }
  | { ok: false; message: string; kind: ActionErrorKind };

type ErrorShape = {
  code?: unknown;
  message?: unknown;
  name?: unknown;
  status?: unknown;
  hint?: unknown;
};

const defaultMessages: Record<ActionErrorKind, string> = {
  validation_error: "Check the submitted details and try again.",
  permission_denied: "You don’t have permission to make this change.",
  constraint_error: "This change conflicts with an existing or related record.",
  network_error: "Supabase could not be reached. Check your connection and try again.",
  not_found: "This record no longer exists or is outside your access.",
  unexpected_server_error: "Something went wrong while saving. Please try again.",
};

function shapeOf(error: unknown): ErrorShape {
  return typeof error === "object" && error !== null ? (error as ErrorShape) : {};
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function classifyActionError(error: unknown): ActionErrorKind {
  const shape = shapeOf(error);
  const code = textValue(shape.code).toUpperCase();
  const status = Number(shape.status);
  const searchable = `${textValue(shape.name)} ${textValue(shape.message)}`.toLowerCase();

  if (code === "42501" || status === 401 || status === 403 || /row.level security|permission denied|forbidden|unauthorized/.test(searchable)) return "permission_denied";
  if (/^23/.test(code) || status === 409 || /constraint|duplicate key|foreign key/.test(searchable)) return "constraint_error";
  if (code === "PGRST116" || status === 404 || /not found|zero rows/.test(searchable)) return "not_found";
  if (/^22/.test(code) || code === "PGRST100" || code === "PGRST102" || status === 400 || /invalid input|validation/.test(searchable)) return "validation_error";
  if (status === 408 || status === 429 || status >= 500 || /fetch failed|network|econn|etimedout|timeout|socket/.test(searchable)) return "network_error";
  return "unexpected_server_error";
}

export function actionFailure(
  operation: string,
  userId: string,
  error: unknown,
  messages: Partial<Record<ActionErrorKind, string>> = {},
): ActionResult {
  const shape = shapeOf(error);
  const kind = classifyActionError(error);

  // Keep the log useful for operations without logging submitted CRM fields or secrets.
  console.error("CRM write failed", {
    operation,
    userId,
    kind,
    code: textValue(shape.code) || undefined,
    status: shape.status,
    databaseMessage: textValue(shape.message) || undefined,
    hint: textValue(shape.hint) || undefined,
  });

  return { ok: false, kind, message: messages[kind] ?? defaultMessages[kind] };
}

export function validationFailure(message: string): ActionResult {
  return { ok: false, kind: "validation_error", message };
}

export function notFoundFailure(operation: string, userId: string): ActionResult {
  return actionFailure(operation, userId, { code: "PGRST116", message: "No visible row was returned." });
}
