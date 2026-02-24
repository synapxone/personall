import React, { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stage, Float, Environment, useGLTF } from '@react-three/drei';
import type { BodyMetrics } from '../lib/bodyComposition';
import type { Gender } from '../types';
import * as THREE from 'three';

interface Props {
    metrics: BodyMetrics;
    gender: Gender;
}

const MODEL_URL = './assets/male__female_base_mesh_pack.glb';

const BodyMesh: React.FC<Props> = ({ metrics, gender }) => {
    const { nodes, error } = useGLTF(MODEL_URL) as any;
    const meshRef = useRef<THREE.Group>(null);
    const isMale = gender === 'male' || gender === 'other';

    if (error) {
        console.error('Error loading 3D model:', error);
        return null;
    }

    if (!nodes) return null;

    // Scales for morphing
    const s = metrics.shoulderScale; // width of top
    const w = metrics.waistScale;    // width of center
    const m = metrics.muscularity;   // muscularity (0 to 1)

    // ANATOMICAL SCALING LOGIC
    // X = Width, Y = Height, Z = Depth (Belly)

    // Width (X): 
    const scaleX = isMale
        ? Math.max(s * (1.1 + m * 0.1), w * 1.05)
        : w * 1.35; // Broadens hips significantly for female representation

    // Depth (Z - "Belly/Mass"): 
    const bellyFactor = (w > 1.15 && m < 0.5) ? (w - 1.15) * 2.0 : 0;
    const baseDepth = isMale ? 1.05 : 0.95;
    const scaleZ = (baseDepth * w) + bellyFactor;
    const scaleY = 1.0;

    // Animation loop for subtle breathing/movement
    useFrame((state) => {
        if (!meshRef.current) return;
        meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.15;
    });

    const maleNodes = Object.values(nodes).filter((n: any) => n && n.isMesh && (n.name.toLowerCase().includes('male') && !n.name.toLowerCase().includes('female')));
    const femaleNodes = Object.values(nodes).filter((n: any) => n && n.isMesh && n.name.toLowerCase().includes('female'));

    const activeNodes = isMale
        ? (maleNodes.length > 0 ? maleNodes : Object.values(nodes).filter((n: any) => n && n.isMesh).slice(0, 1))
        : (femaleNodes.length > 0 ? femaleNodes : Object.values(nodes).filter((n: any) => n && n.isMesh).slice(1, 2));

    if (activeNodes.length === 0) {
        return null;
    }

    return (
        <group ref={meshRef}>
            {activeNodes.map((node: any) => (
                <mesh
                    key={node.name}
                    geometry={node.geometry}
                    scale={[scaleX, scaleY, scaleZ]}
                >
                    <meshStandardMaterial
                        color="#00ed64"
                        roughness={0.4}
                        metalness={0.25}
                        emissive="#00ed64"
                        emissiveIntensity={0.05 + m * 0.25}
                    />
                </mesh>
            ))}
        </group>
    );
};

export const ThreeBodyVisualizer: React.FC<Props> = (props) => {
    return (
        <div className="w-full h-[350px] relative rounded-3xl overflow-hidden bg-gradient-to-b from-card to-bg-main border border-white/5 shadow-2xl">
            <Canvas
                shadows={{ type: THREE.PCFShadowMap }}
                camera={{ position: [0, 0, 5], fov: 40 }}
                gl={{
                    antialias: true,
                    alpha: true,
                    powerPreference: "high-performance",
                    preserveDrawingBuffer: true
                }}
                dpr={[1, 2]} // Limit pixel ratio for performance
            >
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} intensity={1} castShadow />

                <Suspense fallback={null}>
                    <Stage environment="city" intensity={0.5}>
                        <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.4}>
                            <BodyMesh {...props} />
                        </Float>
                    </Stage>
                </Suspense>

                <OrbitControls enableZoom={false} enablePan={false} minPolarAngle={Math.PI / 2.2} maxPolarAngle={Math.PI / 1.8} />
                <Environment preset="night" />
            </Canvas>

            <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none">
                <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-full px-3 py-1 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-[10px] font-bold text-white tracking-widest uppercase">3D REALTIME</span>
                </div>
            </div>
        </div>
    );
};

useGLTF.preload(MODEL_URL);
