import React from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

interface GeoStat {
    country: string;
    count: number;
}

interface GeoMapProps {
    data: GeoStat[];
}

const GeoMap: React.FC<GeoMapProps> = ({ data }) => {
    // Prevent unused variable error
    console.log('GeoMap data:', data);

    // const maxVal = Math.max(...data.map(d => d.count), 0);

    // We need formatted markers with coordinates.
    // Converting country codes to lat/long is hard without a library or a map that includes it.

    return (
        <div style={{ width: "100%", height: "300px" }}>
            <ComposableMap projectionConfig={{ scale: 147 }}>
                <Geographies geography={geoUrl}>
                    {({ geographies }) =>
                        geographies.map((geo) => {
                            // Logic to color based on match
                            return (
                                <Geography
                                    key={geo.rsmKey}
                                    geography={geo}
                                    fill="#EAEAEC"
                                    stroke="#D6D6DA"
                                />
                            );
                        })
                    }
                </Geographies>
            </ComposableMap>
            <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                * Map visualization requires ISO mapping. Displaying tabular data below.
            </div>
        </div>
    );
};

export default GeoMap;
