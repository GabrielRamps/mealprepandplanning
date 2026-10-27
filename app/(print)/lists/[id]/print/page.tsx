import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { groupItems, isOptionalItem } from "@/lib/grocery/build";
import { getList } from "@/lib/grocery/lists";
import { requireHousehold } from "@/lib/household";
import { formatAmount } from "@/lib/quantity";

export const metadata: Metadata = { title: "Print list" };

/** E4: aisle groups in two columns, no navigation, empty squares to tick by hand. */
export default async function PrintListPage(props: PageProps<"/lists/[id]/print">) {
  const { id } = await props.params;
  const { membership } = await requireHousehold();
  const list = await getList(membership.householdId, id);
  if (!list) notFound();
  const groups = groupItems(
    list.items.map((i) => ({ ...i, isChecked: false })),
    list.aisleOrder,
  );

  return (
    <main className="mx-auto w-full max-w-3xl bg-white p-6 text-black print:p-0">
      <div className="mb-4 flex items-center justify-between gap-4 print:hidden">
        <Link href={`/lists/${list.id}`} className="text-primary underline">
          Back to list
        </Link>
        <PrintButton />
      </div>
      <h1 className="mb-4 text-2xl font-semibold">{list.name}</h1>
      <div className="columns-2 gap-8 text-sm">
        {groups.map((g) => (
          <section key={g.key} className="mb-4 break-inside-avoid">
            <h2 className="mb-1 border-b border-black/30 font-semibold uppercase">{g.label}</h2>
            <ul>
              {g.items.map((i) => (
                <li key={i.id} className="flex items-start gap-2 py-0.5">
                  <span aria-hidden className="mt-0.5 inline-block size-3.5 shrink-0 border border-black" />
                  <span>
                    {i.quantity !== null ? <strong>{formatAmount(i.quantity, null, i.unit)} </strong> : null}
                    {i.name}
                    {isOptionalItem(i.sources) ? " (optional)" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
