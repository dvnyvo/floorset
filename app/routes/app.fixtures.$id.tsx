// The fixture view moved under /app/replenish. Sidekick answers given before the move still link here.
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  redirect(`/app/replenish/fixtures/${encodeURIComponent(params.id!)}${new URL(request.url).search}`);
