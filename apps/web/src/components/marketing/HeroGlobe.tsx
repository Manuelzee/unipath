/**
 * The home page's rotating globe, drawn with three.js. Continents come from
 * Natural Earth (world-atlas, public domain) painted onto the sphere in the
 * app's mint and teal palette. Loaded lazily, so three.js only downloads on
 * the home page; without WebGL the CSS globe passed as `fallback` is shown.
 * Respects prefers-reduced-motion and pauses while off screen.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { feature } from 'topojson-client';
import landTopology from 'world-atlas/land-110m.json';

const COLORS = {
  ocean: '#d6eee7', grid: 'rgba(62, 136, 126, 0.2)', land: '#72b6a6', coast: '#4f978a',
  glow: '#8fd6c5', marker: '#df9f58',
};
// The cities on the hero's labels: London, Toronto, Singapore.
const MARKERS: Array<[lat: number, lon: number]> = [[51.5, -0.13], [43.65, -79.38], [1.35, 103.82]];
const SPIN_PER_SECOND = 0.14;
const TILT = new THREE.Euler(0.36, 0, -0.2);

type Ring = number[][];
type Geometry = { type: string; coordinates?: unknown; geometries?: Geometry[] };

/** Every polygon (outer ring + holes) in a GeoJSON geometry. */
function polygons(geometry: Geometry): Ring[][] {
  if (geometry.type === 'Polygon') return [geometry.coordinates as Ring[]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as Ring[][];
  if (geometry.type === 'GeometryCollection') return (geometry.geometries ?? []).flatMap(polygons);
  return [];
}

/** An equirectangular map texture: ocean, a 30° graticule and the continents. */
function mapTexture(): HTMLCanvasElement {
  const width = 2048, height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const x = (lon: number) => (lon + 180) / 360 * width;
  const y = (lat: number) => (90 - lat) / 180 * height;

  ctx.fillStyle = COLORS.ocean;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 2;
  for (let lon = -180; lon <= 180; lon += 30) { ctx.beginPath(); ctx.moveTo(x(lon), 0); ctx.lineTo(x(lon), height); ctx.stroke(); }
  for (let lat = -60; lat <= 60; lat += 30) { ctx.beginPath(); ctx.moveTo(0, y(lat)); ctx.lineTo(width, y(lat)); ctx.stroke(); }

  const topology = landTopology as unknown as Parameters<typeof feature>[0];
  const land = feature(topology, (topology.objects as Record<string, Parameters<typeof feature>[1]>).land) as unknown as
    { type: string; geometry?: Geometry; features?: Array<{ geometry: Geometry }> };
  const shapes = land.features ? land.features.flatMap(f => polygons(f.geometry)) : land.geometry ? polygons(land.geometry) : [];
  ctx.fillStyle = COLORS.land;
  ctx.strokeStyle = COLORS.coast;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  for (const rings of shapes) {
    ctx.beginPath();
    for (const ring of rings) ring.forEach(([lon, lat], i) => i ? ctx.lineTo(x(lon), y(lat)) : ctx.moveTo(x(lon), y(lat)));
    ctx.fill('evenodd');
    ctx.stroke();
  }
  return canvas;
}

/** A point on the unit sphere matching three.js SphereGeometry's texture layout. */
function onSphere(lat: number, lon: number, radius: number) {
  const phi = (lon + 180) / 360 * Math.PI * 2;
  const theta = (90 - lat) / 180 * Math.PI;
  return new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)).multiplyScalar(radius);
}

export default function HeroGlobe({ fallback }: { fallback: ReactNode }) {
  const holder = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = holder.current, canvas = canvasRef.current;
    if (!container || !canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0, 4.3);

    const texture = new THREE.CanvasTexture(mapTexture());
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const tilt = new THREE.Group();
    tilt.rotation.copy(TILT);
    const spin = new THREE.Group();
    // Start with Africa and Europe facing the viewer.
    spin.rotation.y = -Math.PI / 2 - 0.35;
    tilt.add(spin);
    scene.add(tilt);

    const sphereGeometry = new THREE.SphereGeometry(1, 96, 64);
    const sphereMaterial = new THREE.MeshLambertMaterial({ map: texture });
    spin.add(new THREE.Mesh(sphereGeometry, sphereMaterial));

    const markerGeometry = new THREE.SphereGeometry(0.024, 16, 12);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: COLORS.marker });
    for (const [lat, lon] of MARKERS) {
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(onSphere(lat, lon, 1.006));
      spin.add(marker);
    }

    // Soft mint halo around the globe.
    const glowGeometry = new THREE.SphereGeometry(1.13, 64, 48);
    const glowMaterial = new THREE.ShaderMaterial({
      uniforms: { glowColor: { value: new THREE.Color(COLORS.glow) } },
      vertexShader: 'varying vec3 vNormal; void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 glowColor; varying vec3 vNormal; void main() { float i = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0); gl_FragColor = vec4(glowColor, clamp(i, 0.0, 1.0) * 0.85); }',
      side: THREE.BackSide, transparent: true, depthWrite: false,
    });
    scene.add(new THREE.Mesh(glowGeometry, glowMaterial));

    scene.add(new THREE.HemisphereLight(0xffffff, 0xa9d8cd, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.25);
    sun.position.set(-2.6, 2.2, 3.4);
    scene.add(sun);

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();
    setReady(true);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, last = 0, visible = true, velocity = 0, dragging = false, dragX = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      if (!dragging) {
        // Drag momentum fades back to the steady spin.
        velocity *= Math.pow(0.04, dt);
        spin.rotation.y += ((reducedMotion.matches ? 0 : SPIN_PER_SECOND) + velocity) * dt;
      }
      renderer.render(scene, camera);
      // With reduced motion the globe stays still and redraws only while dragged.
      const moving = !reducedMotion.matches || dragging || Math.abs(velocity) > 0.002;
      frame = visible && moving ? requestAnimationFrame(tick) : 0;
    };
    const start = () => { if (!frame) { last = 0; frame = requestAnimationFrame(tick); } };
    const stop = () => { cancelAnimationFrame(frame); frame = 0; };
    const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) start(); else stop(); });
    visibility.observe(container);
    start();

    const onDown = (e: PointerEvent) => { dragging = true; dragX = e.clientX; velocity = 0; container.setPointerCapture(e.pointerId); start(); };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const delta = (e.clientX - dragX) / container.clientWidth * Math.PI;
      dragX = e.clientX;
      spin.rotation.y += delta;
      velocity = delta * 30;
    };
    const onUp = (e: PointerEvent) => { dragging = false; if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId); };
    container.addEventListener('pointerdown', onDown);
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerup', onUp);
    container.addEventListener('pointercancel', onUp);

    return () => {
      stop();
      visibility.disconnect();
      resizeObserver.disconnect();
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp);
      for (const item of [sphereGeometry, sphereMaterial, markerGeometry, markerMaterial, glowGeometry, glowMaterial, texture]) item.dispose();
      renderer.dispose();
    };
  }, []);

  if (failed) return <>{fallback}</>;
  return <div className={`globe-3d${ready ? ' globe-3d-ready' : ''}`} ref={holder} data-testid="hero-globe">
    <canvas ref={canvasRef} aria-hidden="true"/>
  </div>;
}
