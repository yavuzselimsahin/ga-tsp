"use client";

import React, { useState, useRef } from "react";
import { Play, Square, RefreshCw, Trash2, Settings, Database, Shuffle } from "lucide-react";


type Node = { id: number; x: number; y: number; label: string };

const D_ASSIGNMENT: number[][] = [
  [0,29,20,21,16,31,100,12,4,31,18],
  [29,0,15,29,28,40,72,21,29,41,12],
  [20,15,0,15,14,25,81,9,23,27,13],
  [21,29,15,0,4,12,92,12,25,13,25],
  [16,28,14,4,0,16,94,9,20,16,22],
  [31,40,25,12,16,0,95,24,36,3,37],
  [100,72,81,92,94,95,0,90,101,99,84],
  [12,21,9,12,9,24,90,0,15,25,13],
  [4,29,23,25,20,36,101,15,0,35,18],
  [31,41,27,13,16,3,99,25,35,0,38],
  [18,12,13,25,22,37,84,13,18,38,0]
];

function euclideanDistance(a: Node, b: Node): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.round(Math.hypot(dx, dy));
}

const ASSIGNMENT_CITIES = [
  "maastricht",
  "aachen",
  "heerlen",
  "sittard",
  "geleen",
  "echt",
  "bonn",
  "hulsberg",
  "kanne",
  "ohe",
  "epen",
];

