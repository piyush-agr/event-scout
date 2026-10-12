import { notFound } from "next/navigation";
import DigestView from "@/components/DigestView";
import PrefsForm from "@/components/PrefsForm";
import RunNow from "@/components/RunNow";
import { CATEGORY_OPTIONS, CITY_OPTIONS } from "@/lib/config";
import { getSubscriberByToken, latestDigestFor, latestGoodDigestFor } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your settings — Event Scout", robots: { index: false } };

export default async function ManagePage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { token } = await props.params;
  const { welcome } = await props.searchParams;
  const sub = await getSubscriberByToken(token);
  if (!sub) notFound();

  const latest = await latestDigestFor(sub.id);
  // If the newest run failed or was empty, keep showing the last good digest underneath.
  const lastGood = latest && latest.status !== "ok" ? await latestGoodDigestFor(sub.id) : null;

  return (
    <div className="wrap">
      <div className="page-top">
        <h1>Hi {sub.name}</h1>
        <p>
          Your digest goes to <b>{sub.email}</b> every Monday at 7:00 AM IST. Bookmark this page. It is your private
          settings link.
        </p>
        <RunNow token={sub.token} autoStart={welcome === "1" && !latest} />
      </div>

      <section className="section">
        <h2>Your settings</h2>
        <p className="section-note">Changes apply from your next digest.</p>
        <PrefsForm
          mode="manage"
          token={sub.token}
          categoryOptions={CATEGORY_OPTIONS}
          cityOptions={CITY_OPTIONS}
          initialCategories={sub.categories}
          initialCities={sub.cities}
        />
      </section>

      <section className="section">
        <h2>Your latest digest</h2>
        {latest ? (
          <DigestView digest={latest} />
        ) : (
          <p className="msg">No digest yet. Press “Send my digest now” above to create one.</p>
        )}
      </section>

      {lastGood && (
        <section className="section">
          <h2>Previous successful digest</h2>
          <DigestView digest={lastGood} />
        </section>
      )}
    </div>
  );
}
