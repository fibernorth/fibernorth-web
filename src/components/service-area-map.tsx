"use client";

import { useCallback, useState } from "react";
import { GoogleMap, Circle, useJsApiLoader } from "@react-google-maps/api";
import { MapPin } from "lucide-react";

const CENTER = { lat: 44.7631, lng: -85.3935 }; // Williamsburg, MI
const PRIMARY_RADIUS = 60000; // ~37 miles ≈ 1 hour
const EXTENDED_RADIUS = 130000; // ~80 miles ≈ 2 hours

const darkMapStyles: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#2a2a3e" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6a6a7a" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0e1525" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#4a4a5a" }],
  },
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
];

function Placeholder({ text }: { text: string }) {
  return (
    <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
      <div className="text-center">
        <MapPin className="h-12 w-12 text-primary mx-auto mb-3" />
        <p className="text-muted-foreground font-medium">{text}</p>
        <p className="text-sm text-muted-foreground mt-1">
          Centered on Williamsburg, MI
        </p>
      </div>
    </div>
  );
}

export default function ServiceAreaMap() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey || apiKey === "placeholder") {
    return <Placeholder text="Interactive map coming soon" />;
  }

  return <MapInner apiKey={apiKey} />;
}

function MapInner({ apiKey }: { apiKey: string }) {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey });
  const [, setMap] = useState<google.maps.Map | null>(null);

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  if (!isLoaded) {
    return (
      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="aspect-video rounded-lg overflow-hidden">
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={CENTER}
        zoom={8}
        onLoad={onLoad}
        options={{
          disableDefaultUI: true,
          zoomControl: true,
          styles: darkMapStyles,
        }}
      >
        <Circle
          center={CENTER}
          radius={EXTENDED_RADIUS}
          options={{
            fillColor: "#F4A42B",
            fillOpacity: 0.08,
            strokeColor: "#F4A42B",
            strokeOpacity: 0.4,
            strokeWeight: 1.5,
          }}
        />
        <Circle
          center={CENTER}
          radius={PRIMARY_RADIUS}
          options={{
            fillColor: "#E8672A",
            fillOpacity: 0.12,
            strokeColor: "#E8672A",
            strokeOpacity: 0.6,
            strokeWeight: 2,
          }}
        />
      </GoogleMap>
    </div>
  );
}