export default function Home() {
  const [crate, setCrate] = useState(0.95);
  const [mrate, setMrate] = useState(0.15);
  const [popSize, setPopSize] = useState(80);
  const [maxGen, setMaxGen] = useState(500);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [history, setHistory] = useState<number[]>([]);

  const [nodes, setNodes] = useState<Node[]>([]);
  const nextId = useRef(0);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef<number | null>(null);
  const [mode, setMode] = useState<'sample' | 'custom'>('sample');
  const stopRequested = useRef(false);
  const bestRef = useRef<{ dist: number; route: number[] } | null>(null);

  function computeDistanceMatrix(ns: Node[]) {
    const n = ns.length;
    const matchesAssignment = n === ASSIGNMENT_CITIES.length && ns.every((node, i) => node.label === ASSIGNMENT_CITIES[i]);
    if (matchesAssignment) return D_ASSIGNMENT.map((row) => row.slice());
    const D: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        D[i][j] = i === j ? 0 : euclideanDistance(ns[i], ns[j]);
      }
    }
    return D;
  }

  function routeDistance(route: number[], D: number[][]) {
    if (!route || route.length === 0) return 0;
    let dist = 0;
    for (let i = 0; i < route.length - 1; i++) dist += D[route[i]][route[i + 1]];
    dist += D[route[route.length - 1]][route[0]];
    return dist;
  }

  function randomIndividual(n: number) {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function evaluatePopulation(pop: number[][], D: number[][]) {
    return pop.map((ind) => ({ dist: routeDistance(ind, D), ind })).sort((a, b) => a.dist - b.dist);
  }

  function tournamentSelect(popEval: { dist: number; ind: number[] }[], k = 5) {
    const indices = Array.from({ length: popEval.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const sample = indices.slice(0, Math.min(k, indices.length)).map((idx) => popEval[idx]);
    sample.sort((a, b) => a.dist - b.dist);
    return sample[0].ind.slice();
  }

  function onePointCrossover(p1: number[], p2: number[]) {
    const n = p1.length;
    if (n <= 2) return [p1.slice(), p2.slice()];
    const cut = Math.floor(Math.random() * (n - 2)) + 1;
    const ox = (a: number[], b: number[]) => {
      const child = new Array(n).fill(-1);
      for (let i = 0; i < cut; i++) child[i] = a[i];
      let pos = cut;
      for (const gene of b) {
        if (!child.includes(gene)) child[pos++] = gene;
      }
      return child as number[];
    };
    return [ox(p1, p2), ox(p2, p1)];
  }

  function mutateSwap(ind: number[]) {
    const n = ind.length;
    const a = Math.floor(Math.random() * n);
    let b = Math.floor(Math.random() * n);
    while (b === a) b = Math.floor(Math.random() * n);
    const copy = ind.slice();
    [copy[a], copy[b]] = [copy[b], copy[a]];
    return copy;
  }

  async function runGA() {
    if (nodes.length < 3) {
      setLog((l) => [...l, "Add at least 3 nodes to run the GA."]);
      return;
    }
    setRunning(true);
    setLog([]);
    setHistory([]);
    stopRequested.current = false;
    bestRef.current = null;

    const D = computeDistanceMatrix(nodes);
    const n = nodes.length;
    let pop: number[][] = Array.from({ length: popSize }, () => randomIndividual(n));
    let popEval = evaluatePopulation(pop, D);
    const TERMINATION_DISTANCE = 253;

    let gen = 0;
    while (gen < maxGen && !stopRequested.current) {
      gen += 1;
      const parent1 = tournamentSelect(popEval);
      const parent2 = tournamentSelect(popEval);
      let child: number[];
      if (Math.random() < crate) {
        const [c1, c2] = onePointCrossover(parent1, parent2);
        child = routeDistance(c1, D) < routeDistance(c2, D) ? c1 : c2;
      } else {
        child = parent1.slice();
      }
      if (Math.random() < mrate) child = mutateSwap(child);
      const childDist = routeDistance(child, D);
      const worst = popEval[popEval.length - 1];
      if (childDist < worst.dist) {
        popEval[popEval.length - 1] = { dist: childDist, ind: child };
        popEval.sort((a, b) => a.dist - b.dist);
      }
      const best = popEval[0];
      bestRef.current = { dist: best.dist, route: best.ind.slice() };
      setHistory((h) => [...h, best.dist]);
      if (gen % 5 === 0) {
        setLog((l) => [...l, `Gen ${gen}: best=${best.dist}`]);
        await new Promise((r) => setTimeout(r, 8));
      }
      if (best.dist <= TERMINATION_DISTANCE) break;
    }

    const finalBest = popEval[0];
    bestRef.current = { dist: finalBest.dist, route: finalBest.ind.slice() };
    setLog((l) => [...l, `Finished gen ${gen}: best=${finalBest.dist}`]);
    setRunning(false);
  }

  function stop() {
    stopRequested.current = true;
    setRunning(false);
  }

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement, MouseEvent>) {
    if (dragging.current !== null) return;
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const loc = pt.matrixTransform(ctm.inverse());
    if (mode !== 'custom') return;
    const newNode: Node = { id: nextId.current++, x: loc.x, y: loc.y, label: String(nextId.current) };
    setNodes((ns) => [...ns, newNode]);
  }

  function startDrag(id: number) {
    dragging.current = id;
  }
  function onMouseMove(e: React.MouseEvent) {
    if (dragging.current === null) return;
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = (e as any).clientX;
    pt.y = (e as any).clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const loc = pt.matrixTransform(ctm.inverse());
    setNodes((ns) => ns.map((n) => (n.id === dragging.current ? { ...n, x: loc.x, y: loc.y } : n)));
  }
  function endDrag() {
    dragging.current = null;
  }

  const Dmatrix = computeDistanceMatrix(nodes);
  const best = bestRef.current;

  function routePoints(route?: number[]) {
    if (!route || nodes.length === 0) return "";
    const safeRoute = route.filter((idx) => idx >= 0 && idx < nodes.length);
    if (safeRoute.length === 0) return "";
    const pts = safeRoute.concat([safeRoute[0]]).map((idx) => `${nodes[idx].x},${nodes[idx].y}`);
    return pts.join(" ");
  }

  function clearAll() {
    setNodes([]);
    nextId.current = 0;
    setLog([]);
    setHistory([]);
    bestRef.current = null;
  }

  function loadAssignmentCities() {
    const w = 800;
    const h = 500;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.35;
    const n = ASSIGNMENT_CITIES.length;
    const newNodes: Node[] = ASSIGNMENT_CITIES.map((name, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      const id = nextId.current++;
      return { id, x, y, label: name };
    });
    setNodes(newNodes);
    setMode('sample');
    setLog((l) => [...l, 'Loaded assignment cities (circular sample).']);
  }

  function loadAssignmentCitiesMatrixLayout() {
    const coords: [number, number][] = [
      [60, 40],
      [140, 60],
      [220, 90],
      [300, 120],
      [380, 150],
      [460, 180],
      [540, 210],
      [420, 240],
      [300, 280],
      [180, 320],
      [80, 360],
    ];

    const newNodes: Node[] = ASSIGNMENT_CITIES.map((name, i) => {
      const id = nextId.current++;
      const [x, y] = coords[i] || [100 + i * 20, 100 + i * 20];
      return { id, x, y, label: name };
    });
    setNodes(newNodes);
    setMode('sample');
    setLog((l) => [...l, 'Loaded assignment cities (matrix layout).']);
  }

  function startFromScratch() {
    clearAll();
    setMode('custom');
    setLog((l) => [...l, 'Started from scratch: click canvas to add nodes.']);
  }

  function renderDistanceTable() {
    if (nodes.length === 0) return null;
    return (
      <div className="overflow-auto text-xs max-h-200 max-w-7xl bg-white">


        <table className="table-auto text-xs">
          <thead>
            <tr>
              <th></th>
              {nodes.map((n) => (
                <th key={n.id}>{n.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {nodes.map((row, i) => (
              <tr key={row.id}>
                <td className="pr-5">{row.label}</td>
                {nodes.map((col, j) => (
                  <td key={col.id} className="px-5">{Dmatrix[i][j]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-7xl mx-auto bg-white">
      <h1 className="text-xl font-bold mb-3">Traveling Salesman Problem solving using Genetic Algorithm</h1>
      <h2 className="text-l font-bold mb-3">Yavuz Selim Sahin</h2>
      <h3 className="mb-3">Heuristic Algorithms Course given by Assoc. Prof. Dr. Didem Abidin</h3>


      <div className="flex gap-4">
                {/* Top settings bar */}
<div className="fixed right-4 top-1/2 -translate-y-1/2 z-50 w-60 bg-white/80 backdrop-blur-sm border border-gray-200 rounded shadow-md p-3 flex flex-col gap-3">

  {/* Header */}
  <div className="flex items-center gap-2 border-b pb-2">
    <Settings className="w-5 h-5 text-black" />
    <span className="font-medium text-gray-700 text-sm">Settings</span>
  </div>

  {/* Parameters */}
  <div className="flex flex-col gap-2">
    <div className="flex items-center justify-between">
      <label className="text-xs text-gray-600">Crossover</label>
      <select
        value={String(crate)}
        onChange={(e) => setCrate(Number(e.target.value))}
        className="text-sm border rounded px-2 py-1 w-20"
      >
        <option value={0.85}>0.85</option>
        <option value={0.9}>0.90</option>
        <option value={0.95}>0.95</option>
      </select>
    </div>

    <div className="flex items-center justify-between">
      <label className="text-xs text-gray-600">Mutation</label>
      <select
        value={String(mrate)}
        onChange={(e) => setMrate(Number(e.target.value))}
        className="text-sm border rounded px-2 py-1 w-20"
      >
        <option value={0.1}>0.10</option>
        <option value={0.15}>0.15</option>
        <option value={0.2}>0.20</option>
      </select>
    </div>

    <div className="flex items-center justify-between">
      <label className="text-xs text-gray-600">Pop</label>
      <input
        type="number"
        value={popSize}
        onChange={(e) => setPopSize(Number(e.target.value))}
        className="w-20 text-sm border rounded px-2 py-1"
      />
    </div>

    <div className="flex items-center justify-between">
      <label className="text-xs text-gray-600">Gens</label>
      <input
        type="number"
        value={maxGen}
        onChange={(e) => setMaxGen(Number(e.target.value))}
        className="w-20 text-sm border rounded px-2 py-1"
      />
    </div>
  </div>

  {/* Actions */}
  <div className="flex flex-col gap-2 mt-2">
    <button
      onClick={loadAssignmentCities}
      className="flex items-center gap-2 px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700 w-full justify-center"
    >
      <Database className="w-4 h-4" /> Load
    </button>

    {/* <button
      onClick={loadAssignmentCitiesMatrixLayout}
      className="flex items-center gap-2 px-3 py-1 rounded bg-green-400 text-black hover:bg-green-500 w-full justify-center"
    >
      <Shuffle className="w-4 h-4" /> Matrix
    </button> */}

    <button
      onClick={startFromScratch}
      className="flex items-center gap-2 px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 w-full justify-center"
    >
      <RefreshCw className="w-4 h-4" /> Scratch
    </button>

    <button
      onClick={clearAll}
      className="flex items-center gap-2 px-3 py-1 rounded bg-red-200 hover:bg-red-300 w-full justify-center"
    >
      <Trash2 className="w-4 h-4" /> Clear
    </button>

    <button
      disabled={running}
      onClick={runGA}
      className="flex items-center gap-2 px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 w-full justify-center"
    >
      <Play className="w-4 h-4" /> Run
    </button>

    <button
      disabled={!running}
      onClick={stop}
      className="flex items-center gap-2 px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 w-full justify-center"
    >
      <Square className="w-4 h-4" /> Stop
    </button>
  </div>
</div>
        <div className="flex-1">
          <svg
            ref={svgRef}
            onClick={handleSvgClick}
            onMouseMove={onMouseMove}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            className="border bg-white"
            width={800}
            height={500}
            style={{ touchAction: "none" }}
          >
            {best && nodes.length > 0 && (() => {
              const route = best.route || [];
              const safeRoute = route.filter((idx) => idx >= 0 && idx < nodes.length);
              if (safeRoute.length === 0) return null;
              const lines = [] as any[];
              const n = safeRoute.length;
              for (let i = 0; i < n; i++) {
                const a = nodes[safeRoute[i]];
                const b = nodes[safeRoute[(i + 1) % n]];
                lines.push(
                  <line
                    key={`edge-${i}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="orange"
                    strokeWidth={3}
                    strokeOpacity={0.85}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              }
              const pts = safeRoute.concat([safeRoute[0]]).map((idx) => `${nodes[idx].x},${nodes[idx].y}`).join(" ");
              return (
                <g>
                  {lines}
                  <polyline points={pts} fill="none" stroke="transparent" strokeWidth={3} />
                </g>
              );
            })()}
            {/* Draw nodes */}
            {nodes.map((n) => (
              <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
                <circle
                  r={24}
                  fill="#2563eb"
                  stroke="#1e40af"
                  strokeWidth={2}
                  onMouseDown={(ev) => {
                    ev.stopPropagation();
                    startDrag(n.id);
                  }}
                />
                <text x={0} y={4} textAnchor="middle" fontSize={10} fill="white">
                  {n.label}
                </text>
              </g>
            ))}
          </svg>

          <div className="mt-2 text-sm text-black-600">Click on the canvas to add a node (only in "Start from scratch" mode). Drag nodes to reposition. The Assignment cities uses Euclidean distances between nodes.</div>

   <div className="p-2 border rounded mb-2">
            <h3 className="font-semibold">History (best per step)</h3>
            <div className="max-h-48 overflow-auto text-xs p-2 bg-white border rounded">
              {history.length === 0 ? <div className="text-black-500">No history</div> : (
                <ol>
                  {history.map((h, i) => <li key={i}>Step {i+1}: {h}</li>)}
                </ol>
              )}
            </div>
          </div>




          <div className="mt-4 p-2 border rounded">
            <h3 className="font-semibold">Distance matrix</h3>
            {renderDistanceTable()}
          </div>
        </div>

        <div style={{ width: 360 }}>
          <div className="p-2 border rounded mb-2">
            <h3 className="font-semibold">How to use</h3>
            <ol className="text-sm mt-1 list-decimal list-inside">
              <li>Load assignment cities to start with the 11 real cities.</li>
              <li>Or choose "Start from scratch" and click the canvas to add custom nodes.</li>
              <li>Drag nodes to reposition and click <strong>Run GA</strong> to optimize.</li>
            </ol>
          </div>

       
            <div className="p-4 border rounded shadow-sm bg-white/80 backdrop-blur-sm">
    <h3 className="font-semibold text-lg flex items-center gap-2">
      Best Found
    </h3>

    <div className="mt-2 text-sm">
      {bestRef.current ? (
        <>
          <div>
            Distance: <strong>{bestRef.current.dist}</strong>
          </div>
          <div className="mt-1">
            Route:{" "}
          <span className="break-words">
  {(() => {
    const route = bestRef.current?.route ?? [];
    if (route.length === 0) return "";
    // güvenlik: sadece geçerli indeksleri al
    const safe = route.filter((idx) => typeof idx === "number" && idx >= 0 && idx < nodes.length);
    // eğer son eleman ilk eleman değilse, döngüyü tamamlamak için ilk elemanı ekle
    const closed = safe.length > 0 && safe[safe.length - 1] === safe[0] ? safe : safe.concat([safe[0]]);
    return closed.map((i) => nodes[i]?.label ?? i).join(" -> ");
  })()}
</span>

          </div>
        </>
      ) : (
        <div className="text-gray-500 italic">No result yet</div>
      )}

      <h4 className="mt-4 font-medium flex items-center gap-2">
        <RefreshCw className="w-4 h-4" /> Logs
      </h4>

      <div className="max-h-40 overflow-auto text-xs bg-gray-50 p-2 mt-1 border rounded">
        {log.length === 0 ? (
          <div className="text-gray-400 italic">(no logs)</div>
        ) : (
          log.map((l, i) => <div key={i}>{l}</div>)
        )}
      </div>
    </div>
  </div>
        </div>
      </div>
    </div>
  );
}
