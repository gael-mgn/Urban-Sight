// --- Merge touching buildings using TopoJSON (group by shared arcs)
// requires topojson-server and topojson-client (CDN scripts included in HTML)

function mergeTouchingFeatures(geojson){
  // build topology (topojson-server)
  const topology = topojson.topology({buildings: geojson});

  // geometry collection reference
  const geomCollection = topology.objects.buildings; // GeometryCollection

  // union-find (disjoint set)
  function makeUF(n){ return {p: new Array(n).fill(0).map((_,i)=>i), find(x){ return this.p[x]===x?x:(this.p[x]=this.find(this.p[x])); }, union(a,b){ const pa=this.find(a), pb=this.find(b); if(pa!==pb) this.p[pa]=pb; } }; }

  const n = geomCollection.geometries.length;
  if(n === 0) return {type: "FeatureCollection", features: []};
  const uf = makeUF(n);

  // build arc -> geometries index map
  // each geometry may be Polygon or MultiPolygon, arcs field(s) contain integer indexes (possibly negative for orientation)
  const arcToGeoms = new Map();

  for(let i=0;i<n;i++){
    const geom = geomCollection.geometries[i];
    // geometry types can be "Polygon" or "MultiPolygon" (in topojson)
    const arcsArr = (geom.type === 'Polygon') ? geom.arcs : (geom.type === 'MultiPolygon' ? geom.arcs.flat() : []);
    // arcsArr is array of rings (for polygon) or array of arrays for multipolygon; flatten to integers
    const flatArcs = [];
    if(Array.isArray(arcsArr)){
      (function collect(a){
        a.forEach(item => {
          if(Array.isArray(item)) collect(item);
          else flatArcs.push(item);
        });
      })(arcsArr);
    }
    for(const arcIdx of flatArcs){
      // normalize arc id ignoring orientation: use absolute value string
      const key = String(Math.abs(arcIdx));
      if(!arcToGeoms.has(key)) arcToGeoms.set(key, []);
      arcToGeoms.get(key).push(i);
    }
  }

  // union geometries that share at least one arc
  for(const [arcId, geomIdxs] of arcToGeoms.entries()){
    for(let j=1;j<geomIdxs.length;j++){
      uf.union(geomIdxs[0], geomIdxs[j]);
    }
  }

  // group indices by component root
  const groups = new Map();
  for(let i=0;i<n;i++){
    const r = uf.find(i);
    if(!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }

  // for each group, perform topojson.merge to get a merged geometry (in GeoJSON)
  const mergedFeatures = [];
  for(const [root, indices] of groups.entries()){
    // indices -> array of topology geoms
    const topoGeoms = indices.map(i => geomCollection.geometries[i]);
    // topojson-client.merge expects the topology and an array of geometries from topology.objects.buildings.geometries
    const merged = topojson.merge(topology, topoGeoms);
    // topojson.merge returns a GeoJSON geometry (Polygon or MultiPolygon)
    mergedFeatures.push({
      type: "Feature",
      properties: {}, // preserve or copy properties if desired
      geometry: merged
    });
  }

  return { type: "FeatureCollection", features: mergedFeatures };
}