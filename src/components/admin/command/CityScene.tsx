"use client";

import React, { useRef, useMemo, useEffect, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Billboard, Line } from "@react-three/drei";
import * as THREE from "three";
import type { LiveSession, SessionStage } from "@/hooks/useLiveSessions";

/* ════════════════════════════════════════════════════════
   CONSTANTS
   ════════════════════════════════════════════════════════ */

const STAGE_ORDER: SessionStage[] = ["landing", "tickets", "add_to_cart", "checkout", "purchase"];

const STAGE_META: Record<SessionStage, { color: string; hex: number; index: number; label: string }> = {
  landing:     { color: "#8888a0", hex: 0x8888a0, index: 0, label: "VIEWS" },
  tickets:     { color: "#38BDF8", hex: 0x38bdf8, index: 1, label: "TICKETS" },
  add_to_cart: { color: "#FBBF24", hex: 0xfbbf24, index: 2, label: "CART" },
  checkout:    { color: "#8B5CF6", hex: 0x8b5cf6, index: 3, label: "CHECKOUT" },
  purchase:    { color: "#34D399", hex: 0x34d399, index: 4, label: "SOLD" },
};

/* Stage lane Z-positions (front to back in isometric view) */
const LANE_POSITIONS = [-8, -4, 0, 4, 8];
const LANE_WIDTH = 3.5;

/* ════════════════════════════════════════════════════════
   GROUND GRID
   ════════════════════════════════════════════════════════ */

function GroundGrid() {
  const gridRef = useRef<THREE.GridHelper>(null);

  useFrame(({ clock }) => {
    if (gridRef.current) {
      const mat = gridRef.current.material as THREE.Material;
      mat.opacity = 0.08 + Math.sin(clock.elapsedTime * 0.3) * 0.02;
    }
  });

  return (
    <gridHelper
      ref={gridRef}
      args={[60, 60, 0x8b5cf6, 0x8b5cf6]}
      position={[0, -0.01, 0]}
      material-transparent
      material-opacity={0.08}
    />
  );
}

/* ════════════════════════════════════════════════════════
   DISTRICT (Event Building)
   — Each event is a glowing tower. Height = activity.
   — Brighter glow when more sessions are active.
   ════════════════════════════════════════════════════════ */

interface DistrictProps {
  position: [number, number, number];
  eventName: string;
  sessions: number;
  maxSessions: number;
  sold: number;
  capacity: number;
  color: number;
  onClick?: () => void;
  isSelected: boolean;
}

function District({
  position,
  eventName,
  sessions,
  maxSessions,
  sold,
  capacity,
  color,
  onClick,
  isSelected,
}: DistrictProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const height = Math.max(0.5, (sessions / Math.max(maxSessions, 1)) * 5 + 0.5);
  const targetHeight = useRef(height);
  targetHeight.current = height;

  const intensity = Math.min(sessions / Math.max(maxSessions, 1), 1);
  const emissiveIntensity = 0.3 + intensity * 1.2;

  useFrame(({ clock }) => {
    if (!meshRef.current) return;

    // Smooth height transition
    const currentScale = meshRef.current.scale.y;
    const target = targetHeight.current;
    meshRef.current.scale.y = THREE.MathUtils.lerp(currentScale, target, 0.05);
    meshRef.current.position.y = (meshRef.current.scale.y * 0.5);

    // Breathing glow
    if (glowRef.current) {
      const breathe = 1 + Math.sin(clock.elapsedTime * 1.5 + position[0]) * 0.15;
      glowRef.current.scale.setScalar(1.3 * breathe);
      glowRef.current.position.y = meshRef.current.position.y;
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (0.06 + intensity * 0.12) * breathe;
    }
  });

  const threeColor = useMemo(() => new THREE.Color(color), [color]);
  const fillPct = capacity > 0 ? sold / capacity : 0;

  return (
    <group position={position}>
      {/* Base platform */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.2, 2.2]} />
        <meshBasicMaterial color={color} transparent opacity={0.06} />
      </mesh>

      {/* Building */}
      <mesh
        ref={meshRef}
        onClick={onClick}
        onPointerEnter={() => { setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerLeave={() => { setHovered(false); document.body.style.cursor = "default"; }}
      >
        <boxGeometry args={[1.6, 1, 1.6]} />
        <meshStandardMaterial
          color={threeColor}
          emissive={threeColor}
          emissiveIntensity={emissiveIntensity}
          metalness={0.8}
          roughness={0.3}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Glow volume */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.5, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.08} depthWrite={false} />
      </mesh>

      {/* Selection ring */}
      {(isSelected || hovered) && (
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.3, 1.5, 32]} />
          <meshBasicMaterial
            color={isSelected ? 0x8b5cf6 : color}
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Capacity bar (on the ground) */}
      {capacity > 0 && (
        <group position={[0, 0.04, 1.3]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.8, 0.1]} />
            <meshBasicMaterial color={0xffffff} transparent opacity={0.04} />
          </mesh>
          <mesh
            position={[-(1.8 * (1 - fillPct)) / 2, 0.001, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[1.8 * fillPct, 0.1]} />
            <meshBasicMaterial color={fillPct > 0.9 ? 0xf43f5e : 0x34d399} transparent opacity={0.5} />
          </mesh>
        </group>
      )}

      {/* Label */}
      <Billboard position={[0, Math.max(height, 0.5) + 1.2, 0]}>
        <Text
          fontSize={0.28}
          color="#e0e8ff"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.08}
          outlineWidth={0.02}
          outlineColor="#030306"
        >
          {eventName.length > 18 ? eventName.substring(0, 16) + "..." : eventName}
        </Text>
        <Text
          position={[0, -0.4, 0]}
          fontSize={0.2}
          color={STAGE_META.purchase.color}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.05}
          outlineWidth={0.01}
          outlineColor="#030306"
        >
          {sessions} live
        </Text>
      </Billboard>
    </group>
  );
}

