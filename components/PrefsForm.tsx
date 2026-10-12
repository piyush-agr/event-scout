"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  mode: "signup" | "manage";
  categoryOptions: string[];
  cityOptions: string[];
  token?: string;
  initialCategories?: string[];
  initialCities?: string[];
};

function MultiSelect(props: {
  label: string;
  hint: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { options, selected, onChange } = props;
  const [custom, setCustom] = useState("");
  // Options the user typed themselves are shown alongside the built-in ones.
  const all = [...options, ...selected.filter((s) => !options.includes(s))];
  const allSelected = all.every((o) => selected.includes(o));

  const toggle = (item: string) =>
    onChange(selected.includes(item) ? selected.filter((s) => s !== item) : [...selected, item]);

  const addCustom = () => {
    const value = custom.trim();
    if (value.length >= 2 && !selected.some((s) => s.toLowerCase() === value.toLowerCase())) {
      onChange([...selected, value]);
    }
    setCustom("");
  };

  return (
    <fieldset className="field">
      <legend>{props.label}</legend>
      <p className="hint">{props.hint}</p>
      <div className="chips">
        <label className={`chip all ${allSelected ? "on" : ""}`}>
          <input type="checkbox" checked={allSelected} onChange={() => onChange(allSelected ? [] : all)} />
          All
        </label>
        {all.map((o) => (
          <label key={o} className={`chip ${selected.includes(o) ? "on" : ""}`}>
            <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} />
            {o}
          </label>
        ))}
      </div>
      <div className="add-row">
        <input
          type="text"
          value={custom}
          placeholder="Add your own"
          maxLength={60}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        <button type="button" className="secondary" onClick={addCustom}>
          Add
        </button>
      </div>
    </fieldset>
  );
}

export default function PrefsForm(props: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [categories, setCategories] = useState<string[]>(props.initialCategories ?? []);
  const [cities, setCities] = useState<string[]>(props.initialCities ?? []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!categories.length || !cities.length) {
      setMessage({ kind: "error", text: "Pick at least one category and one city." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(props.mode === "signup" ? "/api/subscribe" : "/api/preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          props.mode === "signup" ? { name, email, categories, cities } : { token: props.token, categories, cities },
        ),
      });
      const data = await res.json();
      if (!res.ok) setMessage({ kind: "error", text: data.error ?? "Something went wrong." });
      else if (data.token) router.push(`/manage/${data.token}?welcome=1`);
      else if (data.existing) setMessage({ kind: "ok", text: data.message });
      else {
        setMessage({ kind: "ok", text: "Saved. Your next digest will use these settings." });
        router.refresh();
      }
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card">
      {props.mode === "signup" && (
        <div className="row">
          <label className="field">
            <span>Your name</span>
            <input type="text" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Email for the digest</span>
            <input type="email" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        </div>
      )}
      <MultiSelect
        label="Focus areas"
        hint="Events are ranked by how closely they match these."
        options={props.categoryOptions}
        selected={categories}
        onChange={setCategories}
      />
      <MultiSelect
        label="Cities"
        hint="Only events in these cities are included."
        options={props.cityOptions}
        selected={cities}
        onChange={setCities}
      />
      <button type="submit" disabled={busy}>
        {busy ? "Saving…" : props.mode === "signup" ? "Sign up and get my first digest" : "Save settings"}
      </button>
      {message && <p className={`msg ${message.kind}`}>{message.text}</p>}
    </form>
  );
}
