export const SERVICES = [
  {
    name: "Water Lines",
    slug: "water-lines",
    icon: "Droplets",
    shortDescription: "Water line installation to garages, pole barns, outbuildings, and new construction without disturbing your yard.",
  },
  {
    name: "Septic Lines",
    slug: "septic",
    icon: "Container",
    shortDescription: "Septic line boring and pump-up system installations with minimal ground disturbance.",
  },
  {
    name: "Drainage",
    slug: "drainage",
    icon: "CloudRain",
    shortDescription: "Underground drainage solutions to move water away from buildings and prevent flooding.",
  },
  {
    name: "Power Lines",
    slug: "power",
    icon: "Zap",
    shortDescription: "Underground power conduit to outbuildings, pole barns, shops, and new construction.",
  },
  {
    name: "Gas Lines",
    slug: "gas",
    icon: "Flame",
    shortDescription: "Gas line boring for residential and commercial propane and natural gas installations.",
  },
  {
    name: "Irrigation",
    slug: "irrigation",
    icon: "Sprout",
    shortDescription: "Irrigation line installation for farms, golf courses, and large properties.",
  },
  {
    name: "Fiber & Cable to Outbuildings",
    slug: "fiber",
    icon: "Wifi",
    shortDescription: "Run fiber optic or cable to your pole barn, shop, or outbuilding without trenching.",
  },
  {
    name: "Culvert & Driveway Boring",
    slug: "culvert-driveway",
    icon: "Route",
    shortDescription: "Bore under driveways, roads, and culverts without cutting or patching surfaces.",
  },
] as const;

export const FLEET = [
  { year: 2024, manufacturer: "Vermeer", model: "10x15", capability: "Small residential bores in tight spaces" },
  { year: 2012, manufacturer: "Vermeer", model: "20x22", capability: "Mid-size utility and residential boring" },
  { year: 2018, manufacturer: "Vermeer", model: "20x22", capability: "Mid-size utility and residential boring" },
  { year: 2019, manufacturer: "Vermeer", model: "20x22", capability: "Mid-size utility and residential boring" },
  { year: 2018, manufacturer: "Vermeer", model: "23x30", capability: "Large utility and commercial boring" },
  { year: 2024, manufacturer: "Vermeer", model: "23x30", capability: "Large utility and commercial boring" },
  { year: 0, manufacturer: "Vermeer", model: "1250", capability: "Vibratory plow for direct-bury installations" },
  { year: 0, manufacturer: "Kubota", model: "KX057", capability: "Excavation, bore pits, and restoration" },
  { year: 0, manufacturer: "Kubota", model: "KX040", capability: "Compact excavation and site work" },
  { year: 0, manufacturer: "Yanmar", model: "SVL-40", capability: "Track loader for material handling and site prep" },
  { year: 0, manufacturer: "Vermeer", model: "Hydrovac Trailer", capability: "Hydro excavation for safe utility exposure" },
] as const;

export const TEAM = [
  { name: "Bill Gaylord", title: "President", sortOrder: 0 },
  { name: "Chris Tobian", title: "Supervisor", sortOrder: 1 },
  { name: "Andre Moraga", title: "Foreman", sortOrder: 2 },
  { name: "Kono Boerma", title: "Foreman", sortOrder: 3 },
  { name: "Troy Talentino", title: "Foreman", sortOrder: 4 },
] as const;

export const COMPANY = {
  name: "FiberNorth Underground",
  legalName: "FiberNorth, Inc.",
  phone: "(231) 384-0105",
  email: "office@fibernorth.com",
  address: "6227 Arnold Rd",
  poBox: "PO Box 245",
  city: "Williamsburg",
  state: "MI",
  zip: "49690",
  tagline: "We Bore So You Don't Have to Dig",
  hours: {
    "Monday": "7:00 AM - 2:00 PM",
    "Tuesday": "7:00 AM - 2:00 PM",
    "Wednesday": "7:00 AM - 2:00 PM",
    "Thursday": "7:00 AM - 2:00 PM",
    "Friday": "7:00 AM - 2:00 PM",
    "Saturday": "Closed",
    "Sunday": "Closed",
  },
  centerCoords: { lat: 44.7631, lng: -85.3935 },
} as const;

export const TRUST_SIGNALS = [
  { icon: "Shield", text: "Fully Licensed & Insured" },
  { icon: "MapPin", text: "MISS DIG 811 Compliant" },
  { icon: "Radar", text: "Locating Specialist on Staff" },
  { icon: "FileText", text: "Free Estimates" },
] as const;