/* ════════════════════════════════════════════════════════
   PARTICLE HIGHWAY
   — Streams of particles flowing between stage lanes.
   — GPU instanced mesh for performance.
   ════════════════════════════════════════════════════════ */

const MAX_PARTICLES = 600;
const PARTICLE_DUMMY = new THREE.Object3D();

interface ParticleData {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  stage: number;
  targetStage: number;
  life: number;
  maxLife: number;
  size: number;
}

function ParticleHighway({ sessions }: { sessions: LiveSession[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const particlesRef = useRef<ParticleData[]>([]);
  const colorArray = useRef(new Float32Array(MAX_PARTICLES * 3));

  // Initialize particles
  useEffect(() => {
    const particles: ParticleData[] = [];

    // Ambient particles (always flowing for visual life)
    for (let i = 0; i < 120; i++) {
      const stageIdx = Math.floor(Math.random() * 5);
      const laneZ = LANE_POSITIONS[stageIdx];
      particles.push({
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 20,
          0.15 + Math.random() * 0.3,
          laneZ + (Math.random() - 0.5) * LANE_WIDTH
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.3,
          0,
          0
        ),
        color: new THREE.Color(STAGE_META[STAGE_ORDER[stageIdx]].hex),
        stage: stageIdx,
        targetStage: stageIdx,
        life: Math.random() * 10,
        maxLife: 8 + Math.random() * 6,
        size: 0.04 + Math.random() * 0.03,
      });
    }

    particlesRef.current = particles;
  }, []);

  // Sync real sessions into particle system
  useEffect(() => {
    const particles = particlesRef.current;
    const existing = new Set(particles.filter(p => p.maxLife > 100).map(p => `session-${Math.round(p.life)}`));

    for (const session of sessions) {
      const stageIdx = STAGE_META[session.stage]?.index ?? 0;
      const hash = Math.abs(session.sessionId.split("").reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0));

      // Check if this session already has a particle (by hash)
      const existingParticle = particles.find(p => p.maxLife > 100 && Math.round(p.life) === hash % 100000);

      if (existingParticle) {
        // Update target stage
        existingParticle.targetStage = stageIdx;
        existingParticle.color.set(STAGE_META[session.stage].hex);
      } else if (particles.length < MAX_PARTICLES) {
        // Spawn new session particle
        const laneZ = LANE_POSITIONS[stageIdx];
        particles.push({
          position: new THREE.Vector3(
            (hash % 200 - 100) / 10,
            0.2 + Math.random() * 0.5,
            laneZ + (Math.random() - 0.5) * LANE_WIDTH * 0.6
          ),
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 0.15,
            0,
            0
          ),
          color: new THREE.Color(STAGE_META[session.stage].hex),
          stage: stageIdx,
          targetStage: stageIdx,
          life: hash % 100000,
          maxLife: 999, // permanent (session particle)
          size: 0.08 + Math.random() * 0.04,
        });
      }
    }
  }, [sessions]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const particles = particlesRef.current;
    const colors = colorArray.current;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (i < particles.length) {
        const p = particles[i];

        // Move along X (wandering)
        p.position.x += p.velocity.x * delta;
        p.position.y += Math.sin(p.life * 2 + p.position.x) * delta * 0.05;

        // Lane transition (smooth Z movement toward target)
        const targetZ = LANE_POSITIONS[p.targetStage];
        const zDiff = targetZ - p.position.z;
        if (Math.abs(zDiff) > 0.05) {
          p.position.z += zDiff * delta * 1.5;
          // When transitioning, rise slightly (highway arc)
          if (Math.abs(zDiff) > 1) {
            p.position.y += Math.abs(zDiff) * 0.01;
          }
        }
        p.stage = p.targetStage;

        // Boundary wrap (X axis)
        if (p.position.x > 14) p.position.x = -14;
        if (p.position.x < -14) p.position.x = 14;

        // Settle Y back to base
        const baseY = p.maxLife > 100 ? 0.25 : 0.15;
        p.position.y = THREE.MathUtils.lerp(p.position.y, baseY + Math.sin(p.life * 2) * 0.1, delta * 2);

        // Life
        if (p.maxLife <= 100) {
          p.life += delta;
          if (p.life > p.maxLife) {
            // Respawn ambient
            const stageIdx = Math.floor(Math.random() * 5);
            p.stage = stageIdx;
            p.targetStage = stageIdx;
            p.position.set(
              (Math.random() - 0.5) * 20,
              0.15 + Math.random() * 0.3,
              LANE_POSITIONS[stageIdx] + (Math.random() - 0.5) * LANE_WIDTH
            );
            p.color.set(STAGE_META[STAGE_ORDER[stageIdx]].hex);
            p.life = 0;
          }
        }

        // Size pulse for session particles
        const scale = p.maxLife > 100
          ? p.size * (1 + Math.sin(Date.now() * 0.003 + p.position.x) * 0.3)
          : p.size;

        PARTICLE_DUMMY.position.copy(p.position);
        PARTICLE_DUMMY.scale.setScalar(scale);
        PARTICLE_DUMMY.updateMatrix();
        meshRef.current.setMatrixAt(i, PARTICLE_DUMMY.matrix);

        colors[i * 3] = p.color.r;
        colors[i * 3 + 1] = p.color.g;
        colors[i * 3 + 2] = p.color.b;
      } else {
        // Hide unused
        PARTICLE_DUMMY.position.set(0, -100, 0);
        PARTICLE_DUMMY.scale.setScalar(0);
        PARTICLE_DUMMY.updateMatrix();
        meshRef.current.setMatrixAt(i, PARTICLE_DUMMY.matrix);
      }
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    const attr = meshRef.current.geometry.getAttribute("color");
    if (attr) {
      (attr.array as Float32Array).set(colors);
      attr.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_PARTICLES]}>
      <sphereGeometry args={[1, 8, 8]}>
        <instancedBufferAttribute
          attach="attributes-color"
          args={[colorArray.current, 3]}
        />
      </sphereGeometry>
      <meshBasicMaterial toneMapped={false} vertexColors transparent opacity={0.9} />
    </instancedMesh>
  );
}

