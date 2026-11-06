// Sidekick data tools. Each reads a cached summary from the Floorset backend; a relative URL goes to
// the app's own server and Shopify attaches the admin session token automatically.
const TOOLS = {
  get_read_rate: 'read-rate',
  list_swap_outs: 'swap-outs',
  list_loose_tags: 'loose-tags',
};

export default async function extension() {
  for (const [name, path] of Object.entries(TOOLS)) {
    shopify.tools.register(name, async (input = {}) => {
      const query = input.filter ? `?filter=${encodeURIComponent(input.filter)}` : '';
      const res = await fetch(`/api/sidekick/${path}${query}`);
      if (!res.ok) return {error: `Floorset returned ${res.status}`};
      return res.json();
    });
  }
}
