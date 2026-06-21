"use client";

import { useMemo, useState } from "react";

type DropStatus = "Limited Drop" | "Seasonal Drop" | "Signature Drop";

type FlavourDrop = {
  id: string;
  name: string;
  mood: string;
  description: string;
  status: DropStatus;
  colours: string;
  bundle: string;
  pairing: string;
  swatches: string[];
};

type Bundle = {
  name: string;
  description: string;
  includes: string;
  accent: string;
};

type Blend = {
  name: string;
  formula: string;
  description: string;
  accent: string;
};

type BuilderRecommendation = {
  dropId: string;
  colour: string;
  bundle: string;
  pairing: string;
  note: string;
};

// EDIT FLAVOUR DROPS HERE
// Add, remove, rename, or update limited drops from this single array.
const flavourDrops: FlavourDrop[] = [
  {
    id: "forbidden-forest",
    name: "Forbidden Forest",
    mood: "Dark berry, forest green, mysterious, signature LeafLock flavour.",
    description: "A shadowy berry LAB drop with deep woodland energy and a polished LeafLock finish.",
    status: "Signature Drop",
    colours: "Deep green / purple",
    bundle: "Forest Drop",
    pairing: "LeafLock Gummy Mix",
    swatches: ["#0f4b2f", "#4d1a72"]
  },
  {
    id: "watermelon-mojito",
    name: "Watermelon Mojito",
    mood: "Fresh, summer, tropical, bright.",
    description: "Watermelon brightness cut with mint-cool lift for a clean summer batch experience.",
    status: "Limited Drop",
    colours: "Watermelon pink / mint green",
    bundle: "Summer Pack",
    pairing: "Summer Splice Lime",
    swatches: ["#ff4f8b", "#67f5b7"]
  },
  {
    id: "pumpkin-spice",
    name: "Pumpkin Spice",
    mood: "Warm, seasonal, autumn drop, limited run.",
    description: "A warm seasonal drop built for golden batches, soft spice notes, and limited-run energy.",
    status: "Seasonal Drop",
    colours: "Burnt orange / cream",
    bundle: "Dessert Drop",
    pairing: "Blueberry Banana Pancake",
    swatches: ["#d96b22", "#fff0c8"]
  },
  {
    id: "blueberry-banana-pancake",
    name: "Blueberry Banana Pancake",
    mood: "Dessert-style, playful, sweet breakfast flavour.",
    description: "A sweet breakfast-inspired LAB drop with blueberry depth and creamy banana colour direction.",
    status: "Limited Drop",
    colours: "Blueberry blue / banana yellow",
    bundle: "Dessert Drop",
    pairing: "Pumpkin Spice",
    swatches: ["#315dff", "#ffe66d"]
  },
  {
    id: "summer-splice-lime",
    name: "Summer Splice Lime",
    mood: "Citrus, icy, refreshing, nostalgic.",
    description: "Lime-forward, icy, and bright with a creamy citrus finish made for summer bundle builds.",
    status: "Limited Drop",
    colours: "Lime green / creamy yellow",
    bundle: "Summer Pack",
    pairing: "Watermelon Mojito",
    swatches: ["#a7ff3c", "#fff1a6"]
  },
  {
    id: "rainbow-melts",
    name: "Rainbow Melts",
    mood: "Colourful, candy-style, loud, fun, high-energy.",
    description: "A loud candy-style drop made for bright colour systems, party batches, and high-energy bundles.",
    status: "Limited Drop",
    colours: "Rainbow mix",
    bundle: "Party Mix",
    pairing: "Bright Colour System",
    swatches: ["#ff3f7f", "#ffe252", "#49f481", "#42d5ff", "#8d5cff"]
  }
];

