import { deletionRoute } from "@/src/modules/account-deletion/runtime.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => deletionRoute(request, "POST");
export const GET = (request: Request) => deletionRoute(request, "GET");
