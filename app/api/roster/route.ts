import { ensureSeeded } from "@/lib/engine";
import { snapshot } from "@/lib/store";
import { startTick } from "@/lib/tick";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  startTick();
  ensureSeeded();
  return Response.json(snapshot());
}
