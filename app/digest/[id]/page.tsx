import { notFound } from "next/navigation";
import DigestView from "@/components/DigestView";
import { getDigest } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Digest — Event Scout" };

export default async function DigestPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const digest = await getDigest(id);
  if (!digest) notFound();

  return (
    <div className="wrap">
      <div className="page-top">
        <h1>Weekly event digest</h1>
        <p>The web copy of the email sent for this run.</p>
      </div>
      <section className="section">
        <DigestView digest={digest} />
      </section>
    </div>
  );
}