// EDIT BUNDLES HERE
const bundles: Bundle[] = [
  {
    name: "Starter LAB Kit",
    description: "Start with one LeafLock-approved drop, one matching colour direction, and a guide card.",
    includes: "1 flavour drop + 1 colour drop + guide card",
    accent: "#67f5b7"
  },
  {
    name: "Triple Drop Bundle",
    description: "Build a tighter rotation with three drops and their matching colour systems.",
    includes: "3 flavours + matching colour systems",
    accent: "#ff4f8b"
  },
  {
    name: "Full LAB Drop",
    description: "The full current LAB run for customers who want every active limited flavour direction.",
    includes: "All current limited flavours + full colour system",
    accent: "#a7ff3c"
  },
  {
    name: "Product Pairing Bundle",
    description: "Pair a selected flavour drop with compatible LeafLock products for a complete batch experience.",
    includes: "Flavour drop + LeafLock Gummy Mix or compatible LeafLock product",
    accent: "#ffe66d"
  }
];

// EDIT CURATED BLEND RECIPES HERE
const blends: Blend[] = [
  {
    name: "Forest Drop",
    formula: "Forbidden Forest + deep green colour system",
    description: "A signature dark-berry direction with a forest-toned finish.",
    accent: "#4d1a72"
  },
  {
    name: "Summer Pack",
    formula: "Watermelon Mojito + Summer Splice Lime",
    description: "A bright limited pairing built around pink, mint, lime, and vanilla colour cues.",
    accent: "#67f5b7"
  },
  {
    name: "Dessert Drop",
    formula: "Blueberry Banana Pancake + Pumpkin Spice",
    description: "A playful sweet blend direction with warm seasonal balance.",
    accent: "#d96b22"
  },
  {
    name: "Party Mix",
    formula: "Rainbow Melts + bright colour system",
    description: "A loud, colour-forward LAB blend for high-energy batch builds.",
    accent: "#42d5ff"
  }
];

// EDIT LAB BUILDER RECOMMENDATIONS HERE
// Each recommendation connects one approved drop to a colour direction, bundle, and product pairing.
const builderRecommendations: BuilderRecommendation[] = [
  {
    dropId: "forbidden-forest",
    colour: "Deep green / purple colour system",
    bundle: "Forest Drop bundle",
    pairing: "LeafLock Gummy Mix",
    note: "Signature dark berry direction with the most unmistakable LeafLock mood."
  },
  {
    dropId: "watermelon-mojito",
    colour: "Pink / mint colour system",
    bundle: "Summer Pack bundle",
    pairing: "Summer Splice Lime",
    note: "A fresh summer pairing for bright batches and clean tropical energy."
  },
  {
    dropId: "blueberry-banana-pancake",
    colour: "Blue / yellow colour system",
    bundle: "Dessert Drop bundle",
    pairing: "Pumpkin Spice",
    note: "A playful dessert-style direction with sweet breakfast colour cues."
  },
  {
    dropId: "pumpkin-spice",
    colour: "Orange / cream colour system",
    bundle: "Dessert Drop bundle",
    pairing: "Blueberry Banana Pancake",
    note: "A warm seasonal LAB direction for autumn limited-run batches."
  },
  {
    dropId: "summer-splice-lime",
    colour: "Lime / vanilla colour system",
    bundle: "Summer Pack bundle",
    pairing: "Watermelon Mojito",
    note: "An icy citrus build designed to sit beside fresh summer drops."
  },
  {
    dropId: "rainbow-melts",
    colour: "Rainbow mix colour system",
    bundle: "Party Mix bundle",
    pairing: "Bright Colour System",
    note: "The loudest LAB direction in the current run."
  }
];

function SectionHeading({
  eyebrow,
  title,
  children
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto mb-10 max-w-3xl text-center">
      <p className="mb-3 text-xs font-black uppercase tracking-[0.28em] text-[#9dff7d]">{eyebrow}</p>
      <h2 className="text-3xl font-black leading-tight text-white sm:text-5xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-white/[0.68]">{children}</p>
    </div>
  );
}

