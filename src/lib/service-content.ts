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
      "Run a water line to a garage, pole barn or outbuilding without trenching. Bored underground, no torn-up yard, done in a day. Free Northern Michigan quotes.",
    headline: "Bury a Water Line Without the Trench",
    description:
      "Need water at your new garage, pole barn, or outbuilding? We bore the line underground instead of digging a trench across your yard. Your lawn looks like we were never there.",
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
          "Below the frost line, so it won't freeze in a Northern Michigan winter. And depth doesn't raise the price: a deeper trench costs more, a deeper bore doesn't.",
      },
      {
        question: "What does it cost?",
        answer:
          "A typical 100 ft bore is about $3,000, done in a day or less. Trenching the same run realistically lands between $2,300 and $6,000 once you count hauling, backfill, and restoration. Free estimates, no obligation.",
      },
      {
        question: "Will it tear up my lawn?",
        answer:
          "No. We dig a small pit at each end of the run and bore between them. The grass, trees, and driveway in the middle stay exactly as they are.",
      },
    ],
  },
  septic: {
    seoTitle: "Septic Line Boring, No Trench | Northern Michigan",
    metaDescription:
      "Septic lines and pump-up systems bored underground with no open trench across your property. We work with your septic installer. Northern Michigan.",
    headline: "Septic Lines Without a Trench Across the Property",
    description:
      "Septic lines and pump-up systems, bored underground with precision. We work with your septic installer to put the line exactly where the design calls for, without an open trench through your yard.",
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
          "No. MISS DIG marks the public utilities before we start, we keep a locating specialist on staff, and our hydrovac exposes existing lines before the drill gets near them.",
      },
      {
        question: "Do you work with my septic installer?",
        answer:
          "Yes, that's the normal arrangement. Your installer designs the system and makes the connections; we put the line in the ground where the design says it goes.",
      },
      {
        question: "What does it cost?",
        answer:
          "A typical 100 ft bore is about $3,000, done in a day or less. Trenching the same run realistically runs $2,300 to $6,000 plus weeks of restoration. Free estimates, no obligation.",
      },
    ],
  },
  drainage: {
    seoTitle: "Bury Downspouts & Drain Lines | Northern Michigan",
    metaDescription:
      "Underground drainage installed without trenching: buried downspouts, foundation drains, and yard drainage that moves water away, and your lawn stays untouched.",
    headline: "Bury Downspouts and Drain Lines Without a Trench",
    description:
      "Water pooling against your foundation or standing in the yard? We bury downspouts, French drains, and foundation drains underground so water goes where it should. We bore instead of trench, so we don't wreck the lawn we're there to protect.",
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
          "A properly pitched line keeps water moving, and moving water doesn't freeze or collect debris. We bore at a consistent depth and grade instead of hand-digging a shallow run that settles.",
      },
      {
        question: "Where does the water actually go?",
        answer:
          "Away from the building: to a daylight outlet downhill, a dry well, or wherever your property allows. We walk the site during the free estimate and tell you what will work before you spend a dime.",
      },
      {
        question: "Will you dig up my yard to fix my yard?",
        answer:
          "No, that would defeat the purpose. We bore the lines from a small pit at each end. The wet spot gets fixed and the rest of the lawn never knows we were there.",
      },
    ],
  },
  power: {
    seoTitle: "Run Power to a Pole Barn, No Trench | Northern MI",
    metaDescription:
      "Bury electrical conduit to a garage, pole barn, shop or generator without a trench. We bore, your electrician pulls wire. Free Northern Michigan quotes.",
    headline: "Run Power to Any Building Without a Trench",
    description:
      "Power to your pole barn, shop, garage, or generator, without a trench cut across your property. We bore the conduit underground; your electrician pulls the wire and makes the connections.",
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
          "Deep enough to meet code, which your electrician will confirm for your setup. Going deeper doesn't raise the price the way it does with a trench, so there's no reason to cut corners on depth.",
      },
      {
        question: "What does it cost?",
        answer:
          "A typical 100 ft bore runs about $3,000, done in a day or less. That's usually in the same range as trenching once you add excavation, backfill, and reseeding, minus the months of regrowth.",
      },
      {
        question: "Do I still need an electrician?",
        answer:
          "Yes. We install the conduit from your service to the building; your licensed electrician pulls the wire and handles the hookups. We'll coordinate timing with them.",
      },
    ],
  },
  gas: {
    seoTitle: "Bore a Gas or Propane Line | Northern Michigan",
    metaDescription:
      "Gas and propane lines bored to garages, pole barns, generators and pool heaters with no open trench. Northern Michigan, free estimates.",
    headline: "Gas and Propane Lines, Buried Without the Backhoe",
    description:
      "Propane or natural gas to a garage, pole barn, generator, or pool heater. We bore the line underground from your meter or tank to wherever you need it, without an open trench through the yard.",
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
          "Safer than blind digging. MISS DIG 811 marks the utilities before any job starts, we keep a locating specialist on staff, and our hydrovac exposes existing lines with water and suction instead of steel.",
      },
      {
        question: "Who makes the gas connections?",
        answer:
          "Your licensed gas fitter or propane supplier handles the hookups at both ends. We put the line or conduit in the ground where it needs to be and coordinate scheduling with them.",
      },
      {
        question: "What does it cost?",
        answer:
          "A typical 100 ft bore is about $3,000, done in a day or less. A bore costs about the same at nearly any depth, so the line goes as deep as it should without the price climbing.",
      },
    ],
  },
  irrigation: {
    seoTitle: "Irrigation Line Boring | Northern Michigan",
    metaDescription:
      "Irrigation mains for farms, golf courses, and large properties installed by directional boring. Long runs, minimal disruption to turf and operations.",
    headline: "Long Irrigation Runs Without Tearing Up the Ground",
    description:
      "Irrigation mains for farms, golf courses, sports fields, and large properties. With five directional drills we handle long runs efficiently, and the line goes in under the surface, so your operation keeps running while we work.",
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
          "Yes. Long runs are what directional drills are built for, and we run five of them with pullback up to 10-inch product diameter. Mains for farms and courses are routine work for us.",
      },
      {
        question: "Will you disrupt my operation?",
        answer:
          "Minimally. We bore between small entry and exit pits, so fields stay farmable and fairways stay playable. No open trench cutting the property in half for weeks.",
      },
      {
        question: "What does it cost?",
        answer:
          "Length and ground conditions drive the price, so we quote each job. Free estimates, no obligation, and work is usually scheduled within 3 days of MISS DIG marking.",
      },
    ],
  },
  fiber: {
    seoTitle: "Bury Internet Cable to a Pole Barn | Northern MI",
    metaDescription:
      "Bury internet, ethernet, fiber or Starlink cable from the house to a pole barn or shop. Bored underground, no trench. Northern Michigan.",
    headline: "Internet to Your Pole Barn, With the Cable Buried",
    description:
      "Want real internet in the pole barn or shop? We bore fiber, ethernet, or Starlink cable underground from the house to any building on the property. Full speed at the far end, no trench through the yard.",
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
          "A typical 100 ft bore is about $3,000, done in a day or less. Ask us about adding a spare conduit in the same bore for future runs.",
      },
      {
        question: "Will my lawn or driveway be torn up?",
        answer:
          "No. We bore under all of it, lawn and driveway included, from a small pit at each end.",
      },
    ],
  },
  "culvert-driveway": {
    seoTitle: "Bore Under a Driveway or Road | Northern Michigan",
    metaDescription:
      "Get a pipe, wire, or conduit under your driveway, sidewalk, or road without saw-cutting the surface. We bore underneath and leave it untouched.",
    headline: "Under the Driveway, Without Touching the Driveway",
    description:
      "Need a pipe, wire, or conduit on the other side of a driveway, road, or sidewalk? We bore underneath it. No saw-cutting, no cold patch that never quite matches.",
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
          "No. The drill runs well below the surface at a depth matched to the crossing, so the driveway above is never disturbed.",
      },
      {
        question: "How does it work without digging?",
        answer:
          "A small pit on each side of the driveway. The drill steers underneath, we pull the pipe or conduit back through, and we close up the pits. Crossings are done in a day or less.",
      },
      {
        question: "What does it cost?",
        answer:
          "Short crossings are some of the simplest work we do, and boring usually beats saw-cutting, excavation, and a new asphalt patch on price. Free estimates, no obligation.",
      },
    ],
  },
};
