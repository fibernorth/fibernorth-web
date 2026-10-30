// Town landing pages for /directional-drilling/[town]. Facts only: county,
// how far out the town sits (the same "within about an hour" / "one to two
// hours" tiers as /service-area), nearby towns from the service-area lists,
// and a real project from /projects or /fiber-construction ONLY when it is
// genuinely nearby. Do not add terrain claims or projects that the site does
// not already state.
import { SERVICE_AREA_EXTENDED, SERVICE_AREA_PRIMARY } from "@/lib/constants";

type ServiceTown =
  | (typeof SERVICE_AREA_PRIMARY)[number]
  | (typeof SERVICE_AREA_EXTENDED)[number];

export interface TownProject {
  title: string;
  location: string;
  text: string;
  href: "/projects" | "/fiber-construction";
}

export interface TownPage {
  slug: string;
  name: ServiceTown;
  county: string;
  /** "primary" = within about an hour of Williamsburg; "extended" = 1-2 hours. */
  zone: "primary" | "extended";
  nearby: ServiceTown[];
  intro: string[];
  project?: TownProject;
}

export const TOWN_PAGES: TownPage[] = [
  {
    slug: "traverse-city",
    name: "Traverse City",
    county: "Grand Traverse",
    zone: "primary",
    nearby: ["Williamsburg", "Acme", "Interlochen", "Kingsley", "Lake Ann", "Suttons Bay"],
    intro: [
      "Our shop is in Williamsburg, a short drive east of Traverse City. Town is where a lot of our work is.",
      "Most jobs here are a water line, power, or internet out to a garage or shop, or a run under a driveway. We bore it instead of trenching it, so the lawn and the driveway stay as they are.",
    ],
    project: {
      title: "Grand Traverse Commons FTTP",
      location: "Traverse City",
      text: "Fiber to the premises throughout the historic Grand Traverse Commons development.",
      href: "/fiber-construction",
    },
  },
  {
    slug: "kalkaska",
    name: "Kalkaska",
    county: "Kalkaska",
    zone: "primary",
    nearby: ["Williamsburg", "Acme", "Kingsley", "Mancelona", "Bellaire"],
    intro: [
      "Kalkaska is close to home for us. It sits east of our Williamsburg shop, within about an hour.",
      "We bore water, power, gas, and internet lines to houses, pole barns, and shops around Kalkaska County. Two small pits, one at each end, and the ground in between stays put.",
    ],
  },
  {
    slug: "elk-rapids",
    name: "Elk Rapids",
    county: "Antrim",
    zone: "primary",
    nearby: ["Williamsburg", "Acme", "Traverse City", "Bellaire"],
    intro: [
      "Elk Rapids is just up the road from our shop in Williamsburg. It's one of the closest towns we work in.",
      "Got a finished yard and a line that needs to cross it? That's where drilling earns its keep. We go under the lawn, the trees, and the driveway instead of through them.",
    ],
  },
  {
    slug: "suttons-bay",
    name: "Suttons Bay",
    county: "Leelanau",
    zone: "primary",
    nearby: ["Traverse City", "Leland", "Lake Ann", "Williamsburg"],
    intro: [
      "We work all over the Leelanau Peninsula, and Suttons Bay is within about an hour of our Williamsburg shop.",
      "If you need water, power, or internet out to a garage, guest house, or barn, we can bore it in without a trench across the yard. Most jobs are done in a day or less.",
    ],
  },
  {
    slug: "frankfort",
    name: "Frankfort",
    county: "Benzie",
    zone: "extended",
    nearby: ["Beulah", "Interlochen", "Lake Ann", "Manistee"],
    intro: [
      "Frankfort is in our one-to-two-hour zone. We make the drive, and there's a small travel charge for it.",
      "We've put a lot of conduit in the ground in Benzie County. Homeowners here call us for the same reason everyone does: a line needs to go in and the yard needs to stay nice.",
    ],
    project: {
      title: "Winter Fiber Build",
      location: "Missaukee & Benzie Counties",
      text: "110,000 feet of conduit installed through the winter months for a local internet provider.",
      href: "/projects",
    },
  },
  {
    slug: "cadillac",
    name: "Cadillac",
    county: "Wexford",
    zone: "extended",
    nearby: ["Kingsley", "Manistee", "Reed City", "Houghton Lake"],
    intro: [
      "Cadillac is in our one-to-two-hour zone, south of our Williamsburg shop. We make the drive, with a small travel charge.",
      "We know Wexford County well. Our crews have spent a lot of time down there on a large fiber build, and we take home jobs in and around Cadillac too.",
    ],
    project: {
      title: "Mesick FTTH Fiber Build",
      location: "Wexford County",
      text: "145,000 feet of duct installed in three and a half months for a regional network contractor, plus 150+ home drops.",
      href: "/projects",
    },
  },
];

export function getTownPage(slug: string): TownPage | undefined {
  return TOWN_PAGES.find((t) => t.slug === slug);
}

/** Map of town name -> page path, for turning town chips into links. */
export const TOWN_PAGE_HREF: Partial<Record<string, string>> = Object.fromEntries(
  TOWN_PAGES.map((t) => [t.name, `/directional-drilling/${t.slug}`])
);
