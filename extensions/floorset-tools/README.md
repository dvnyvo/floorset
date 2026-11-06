# Floorset Sidekick tools

Sidekick app data extension (`admin.app.tools.data`) with three read-only tools: `get_read_rate`, `list_swap_outs`, `list_loose_tags`.

Each tool calls `/api/sidekick/:tool` on the Floorset backend, which answers from a cached summary (`Summary` table) refreshed when the matching page loads, because Sidekick tools must respond within 1 second.