/* ════════════════════════════════════════════════════════
   LANE MARKERS
   — Glowing strips on the ground showing funnel stages.
   ════════════════════════════════════════════════════════ */

function LaneMarkers() {
  return (
    <>
      {STAGE_ORDER.map((stage, i) => {
        const z = LANE_POSITIONS[i];
        const meta = STAGE_META[stage];
        return (
          <group key={stage}>
            {/* Lane strip */}
            <mesh position={[0, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[28, LANE_WIDTH]} />
              <meshBasicMaterial color={meta.hex} transparent opacity={0.015} />
            </mesh>

            {/* Lane edge lines */}
            <Line
              points={[[-14, 0.02, z - LANE_WIDTH / 2], [14, 0.02, z - LANE_WIDTH / 2]]}
              color={meta.color}
              lineWidth={0.5}
              transparent
              opacity={0.08}
            />
            <Line
              points={[[-14, 0.02, z + LANE_WIDTH / 2], [14, 0.02, z + LANE_WIDTH / 2]]}
              color={meta.color}
              lineWidth={0.5}
              transparent
              opacity={0.08}
            />

            {/* Stage label (far left) */}
            <Billboard position={[-15.5, 0.5, z]}>
              <Text
                fontSize={0.35}
                color={meta.color}
                anchorX="right"
                anchorY="middle"
                letterSpacing={0.15}
                outlineWidth={0.02}
                outlineColor="#030306"
              >
                {meta.label}
              </Text>
            </Billboard>
          </group>
        );
      })}
    </>
  );
}

/* ════════════════════════════════════════════════════════
   PURCHASE LIGHTNING
   — Full-scene flash when a purchase happens.
   ════════════════════════════════════════════════════════ */

function PurchaseLightning({ active }: { active: boolean }) {
  const lightRef = useRef<THREE.PointLight>(null);
  const flashRef = useRef(0);

  useEffect(() => {
    if (active) flashRef.current = 1;
  }, [active]);

  useFrame((_, delta) => {
    if (!lightRef.current) return;
    if (flashRef.current > 0) {
      flashRef.current = Math.max(0, flashRef.current - delta * 2.5);
      lightRef.current.intensity = flashRef.current * 8;
    } else {
      lightRef.current.intensity = 0;
    }
  });

  return (
    <pointLight
      ref={lightRef}
      position={[0, 10, 0]}
      color={0x34d399}
      intensity={0}
      distance={40}
      decay={2}
    />
  );
}

/* ════════════════════════════════════════════════════════
   PURCHASE SHOCKWAVE
   — Expanding ring on the ground plane.
   ════════════════════════════════════════════════════════ */

function PurchaseShockwave({ active, position }: { active: boolean; position: [number, number, number] }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const scaleRef = useRef(0);
  const opacityRef = useRef(0);

  useEffect(() => {
    if (active) {
      scaleRef.current = 0.1;
      opacityRef.current = 0.5;
    }
  }, [active]);

  useFrame((_, delta) => {
    if (!ringRef.current) return;
    if (opacityRef.current > 0) {
      scaleRef.current += delta * 12;
      opacityRef.current = Math.max(0, opacityRef.current - delta * 0.8);
      ringRef.current.scale.setScalar(scaleRef.current);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = opacityRef.current;
      ringRef.current.visible = true;
    } else {
      ringRef.current.visible = false;
    }
  });

  return (
    <mesh ref={ringRef} position={position} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.8, 1, 64]} />
      <meshBasicMaterial color={0x34d399} transparent opacity={0} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* ════════════════════════════════════════════════════════
   AMBIENT ATMOSPHERE
   — Fog, lighting, post-processing feel.
   ════════════════════════════════════════════════════════ */

function Atmosphere() {
  return (
    <>
      <ambientLight intensity={0.15} color={0x8888cc} />
      <directionalLight position={[10, 15, 10]} intensity={0.3} color={0xaaaadd} />
      <directionalLight position={[-8, 10, -5]} intensity={0.15} color={0x8b5cf6} />
      <fog attach="fog" args={[0x030306, 15, 50]} />
    </>
  );
}

/* ════════════════════════════════════════════════════════
   CAMERA CONTROLLER
   — Isometric-style camera with smooth orbit controls.
   ════════════════════════════════════════════════════════ */

function CameraSetup({ selectedEvent }: { selectedEvent: string | null }) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const targetRef = useRef(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    // Set initial isometric-like camera position
    camera.position.set(18, 14, 18);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useFrame(() => {
    if (controlsRef.current) {
      // Smooth target movement when event selected
      const target = selectedEvent ? targetRef.current : new THREE.Vector3(0, 0, 0);
      controlsRef.current.target.lerp(target, 0.05);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.05}
      maxPolarAngle={Math.PI / 2.3}
      minPolarAngle={Math.PI / 6}
      minDistance={8}
      maxDistance={35}
      enablePan
      panSpeed={0.5}
    />
  );
}

/* ════════════════════════════════════════════════════════
   AUDIO ENGINE
   — Ambient hum + ka-ching on purchase.
   ════════════════════════════════════════════════════════ */

function useCommandAudio(purchaseActive: boolean, sessionCount: number) {
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const initRef = useRef(false);

  // Initialize on first user gesture
  const init = useCallback(() => {
    if (initRef.current) return;
    initRef.current = true;
    try {
      const ctx = new AudioContext();
      ctxRef.current = ctx;

      // Ambient drone (very subtle)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 55; // Low A
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gainRef.current = gain;

      // Secondary harmonic
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.value = 82.5; // E above
      gain2.gain.value = 0;
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start();
    } catch {
      // Audio not available
    }
  }, []);

  // Set ambient volume based on session count
  useEffect(() => {
    if (!gainRef.current) return;
    const targetVol = Math.min(sessionCount / 50, 1) * 0.03; // Very subtle
    gainRef.current.gain.linearRampToValueAtTime(targetVol, (ctxRef.current?.currentTime || 0) + 0.5);
  }, [sessionCount]);

  // Ka-ching on purchase
  useEffect(() => {
    if (!purchaseActive || !ctxRef.current) return;
    const ctx = ctxRef.current;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.05);
      osc.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      // Audio not available
    }
  }, [purchaseActive]);

  return init;
}

