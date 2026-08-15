// Per-service landing page content. seoTitle/metaDescription are written in
// the customer's language (trench/dig/bury), not industry jargon — these pages
// are the landing targets for search ads.
export interface ServiceDetail {
  seoTitle: string;
  metaDescription: string;
  headline: string;
  description: string;
  features: string[];
}

export const SERVICE_DETAILS: Record<string, ServiceDetail> = {
  "water-lines": {
    seoTitle: "Bury a Water Line Without Trenching | Northern Michigan",
    metaDescription:
      "Need a water line run to your garage, pole barn, or outbuilding? We bore it underground instead of trenching. No torn-up yard, done in a day. Free quotes in Northern Michigan.",
    headline: "Bury a Water Line Without the Trench",
    description:
      "Need water to your new garage, pole barn, or outbuilding? We bore underground water lines without disturbing your yard, driveway, or landscaping. No trench, no mess, no weeks of restoration.",
    features: [
      "Residential water line extensions",
      "Well line connections to new structures",
      "Water main connections",
      "Service lines under driveways and roads",
    ],
  },
  septic: {
    seoTitle: "Septic Line Installation Without Digging Up Your Yard | Northern Michigan",
    metaDescription:
      "Septic lines and pump-up systems installed underground by boring, with no open trench across your property. Working with your septic installer in Northern Michigan.",
    headline: "Septic Lines, Installed Underneath Instead of Dug Through",
    description:
      "Septic line installations and pump-up systems bored underground with precision. We work with your septic installer to get the line exactly where it needs to go — without digging up your entire yard.",
    features: [
      "Septic tank to drain field connections",
      "Pump-up system installations",
      "Septic line replacements",
      "Force main installations",
    ],
  },
  drainage: {
    seoTitle: "Bury Downspouts & Drainage Lines Without a Trench | Northern Michigan",
    metaDescription:
      "Underground drainage installed without trenching: buried downspouts, foundation drains, and yard drainage that moves water away, and your lawn stays untouched.",
    headline: "Drainage, Solved Underground Where It Belongs",
    description:
      "Water problems around your building? We install underground drainage systems to move water away from foundations, basements, and low areas. Solve the problem underground where it belongs.",
    features: [
      "Foundation drainage systems",
      "Yard drainage solutions",
      "Downspout underground routing",
      "French drain installations",
    ],
  },
  power: {
    seoTitle: "Run Power to Your Pole Barn or Garage — No Trenching | Northern Michigan",
    metaDescription:
      "Bury an electrical line to your garage, pole barn, shop, or generator without digging a trench. We bore the conduit underground; your electrician pulls the wire. Free quotes.",
    headline: "Run Power to Any Building Without a Trench",
    description:
      "Run power to your outbuilding, pole barn, shop, or new construction without trenching across your property. We bore conduit underground for your electrician to pull wire through.",
    features: [
      "Power conduit to outbuildings",
      "Underground service entrances",
      "Conduit under driveways and roads",
      "Generator transfer switch connections",
    ],
  },
  gas: {
    seoTitle: "Bury a Gas or Propane Line Without Trenching | Northern Michigan",
    metaDescription:
      "Gas and propane lines bored underground — to garages, pole barns, generators, and pool heaters, all without an open trench through your yard. Northern Michigan, free quotes.",
    headline: "Gas and Propane Lines, Buried Without the Backhoe",
    description:
      "Gas line installations bored underground for propane and natural gas service. We install the conduit or direct-bury line from your meter or tank to wherever you need it.",
    features: [
      "Propane line extensions",
      "Natural gas service lines",
      "Gas line to outbuildings",
      "New construction gas service",
    ],
  },
  irrigation: {
    seoTitle: "Irrigation Line Installation Without Surface Damage | Northern Michigan",
    metaDescription:
      "Irrigation mains for farms, golf courses, and large properties installed by directional boring. Long runs, minimal disruption to turf and operations.",
    headline: "Irrigation Lines: Long Runs, No Surface Damage",
    description:
      "Irrigation line installations for farms, golf courses, sports fields, and large properties. Our equipment handles long runs efficiently with minimal disruption to your operation.",
    features: [
      "Agricultural irrigation mains",
      "Golf course irrigation",
      "Sports field irrigation",
      "Large property sprinkler mains",
    ],
  },
  fiber: {
    seoTitle: "Bury Internet & Fiber Cable to Any Outbuilding | Northern Michigan",
    metaDescription:
      "Bury internet, ethernet, fiber, or Starlink cable from your house to a pole barn, shop, or outbuilding, bored underground with no trench. Northern Michigan, free quotes.",
    headline: "Internet to Your Pole Barn, With the Cable Buried",
    description:
      "Want internet in your pole barn or shop? We bore fiber optic cable or conduit from your house to any outbuilding on your property. Same internet speed, no trenching.",
    features: [
      "Fiber to pole barns and shops",
      "Cable/ethernet to outbuildings",
      "Conduit for future runs",
      "Multi-building connections",
    ],
  },
  "culvert-driveway": {
    seoTitle: "Bore Under a Driveway or Road — No Cutting, No Patching | Northern Michigan",
    metaDescription:
      "Get a pipe, wire, or conduit under your driveway, sidewalk, or road without saw-cutting the surface. We bore underneath and leave it untouched.",
    headline: "Under the Driveway, Without Touching the Driveway",
    description:
      "Need to cross under a driveway, road, or culvert without cutting? We bore underneath and leave the surface completely untouched. No saw-cutting, no patching, no waiting for asphalt.",
    features: [
      "Driveway crossings",
      "Road crossings",
      "Culvert installations",
      "Sidewalk and patio crossings",
    ],
  },
};
