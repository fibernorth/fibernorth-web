import { describe, expect, it } from "vitest";
import { cleanTicket, mapsLink, missDigQueue, missDigSheet } from "@/lib/missdig";

const ann = {
  center: { lat: 44.76, lng: -85.6 },
  zoom: 19,
  markers: [{ type: "well", position: { lat: 44.7601, lng: -85.6001 } }],
  paths: [
    { type: "bore-path", service: "water", color: "#f00", points: [{ lat: 44.76, lng: -85.6 }, { lat: 44.7605, lng: -85.6004 }] },
    { type: "existing-power", color: "#00f", points: [{ lat: 44.76, lng: -85.6 }, { lat: 44.761, lng: -85.6 }] },
  ],
  polygons: [],
  runFeet: 142.4,
  pipeSize: '1-1/4"',
  version: 2,
};

describe("missDigSheet", () => {
  it("builds the ticket details from the quote and its drawing", () => {
    const s = missDigSheet({ name: "Pat Jones", phone: "231-555-0100", address: "123 Main St, Williamsburg, MI", serviceType: "water-line", mapAnnotation: ann as never }, "2026-11-06");
    expect(s.workType).toBe('Directional bore to install a 1-1/4" water line, about 142 ft');
    expect(s.start).toEqual({ lat: 44.76, lng: -85.6 });
    expect(s.end).toEqual({ lat: 44.7605, lng: -85.6004 });
    expect(s.existing).toEqual(["existing power", "well"]);
    expect(s.markingInstructions).toContain("from 44.760000, -85.600000 to 44.760500, -85.600400 (about 142 ft)");
    // Friday Nov 6 + 3 business days = Wednesday Nov 11.
    expect(s.earliestDig).toBe("2026-11-11");
    expect(s.mapsUrl).toBe("https://www.google.com/maps/search/?api=1&query=44.760000,-85.600000");
  });

  it("works with no drawing: falls back to the address and service", () => {
    const s = missDigSheet({ name: "Pat", address: "9 Elm St", serviceType: "power" }, "2026-11-09");
    expect(s.workType).toBe("Directional bore to install an electric conduit");
    expect(s.start).toBeNull();
    expect(s.markingInstructions).toBe("Mark the area of the planned electric conduit on the property at 9 Elm St.");
    expect(s.mapsUrl).toContain("9%20Elm%20St");
  });
});

describe("missDigQueue", () => {
  it("lists only quotes waiting on a ticket, oldest first", () => {
    const q = missDigQueue([
      { id: "a", missDigStatus: "entered" as const },
      { id: "b", missDigStatus: "needed" as const, missDigNeededAt: "2026-11-05" },
      { id: "c", missDigStatus: "needed" as const, missDigNeededAt: "2026-11-03" },
      { id: "d" },
    ]);
    expect(q.map((x) => x.id)).toEqual(["c", "b"]);
  });
});

describe("helpers", () => {
  it("cleans ticket numbers and builds map links", () => {
    expect(cleanTicket(" 2026 1105-0012 ")).toBe("20261105-0012");
    expect(mapsLink(null, "")).toBe("");
  });
});