function ColourSwatch({ colours }: { colours: string[] }) {
  return (
    <div className="flex items-center gap-2" aria-label="Colour pairing swatches">
      {colours.map((colour) => (
        <span
          key={colour}
          className="h-7 w-7 rounded-full border border-white/[0.25] shadow-[0_0_22px_rgba(255,255,255,0.16)]"
          style={{ background: colour }}
        />
      ))}
    </div>
  );
}

function DropCard({ drop }: { drop: FlavourDrop }) {
  const isRainbow = drop.id === "rainbow-melts";
  const cardGlow = isRainbow
    ? "linear-gradient(135deg, #ff3f7f, #ffe252, #49f481, #42d5ff, #8d5cff)"
    : `linear-gradient(135deg, ${drop.swatches[0]}, ${drop.swatches[1] || drop.swatches[0]})`;

  return (
    <article className="group relative overflow-hidden rounded-lg border border-white/[0.12] bg-black/[0.52] p-5 shadow-2xl shadow-black/[0.30] backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: cardGlow }} />
      <div
        className="absolute -right-20 -top-24 h-48 w-48 rounded-full opacity-20 blur-3xl transition group-hover:opacity-35"
        style={{ background: cardGlow }}
      />
      <div className="relative flex min-h-full flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <span className="rounded-full border border-white/[0.15] bg-white/[0.08] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white">
            {drop.status}
          </span>
          <ColourSwatch colours={drop.swatches} />
        </div>
        <div>
          <h3 className="text-2xl font-black text-white">{drop.name}</h3>
          <p className="mt-2 text-sm font-semibold text-white/[0.55]">{drop.mood}</p>
          <p className="mt-4 text-sm leading-6 text-white/[0.70]">{drop.description}</p>
        </div>
        <div className="mt-auto grid gap-3 border-t border-white/10 pt-4 text-sm">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#9dff7d]">Colour Pairing</p>
            <p className="mt-1 text-white">{drop.colours}</p>
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#9dff7d]">Bundle Recommendation</p>
            <p className="mt-1 text-white">{drop.bundle}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

function BundleCard({ bundle }: { bundle: Bundle }) {
  return (
    <article className="rounded-lg border border-white/[0.12] bg-[#07110c]/[0.88] p-5 shadow-xl shadow-black/25">
      <div className="mb-5 h-1.5 w-20 rounded-full" style={{ background: bundle.accent }} />
      <h3 className="text-xl font-black text-white">{bundle.name}</h3>
      <p className="mt-3 text-sm leading-6 text-white/[0.68]">{bundle.description}</p>
      <p className="mt-5 rounded-md border border-white/10 bg-white/[0.06] p-3 text-sm font-bold text-white">{bundle.includes}</p>
    </article>
  );
}

function BlendCard({ blend }: { blend: Blend }) {
  return (
    <article className="rounded-lg border border-white/[0.12] bg-white/[0.055] p-5 backdrop-blur">
      <span className="inline-flex rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-black" style={{ background: blend.accent }}>
        LAB Blend
      </span>
      <h3 className="mt-5 text-xl font-black text-white">{blend.name}</h3>
      <p className="mt-2 text-sm font-bold text-[#9dff7d]">{blend.formula}</p>
      <p className="mt-3 text-sm leading-6 text-white/[0.68]">{blend.description}</p>
    </article>
  );
}

function LabBuilder() {
  const [selectedDropId, setSelectedDropId] = useState(flavourDrops[0].id);
  const selectedDrop = useMemo(
    () => flavourDrops.find((drop) => drop.id === selectedDropId) || flavourDrops[0],
    [selectedDropId]
  );
  const recommendation = useMemo(
    () => builderRecommendations.find((item) => item.dropId === selectedDrop.id) || builderRecommendations[0],
    [selectedDrop.id]
  );

  return (
    <section id="build" className="border-y border-white/10 bg-black px-5 py-16 sm:px-8 lg:px-12">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.28em] text-[#9dff7d]">Guided LAB Builder</p>
          <h2 className="text-3xl font-black leading-tight text-white sm:text-5xl">Build Your LAB Blend</h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-white/[0.68]">
            Choose your drop. Match your colour. Build your batch experience. This is a limited guided LAB experience,
            built from LeafLock-approved drops and curated pairings.
          </p>
        </div>

        <div className="rounded-lg border border-white/[0.12] bg-[#07110c]/[0.92] p-5 shadow-2xl shadow-black/[0.30] sm:p-6">
          <label className="grid gap-3 text-sm font-black uppercase tracking-[0.18em] text-white/[0.70]" htmlFor="lab-drop">
            Choose Base Flavour Drop
            <select
              id="lab-drop"
              value={selectedDropId}
              onChange={(event) => setSelectedDropId(event.target.value)}
              className="min-h-12 rounded-md border border-white/[0.15] bg-black px-4 text-base font-bold normal-case tracking-normal text-white outline-none transition focus:border-[#9dff7d]"
            >
              {flavourDrops.map((drop) => (
                <option key={drop.id} value={drop.id}>
                  {drop.name}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-6 grid gap-4 md:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-lg border border-white/10 bg-black/[0.55] p-5">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#9dff7d]">Selected Drop</p>
              <h3 className="mt-3 text-2xl font-black text-white">{selectedDrop.name}</h3>
              <p className="mt-3 text-sm leading-6 text-white/[0.68]">{selectedDrop.description}</p>
              <div className="mt-5">
                <ColourSwatch colours={selectedDrop.swatches} />
              </div>
            </div>

            <div className="grid gap-3">
              {[
                ["Recommended Colour", recommendation.colour],
                ["Suggested Bundle", recommendation.bundle],
                ["Product Pairing", recommendation.pairing],
                ["LAB Note", recommendation.note]
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-white/10 bg-white/[0.055] p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#9dff7d]">{label}</p>
                  <p className="mt-1 text-sm font-bold leading-6 text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <a
            href="#bundles"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-md bg-[#9dff7d] px-5 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:bg-white"
          >
            View Matching Bundles
          </a>
        </div>
      </div>
    </section>
  );
}

export default function LeafLockFlavourLabPage() {
  return (
    <main className="min-h-screen bg-[#020503] font-sans text-white">
      <section className="relative isolate overflow-hidden bg-[radial-gradient(circle_at_18%_12%,rgba(157,255,125,0.22),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(255,79,139,0.18),transparent_26%),linear-gradient(135deg,#020503,#071b11_45%,#000)] px-5 py-20 sm:px-8 lg:px-12">
        <div className="absolute inset-0 -z-10 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="mx-auto grid max-w-7xl gap-10 lg:min-h-[78vh] lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
          <div>
            <p className="mb-5 text-xs font-black uppercase tracking-[0.34em] text-[#9dff7d]">Limited Run Flavour System</p>
            <h1 className="max-w-4xl text-5xl font-black leading-[0.92] text-white sm:text-7xl lg:text-8xl">
              LeafLock Flavour LAB
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/[0.72]">
              Custom flavour drops, colour systems, and curated blends designed to turn every batch into a LeafLock
              experience.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href="#drops"
                className="inline-flex min-h-12 items-center justify-center rounded-md bg-[#9dff7d] px-5 text-sm font-black uppercase tracking-[0.14em] text-black shadow-[0_0_32px_rgba(157,255,125,0.32)] transition hover:bg-white"
              >
                Explore Limited Drops
              </a>
              <a
                href="#build"
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/[0.18] bg-white/[0.08] px-5 text-sm font-black uppercase tracking-[0.14em] text-white backdrop-blur transition hover:border-[#9dff7d]"
              >
                Build Your Bundle
              </a>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="rounded-lg border border-white/[0.14] bg-black/[0.52] p-5 shadow-2xl shadow-black/[0.40] backdrop-blur">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="text-xs font-black uppercase tracking-[0.24em] text-white/60">LAB Run 01</span>
                <span className="rounded-full bg-[#9dff7d] px-3 py-1 text-xs font-black text-black">Active Drops</span>
              </div>
              <div className="grid gap-3 pt-5">
                {flavourDrops.slice(0, 4).map((drop) => (
                  <div key={drop.id} className="flex items-center justify-between gap-4 rounded-md border border-white/10 bg-white/[0.055] p-3">
                    <div>
                      <p className="font-black text-white">{drop.name}</p>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/[0.45]">{drop.status}</p>
                    </div>
                    <ColourSwatch colours={drop.swatches} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#06130d] px-5 py-16 sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-[0.28em] text-[#9dff7d]">LeafLock-Owned Experience</p>
            <h2 className="text-3xl font-black leading-tight text-white sm:text-5xl">We do not just sell flavour. We design the experience around it.</h2>
            <p className="mt-5 text-base leading-7 text-white/[0.68]">
              LeafLock Flavour LAB is built as a curated system: custom flavour names, matching colour directions,
              limited seasonal drops, pairing guides, flavour-plus-colour bundles, and integrations with LeafLock
              products.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              "Custom flavour naming",
              "Curated colour systems",
              "Limited seasonal drops",
              "Pairing guides",
              "Flavour + colour bundles",
              "LeafLock product integrations"
            ].map((item) => (
              <div key={item} className="rounded-lg border border-white/[0.12] bg-black/[0.42] p-4 text-sm font-black text-white shadow-xl shadow-black/[0.15]">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="drops" className="bg-[#020503] px-5 py-16 sm:px-8 lg:px-12">
        <SectionHeading eyebrow="Rotating LAB Drops" title="Limited Drop Cards">
          Each active drop carries its own mood, colour direction, blend path, and LeafLock bundle recommendation.
        </SectionHeading>
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-2 xl:grid-cols-3">
          {flavourDrops.map((drop) => (
            <DropCard key={drop.id} drop={drop} />
          ))}
        </div>
      </section>

      <section className="bg-[#06130d] px-5 py-16 sm:px-8 lg:px-12">
        <SectionHeading eyebrow="Visual Pairing Direction" title="LeafLock Colour System">
          Every flavour has a matching colour direction so the batch can visually carry the same mood as the selected
          LAB drop.
        </SectionHeading>
        <div className="mx-auto grid max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {flavourDrops.map((drop) => (
            <div key={drop.id} className="flex items-center justify-between gap-4 rounded-lg border border-white/[0.12] bg-black/[0.44] p-4">
              <div>
                <p className="font-black text-white">{drop.name}</p>
                <p className="mt-1 text-sm text-white/60">{drop.colours}</p>
              </div>
              <ColourSwatch colours={drop.swatches} />
            </div>
          ))}
        </div>
      </section>

      <section className="bg-black px-5 py-16 sm:px-8 lg:px-12">
        <SectionHeading eyebrow="Official Blend Ideas" title="Curated Blend Recipes">
          LeafLock-approved blend ideas built for flavour direction, colour matching, and bundle clarity.
        </SectionHeading>
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-2 lg:grid-cols-4">
          {blends.map((blend) => (
            <BlendCard key={blend.name} blend={blend} />
          ))}
        </div>
      </section>

      <section id="bundles" className="bg-[#06130d] px-5 py-16 sm:px-8 lg:px-12">
        <SectionHeading eyebrow="Commercial LAB Sets" title="Bundle Options">
          Simple ways to buy into the LAB: start small, rotate three drops, take the full run, or match a drop with a
          compatible LeafLock product.
        </SectionHeading>
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-2 xl:grid-cols-4">
          {bundles.map((bundle) => (
            <BundleCard key={bundle.name} bundle={bundle} />
          ))}
        </div>
      </section>

      <LabBuilder />
    </main>
  );
}

