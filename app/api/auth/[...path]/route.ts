import { getAuth } from "@/lib/auth/server";

type Handlers = ReturnType<ReturnType<typeof getAuth>["handler"]>;
type Method = keyof Handlers;

let handlers: Handlers | undefined;

function forward(method: Method): Handlers[Method] {
  return (request, context) => {
    handlers ??= getAuth().handler();
    return handlers[method](request, context);
  };
}

export const GET = forward("GET");
export const POST = forward("POST");
export const PUT = forward("PUT");
export const DELETE = forward("DELETE");
export const PATCH = forward("PATCH");
