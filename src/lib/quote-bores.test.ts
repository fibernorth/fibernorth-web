import { describe, it, expect } from "vitest";
import { boresFromAnnotation } from "./quote-bores";
import type { MapAnnotation } from "@/lib/types";

const a = { lat: 44.7631, lng: -85.3935 };
const b = { lat: 44.7641, lng: -85.3935 };
const c = { lat: 44.7651, lng: -85.3945 };
const terrain = { dists: [0, 100], elevs: [600, 601] };

describe("boresFromAnnotation", () => {
  it("reads one record per bore-path with its own service, pipe, feet and terrain", () => {
    const ann: MapAnnotation = {
      center: a, zoom: 18, markers: [], polygons: [],
      paths: [
        { type: "bore-path", points: [a, b], color: "#00f", service: "water", pipeSize: '1"', feet: 364, terrain },
        { type: "existing-power", points: [a, b], color: "#f00" },
        { type: "bore-path", points: [b, c], color: "#f00", service: "power", pipeSize: '2"', feet: 500, terrain: null },
      ],
      runFeet: 864, boreFeet: [364, 500], service: "water", pipeSize: '1"', terrain,
    };
    const bores = boresFromAnnotation(ann);
    expect(bores.map((x) => [x.index, x.service, x.pipeSize, x.feet, x.terrain !== null])).toEqual([
      [0, "water", '1"', 364, true],
      [1, "power", '2"', 500, false],
    ]);
  });

  it("reads an older one-bore annotation from the top-level fields", () => {
    const ann: MapAnnotation = {
      center: a, zoom: 18, markers: [], polygons: [],
      paths: [{ type: "bore-path", points: [a, b], color: "#00f" }],
      runFeet: 364, segmentFeet: [364], service: "internet", pipeSize: "not-sure", terrain,
    };
    const [bore] = boresFromAnnotation(ann);
    expect(bore.service).toBe("internet");
    expect(bore.feet).toBe(364);
    expect(bore.terrain).toEqual(terrain);
  });

  it("gives a second bore saved without its own fields no borrowed service or profile", () => {
    const ann: MapAnnotation = {
      center: a, zoom: 18, markers: [], polygons: [],
      paths: [{ type: "bore-path", points: [a, b], color: "#00f" }, { type: "bore-path", points: [b, c], color: "#00f" }],
      runFeet: 864, boreFeet: [364, 500], service: "water", terrain,
    };
    const bores = boresFromAnnotation(ann);
    expect(bores[1].service).toBe("");
    expect(bores[1].terrain).toBeNull();
    expect(bores[1].feet).toBe(500);
  });

  it("skips one-point lines and empty annotations", () => {
    expect(boresFromAnnotation(null)).toEqual([]);
    expect(boresFromAnnotation({ paths: [{ type: "bore-path", points: [a], color: "" }] })).toEqual([]);
  });
});