/* ════════════════════════════════════════════════════════
   MAIN SCENE
   ════════════════════════════════════════════════════════ */

export interface CitySceneProps {
  sessions: LiveSession[];
  topEvents: { eventName: string; eventSlug: string; views: number; sales: number; revenue: number }[];
  eventCapacity: Record<string, { sold: number; capacity: number }>;
  purchaseFlash: boolean;
  selectedEvent: string | null;
  onSelectEvent: (slug: string | null) => void;
}

export function CityScene({
  sessions,
  topEvents,
  eventCapacity,
  purchaseFlash,
  selectedEvent,
  onSelectEvent,
}: CitySceneProps) {
  // Build per-event session counts
  const eventSessionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of sessions) {
      if (s.eventSlug) counts[s.eventSlug] = (counts[s.eventSlug] || 0) + 1;
    }
    return counts;
  }, [sessions]);

  const maxEventSessions = useMemo(() => {
    return Math.max(1, ...Object.values(eventSessionCounts));
  }, [eventSessionCounts]);

  // Assign event positions (spread along the X axis)
  const eventPositions = useMemo(() => {
    const positions: Record<string, [number, number, number]> = {};
    const count = Math.min(topEvents.length, 8);
    const spacing = 5;
    const startX = -((count - 1) * spacing) / 2;
    topEvents.slice(0, 8).forEach((ev, i) => {
      positions[ev.eventSlug] = [startX + i * spacing, 0, -12];
    });
    return positions;
  }, [topEvents]);

  // District colors cycle through event-specific colors
  const districtColors = useMemo(() => {
    const palette = [0x8b5cf6, 0x38bdf8, 0x34d399, 0xfbbf24, 0xf43f5e, 0xa78bfa, 0x06b6d4, 0xf97316];
    const map: Record<string, number> = {};
    topEvents.forEach((ev, i) => {
      map[ev.eventSlug] = palette[i % palette.length];
    });
    return map;
  }, [topEvents]);

  return (
    <Canvas
      camera={{ position: [18, 14, 18], fov: 45, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      style={{ background: "#030306" }}
      dpr={[1, 2]}
    >
      <Atmosphere />
      <CameraSetup selectedEvent={selectedEvent} />
      <GroundGrid />
      <LaneMarkers />
      <ParticleHighway sessions={sessions} />

      {/* Event districts */}
      {topEvents.slice(0, 8).map((ev) => {
        const pos = eventPositions[ev.eventSlug];
        if (!pos) return null;
        const cap = eventCapacity[ev.eventSlug] || { sold: 0, capacity: 0 };
        return (
          <District
            key={ev.eventSlug}
            position={pos}
            eventName={ev.eventName}
            sessions={eventSessionCounts[ev.eventSlug] || 0}
            maxSessions={maxEventSessions}
            sold={cap.sold}
            capacity={cap.capacity}
            color={districtColors[ev.eventSlug] || 0x8b5cf6}
            onClick={() => onSelectEvent(selectedEvent === ev.eventSlug ? null : ev.eventSlug)}
            isSelected={selectedEvent === ev.eventSlug}
          />
        );
      })}

      {/* Purchase effects */}
      <PurchaseLightning active={purchaseFlash} />
      <PurchaseShockwave active={purchaseFlash} position={[0, 0.05, 0]} />
    </Canvas>
  );
}
