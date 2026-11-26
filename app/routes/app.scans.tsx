import { useEffect, useState, type FormEvent } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { parseScanCsv } from "../lib/scans/parse";
import { runDetection } from "../lib/ghosts.server";
import { snapshotCounts } from "../lib/floor.server";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = { full_count: "Weekly inventory scan", floor: "Morning floor scan" } as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const scans = await db.scan.findMany({ orderBy: { takenAt: "desc" }, include: { _count: { select: { tagReads: true } } } });
  return {
    scans: scans.map((s) => ({ id: s.id, type: s.type as keyof typeof TYPES, takenAt: s.takenAt.toISOString(), reads: s._count.tagReads })),
  };
};

type ActionResult = { ok: boolean; message?: string; errors?: string[] };

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();

  if (form.get("intent") === "delete") {
    await db.scan.delete({ where: { id: String(form.get("id")) } });
    await runDetection();
    return { ok: true, message: "Scan deleted" };
  }

  const file = form.get("file");
  const type = String(form.get("type"));
  const takenAt = new Date(`${form.get("takenAt")}T08:00:00`);
  if (!(file instanceof File) || !file.size) return { ok: false, errors: ["Choose a CSV file to upload."] };
  if (file.size > MAX_BYTES) return { ok: false, errors: ["File is larger than 10 MB."] };
  if (!(type in TYPES)) return { ok: false, errors: ["Choose a scan type."] };
  if (Number.isNaN(takenAt.getTime())) return { ok: false, errors: ["Choose the scan date."] };

  const parsed = parseScanCsv(await file.text(), takenAt);
  if (!parsed.reads.length) return { ok: false, errors: parsed.errors.length ? parsed.errors : ["No valid reads in the file."] };

  await db.scan.create({ data: { type, takenAt, tagReads: { createMany: { data: parsed.reads } } } });
  const { open } = await runDetection();
  if (type === "full_count") await snapshotCounts(admin);
  const skipped = parsed.errors.length ? `, skipped ${parsed.errors.length}${parsed.errors.length === 20 ? "+" : ""} bad rows` : "";
  return {
    ok: true,
    message: `Imported ${parsed.reads.length.toLocaleString()} reads (${parsed.duplicates} repeat reads merged${skipped}). ${open} possible loose tags to check.`,
    errors: parsed.errors,
  };
};

/** Today in the browser's time zone as YYYY-MM-DD (toISOString would give the UTC date). */
const localDate = () => new Date().toLocaleDateString("en-CA");

export default function Scans() {
  const { scans } = useLoaderData<typeof loader>();
  const upload = useFetcher<typeof action>();
  const remove = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [type, setType] = useState<string>("full_count");
  const [date, setDate] = useState(localDate());
  // The server renders in its own time zone; reset to the browser's date once mounted.
  useEffect(() => setDate(localDate()), []);
  const busy = upload.state !== "idle";

  useEffect(() => {
    if (upload.data?.ok) shopify.toast.show("Scan imported");
  }, [upload.data, shopify]);

  // Files named like 2026-11-15_floor.csv fill in the date and type.
  const onFile = (name: string) => {
    const m = name.match(/(\d{4}-\d{2}-\d{2})_(full_count|floor)/);
    if (m) {
      setDate(m[1]);
      setType(m[2]);
    }
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    upload.submit(new FormData(e.currentTarget), { method: "post", encType: "multipart/form-data" });
  };

  return (
    <s-page heading="Scans">
      <s-section heading="Upload a scan">
        <form onSubmit={submit}>
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Upload an RFID export as CSV with an <code>epc</code> column, plus optional <code>area</code> and{" "}
              <code>read_at</code> columns.
            </s-paragraph>
            <label>
              <s-text>CSV file </s-text>
              <input type="file" name="file" accept=".csv,text/csv" required onChange={(e) => onFile(e.currentTarget.files?.[0]?.name ?? "")} />
            </label>
            <s-stack direction="inline" gap="base">
              <s-select label="Scan type" name="type" value={type}>
                {Object.entries(TYPES).map(([v, label]) => (
                  <s-option key={v} value={v}>
                    {label}
                  </s-option>
                ))}
              </s-select>
              <s-date-field label="Scan date" name="takenAt" value={date} />
            </s-stack>
            {upload.data && !upload.data.ok && (
              <s-banner tone="critical" heading="Upload failed">
                <s-unordered-list>
                  {upload.data.errors?.map((e) => <s-list-item key={e}>{e}</s-list-item>)}
                </s-unordered-list>
              </s-banner>
            )}
            {upload.data?.ok && (
              <s-banner tone={upload.data.errors?.length ? "warning" : "success"} heading={upload.data.message}>
                {!!upload.data.errors?.length && (
                  <s-unordered-list>
                    {upload.data.errors.map((e) => <s-list-item key={e}>{e}</s-list-item>)}
                  </s-unordered-list>
                )}
              </s-banner>
            )}
            <s-button type="submit" variant="primary" {...(busy ? { loading: true } : {})}>
              Upload scan
            </s-button>
          </s-stack>
        </form>
      </s-section>

      <s-section heading="Scan history">
        {scans.length === 0 ? (
          <s-paragraph>No scans yet. Generate sample files with <code>npm run gen-scans</code>.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Date</s-table-header>
              <s-table-header>Type</s-table-header>
              <s-table-header format="numeric">RFID tags read</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {scans.map((s) => (
                <s-table-row key={s.id}>
                  <s-table-cell>{s.takenAt.slice(0, 10)}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={s.type === "floor" ? "info" : "neutral"}>{TYPES[s.type] ?? s.type}</s-badge>
                  </s-table-cell>
                  <s-table-cell>{s.reads.toLocaleString()}</s-table-cell>
                  <s-table-cell>
                    <s-button
                      variant="tertiary"
                      tone="critical"
                      onClick={() => remove.submit({ intent: "delete", id: s.id }, { method: "post" })}
                    >
                      Delete
                    </s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
