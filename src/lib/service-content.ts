// Per-service landing page content. seoTitle/metaDescription are written in
// the customer's language (trench/dig/bury), not industry jargon — these pages
// are the landing targets for search ads.
//
// Offer facts (do not embellish): typical 100 ft bore ~$3,000, done in a day
// or less; trench equivalent realistically $2,300–$6,000 plus restoration;
// bore price is roughly the same at nearly any depth; free estimates, usually
// scheduled within 3 days after MISS DIG marking; fully licensed & insured.
export interface ServiceFaq {
  question: string;
  answer: string;
}

export interface ServiceDetail {
  seoTitle: string;
  metaDescription: string;
  headline: string;
  description: string;
  features: string[];
  faqs: ServiceFaq[];
}

export const SERVICE_DETAILS: Record<string, ServiceDetail> = {
  "water-lines": {
    seoTitle: "Bury a Water Line Without Trenching | Northern Michigan",
    metaDescription:
      "Need a water line run to your garage, pole barn, or outbuilding? We bore it underground instead of trenching. No torn-up yard, done in a day. Free quotes in Northern Michigan.",
    headline: "Bury a Water Line Without the Trench",
    description:
      "Need water at your new garage, pole barn, or outbuilding? We bore the line underground instead of digging a trench across your yard. A typical 100 ft bore runs about $3,000, takes a day or less, and your lawn looks like we were never there.",
    features: [
      "Residential water line extensions",
      "Well line connections to new structures",
      "Water main connections",
      "Service lines under driveways and roads",
    ],
    faqs: [
      {
        question: "How deep does the water line go?",
        answer:
          "Below the frost line, so it won't freeze in a Northern Michigan winter. Here's the part people don't expect: a deeper trench costs more to dig and backfill, but a deeper bore costs about the same. With boring, depth doesn't punish you.",
      },
      {
        question: "What does it cost?",
        answer:
          "A typical 100 ft bore is about $3,000, done in a day or less. Trenching the same run realistically lands between $2,300 and $6,000 once you count hauling, backfill, and lawn restoration. The estimate is free and there's no obligation.",
      },
      {
        question: "Will it tear up my lawn?",
        answer:
          "No. We dig a small pit at each end of the run and bore between them. The grass, trees, and driveway in the middle stay exactly as they are.",
      },
    ],
  },
  septic: {
    seoTitle: "Septic Line Installation Without Digging Up Your Yard | Northern Michigan",
    metaDescription:
      "Septic lines and pump-up systems installed underground by boring, with no open trench across your property. Working with your septic installer in Northern Michigan.",
    headline: "Septic Lines, Installed Underneath Instead of Dug Through",
    description:
      "Septic lines and pump-up systems, bored underground with precision. We work with your septic installer to put the line exactly where the design calls for, without an open trench through your yard. Most runs are done in a day.",
    features: [
      "Septic tank to drain field connections",
      "Pump-up system installations",
      "Septic line replacements",
      "Force main installations",
    ],
    faqs: [
      {
        question: "Will you hit my tank, drain field, or other buried lines?",
        answer:
          "That's what the prep work is for. MISS DIG marks the public utilities before we start, we keep a locating specialist on staff, and our hydrovac exposes existing lines safely before the drill gets anywhere near them.",
      },
      {
        question: "Do you work with my septic installer?",
        answer:
          "Yes, that's the normal arrangement. Your installer designs the system and makes the connections; we put the line in the ground where the design says it goes. One call to us and we'll coordinate the rest.",
      },
      {
        question: "What does it cost?",
        answer:
          "A typical 100 ft bore is about $3,000. Trenching the same run across your yard realistically runs $2,300 to $6,000 plus weeks of restoration, so boring usually wins once you count everything. Estimates are free.",
      },
    ],
  },
  drainage: {
    seoTitle: "Bury Downspouts & Drainage Lines Without a Trench | Northern Michigan",
    metaDescription:
      "Underground drainage installed without trenching: buried downspouts, foundation drains, and yard drainage that moves water away, and your lawn stays untouched.",
    headline: "Drainage, Solved Underground Where It Belongs",
    description:
      "Water pooling against your foundation or standing in the yard? We bury downspouts, French drains, and foundation drains underground so water goes where it should. And since we bore instead of trench, we don't wreck the lawn we're there to protect.",
    features: [
      "Foundation drainage systems",
      "Yard drainage solutions",
      "Downspout underground routing",
      "French drain installations",
    ],
    faqs: [
      {
        question: "Will buried downspouts freeze or clog?",
        answer:
          "A properly pitched line keeps water moving, and moving water doesn't freeze or collect debris. That's the reason to bore the line at a consistent depth and grade instead of hand-digging a shallow run that settles.",
      },
      {
        question: "Where does the water actually go?",
        answer:
          "Away from the building: to a daylight outlet downhill, a dry well, or wherever your property allows. We walk the site during the free estimate and tell you what will work before you spend a dime.",
      },
      {
        question: "Will you dig up my yard to fix my yard?",
        answer:
          "No, that would defeat the purpose. We bore the drainage lines underground from a small pit at each end. The wet spot gets fixed and the rest of the lawn never knows we were there.",
      },
    ],
  },
  power: {
    seoTitle: "Run Power to Your Pole Barn or Garage — No Trenching | Northern Michigan",
    metaDescription:
      "Bury an electrical line to your garage, pole barn, shop, or generator without digging a trench. We bore the conduit underground; your electrician pulls the wire. Free quotes.",
    headline: "Run Power to Any Building Without a Trench",
    description:
      "Power to your pole barn, shop, garage, or generator, without a trench cut across your property. We bore the conduit underground; your electrician pulls the wire and makes the connections. Most residential runs are in the ground in a day.",
    features: [
      "Power conduit to outbuildings",
      "Underground service entrances",
      "Conduit under driveways and roads",
      "Generator transfer switch connections",
    ],
    faqs: [
      {
        question: "How deep does electrical conduit need to be?",
        answer:
          "Deep enough to meet code, which your electrician will confirm for your setup. The nice part about boring: going deeper doesn't raise the price the way it does with a trench, so there's no reason to cut corners on depth.",
      },
      {
        question: "What does it cost?",
        answer:
          "A typical 100 ft bore runs about $3,000, and the conduit is in the ground in a day or less. That's usually in the same range as trenching once you add up excavation, backfill, and reseeding, minus the months of watching grass grow back.",
      },
      {
        question: "Do I still need an electrician?",
        answer:
          "Yes, and that's how it should be. We install the conduit from your service to the building; your licensed electrician pulls the wire and handles the hookups. We're happy to coordinate with them on timing.",
      },
    ],
  },
  gas: {
    seoTitle: "Bury a Gas or Propane Line Without Trenching | Northern Michigan",
    metaDescription:
      "Gas and propane lines bored underground — to garages, pole barns, generators, and pool heaters, all without an open trench through your yard. Northern Michigan, free quotes.",
    headline: "Gas and Propane Lines, Buried Without the Backhoe",
    description:
      "Propane or natural gas to a garage, pole barn, generator, or pool heater. We bore the line underground from your meter or tank to wherever you need it, without an open trench through the yard, and usually in a single day.",
    features: [
      "Propane line extensions",
      "Natural gas service lines",
      "Gas line to outbuildings",
      "New construction gas service",
    ],
    faqs: [
      {
        question: "Is boring safe near my other buried lines?",
        answer:
          "Safer than blind digging. MISS DIG 811 marks the utilities before any job starts, we keep a locating specialist on staff, and we use a hydrovac to expose existing lines with water and suction instead of steel before we bore past them.",
      },
      {
        question: "Who makes the gas connections?",
        answer:
          "Your licensed gas fitter or propane supplier handles the hookups at both ends. We put the line or conduit in the ground exactly where it needs to be, and we'll coordinate scheduling with them.",
      },
      {
        question: "What does it cost?",
        answer:
          "A typical 100 ft bore is about $3,000, done in a day or less. And because a bore costs about the same at nearly any depth, you get the line as deep as it should be without paying trench-style money for it.",
      },
    ],
  },
  irrigation: {
    seoTitle: "Irrigation Line Installation Without Surface Damage | Northern Michigan",
    metaDescription:
      "Irrigation mains for farms, golf courses, and large properties installed by directional boring. Long runs, minimal disruption to turf and operations.",
    headline: "Irrigation Lines: Long Runs, No Surface Damage",
    description:
      "Irrigation mains for farms, golf courses, sports fields, and large properties. With five directional drills we handle long runs efficiently, and because the line goes in under the surface, your turf and your operation keep running while we work.",
    features: [
      "Agricultural irrigation mains",
      "Golf course irrigation",
      "Sports field irrigation",
      "Large property sprinkler mains",
    ],
    faqs: [
      {
        question: "Can you handle long runs and large pipe?",
        answer:
          "Yes. Long runs are what directional drills are built for, and we run five of them with pullback up to 10-inch product diameter. Mains for farms and courses are routine work for us, not a special project.",
      },
      {
        question: "Will you disrupt my operation?",
        answer:
          "Minimally. We bore beneath the surface between small entry and exit pits, so fields stay farmable and fairways stay playable while the line goes in underneath. No open trench cutting the property in half for weeks.",
      },
      {
        question: "What does it cost?",
        answer:
          "Length and ground conditions drive the price, so we quote each job. The estimate is free, there's no obligation, and we usually have work scheduled within 3 days of MISS DIG marking.",
      },
    ],
  },
  fiber: {
    seoTitle: "Bury Internet & Fiber Cable to Any Outbuilding | Northern Michigan",
    metaDescription:
      "Bury internet, ethernet, fiber, or Starlink cable from your house to a pole barn, shop, or outbuilding, bored underground with no trench. Northern Michigan, free quotes.",
    headline: "Internet to Your Pole Barn, With the Cable Buried",
    description:
      "Want real internet in the pole barn or shop? We bore fiber, ethernet, or Starlink cable underground from the house to any building on the property. Full speed at the far end, and no trench through the yard to get it there.",
    features: [
      "Fiber to pole barns and shops",
      "Cable/ethernet to outbuildings",
      "Conduit for future runs",
      "Multi-building connections",
    ],
    faqs: [
      {
        question: "Why not just use a Wi-Fi extender?",
        answer:
          "Distance and walls beat Wi-Fi every time. A buried hardline gives the outbuilding the same speed as the house, in any weather, permanently. Bore it once and stop thinking about it.",
      },
      {
        question: "What does it cost?",
        answer:
          "A typical 100 ft bore is about $3,000 and takes a day or less. Ask us about adding a spare conduit in the same bore for future runs: one bore, room to grow.",
      },
      {
        question: "Will my lawn or driveway be torn up?",
        answer:
          "No. We bore under all of it, lawn and driveway included, from a small pit at each end. The surface stays exactly as it is.",
      },
    ],
  },
  "culvert-driveway": {
    seoTitle: "Bore Under a Driveway or Road — No Cutting, No Patching | Northern Michigan",
    metaDescription:
      "Get a pipe, wire, or conduit under your driveway, sidewalk, or road without saw-cutting the surface. We bore underneath and leave it untouched.",
    headline: "Under the Driveway, Without Touching the Driveway",
    description:
      "Need a pipe, wire, or conduit on the other side of a driveway, road, or sidewalk? We bore underneath it, so there's no saw-cutting and no cold patch that never quite matches. The surface stays exactly as it was.",
    features: [
      "Driveway crossings",
      "Road crossings",
      "Culvert installations",
      "Sidewalk and patio crossings",
    ],
    faqs: [
      {
        question: "Will boring crack or settle my driveway?",
        answer:
          "No, and that's the reason to bore instead of cut. The drill runs well below the surface at a depth matched to the crossing, so the driveway above is never disturbed. Compare that to saw-cutting, where the patch line shows forever.",
      },
      {
        question: "How does it work without digging?",
        answer:
          "A small pit on each side of the driveway. The drill steers underneath from one pit to the other, we pull the pipe or conduit back through, and we close up the pits. Crossings are done in a day or less.",
      },
      {
        question: "What does it cost?",
        answer:
          "Short crossings are some of the simplest work we do, and the estimate is free. Whatever the number, compare it to saw-cutting, excavation, and a new asphalt patch. Boring usually wins on price, and the driveway comes out looking untouched.",
      },
    ],
  },
};
